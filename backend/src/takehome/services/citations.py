"""Verify model-emitted citations against the documents they claim to quote.

The LLM is asked to copy quotes verbatim, but small models drift: they paraphrase,
collapse whitespace, swap smart quotes, or cite the wrong file. This module is the
trust backstop behind the strict-grounding prompt. Every citation is checked against
the document's extracted text; anything we can't locate is dropped, and the page
number is derived from the ``--- Page N ---`` markers embedded at extraction time.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from takehome.services.llm import RawCitation

# Page markers injected by the PDF extractor (services/document.py).
_PAGE_MARKER = re.compile(r"---\s*Page\s+(\d+)\s*---")

# Common unicode punctuation the model tends to "tidy up" when quoting.
_PUNCT_MAP = {
    "\u2018": "'",
    "\u2019": "'",
    "\u201c": '"',
    "\u201d": '"',
    "\u2013": "-",
    "\u2014": "-",
    "\u00a0": " ",
}
_PUNCT_TABLE = str.maketrans(_PUNCT_MAP)


@dataclass(frozen=True)
class SourceDocument:
    """The minimal document data needed to verify a citation."""

    id: str
    filename: str
    text: str


@dataclass(frozen=True)
class VerifiedCitation:
    """A citation confirmed to exist in a known document, with its page number."""

    document_id: str
    filename: str
    page: int
    quote: str

    def to_payload(self) -> dict[str, object]:
        """Serialize for JSON storage / API responses."""
        return {
            "document_id": self.document_id,
            "filename": self.filename,
            "page": self.page,
            "quote": self.quote,
        }


def _normalize(text: str) -> str:
    """Collapse whitespace, normalize punctuation, and casefold for lenient matching."""
    text = text.translate(_PUNCT_TABLE)
    text = re.sub(r"\s+", " ", text)
    return text.strip().casefold()


def _segment_pages(text: str) -> list[tuple[int, str]]:
    """Split extracted text into ``(page_number, page_text)`` segments.

    If the text has no page markers (e.g. a single-page extraction), the whole
    thing is treated as page 1.
    """
    matches = list(_PAGE_MARKER.finditer(text))
    if not matches:
        return [(1, text)]

    segments: list[tuple[int, str]] = []
    for i, match in enumerate(matches):
        page = int(match.group(1))
        start = match.end()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
        segments.append((page, text[start:end]))
    return segments


def _locate_page(quote: str, text: str) -> int | None:
    """Return the page a quote appears on, or ``None`` if it can't be found.

    Tries a verbatim substring match first, then falls back to a whitespace- and
    punctuation-normalized match so legitimate quotes survive PDF formatting quirks.
    """
    segments = _segment_pages(text)

    # Verbatim first.
    for page, segment in segments:
        if quote in segment:
            return page

    # Normalized fallback.
    normalized_quote = _normalize(quote)
    if not normalized_quote:
        return None
    for page, segment in segments:
        if normalized_quote in _normalize(segment):
            return page

    return None


def verify_citations(
    raw_citations: list[RawCitation],
    documents: list[SourceDocument],
) -> list[VerifiedCitation]:
    """Filter raw citations down to those verifiably present in a known document.

    A citation is kept only if its ``document`` matches an attached document and its
    ``quote`` can be located in that document's text. Duplicates (same document,
    page, and quote) are collapsed. Order is preserved.
    """
    by_name: dict[str, SourceDocument] = {}
    for doc in documents:
        by_name.setdefault(_normalize(doc.filename), doc)

    verified: list[VerifiedCitation] = []
    seen: set[tuple[str, int, str]] = set()
    for citation in raw_citations:
        doc = by_name.get(_normalize(citation.document))
        if doc is None:
            continue
        page = _locate_page(citation.quote, doc.text)
        if page is None:
            continue
        key = (doc.id, page, _normalize(citation.quote))
        if key in seen:
            continue
        seen.add(key)
        verified.append(
            VerifiedCitation(
                document_id=doc.id,
                filename=doc.filename,
                page=page,
                quote=citation.quote,
            )
        )
    return verified
