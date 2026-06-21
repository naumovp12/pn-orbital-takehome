"""Unit tests for citation verification (Part 2, Step 2).

Pure tests: no database, no network. They cover matching a model-emitted citation
back to a document, deriving its page number, and dropping anything unverifiable.
"""

from __future__ import annotations

from takehome.services.citations import (
    SourceDocument,
    VerifiedCitation,
    verify_citations,
)
from takehome.services.llm import RawCitation

# A two-page document in the exact format the PDF extractor produces.
LEASE_TEXT = (
    "--- Page 1 ---\n"
    "This Lease is dated 1 January 2024 between the Landlord and the Tenant.\n"
    "The term of this lease is fifteen (15) years.\n\n"
    "--- Page 2 ---\n"
    "The tenant is Meridian Consulting Group LLP.\n"
    "Rent is reviewed every five years."
)

LEASE = SourceDocument(id="doc-1", filename="lease.pdf", text=LEASE_TEXT)


def _cite(document: str, quote: str) -> RawCitation:
    return RawCitation(document=document, quote=quote)


def test_verbatim_quote_resolves_to_correct_page() -> None:
    result = verify_citations(
        [_cite("lease.pdf", "The term of this lease is fifteen (15) years.")],
        [LEASE],
    )
    assert result == [
        VerifiedCitation(
            document_id="doc-1",
            filename="lease.pdf",
            page=1,
            quote="The term of this lease is fifteen (15) years.",
        )
    ]


def test_quote_on_second_page() -> None:
    result = verify_citations(
        [_cite("lease.pdf", "The tenant is Meridian Consulting Group LLP.")],
        [LEASE],
    )
    assert len(result) == 1
    assert result[0].page == 2


def test_whitespace_differences_still_match() -> None:
    # Model collapsed the newline / added extra spaces.
    result = verify_citations(
        [_cite("lease.pdf", "The   term of this   lease is fifteen (15) years.")],
        [LEASE],
    )
    assert len(result) == 1
    assert result[0].page == 1


def test_smart_quotes_and_case_differences_match() -> None:
    doc = SourceDocument(
        id="d",
        filename="a.pdf",
        text='--- Page 1 ---\nThe "Premises" means the demised property.',
    )
    # Curly quotes + different case.
    result = verify_citations(
        [_cite("a.pdf", "the \u201cpremises\u201d means the demised property.")],
        [doc],
    )
    assert len(result) == 1
    assert result[0].page == 1


def test_fabricated_quote_is_dropped() -> None:
    result = verify_citations(
        [_cite("lease.pdf", "The tenant may terminate at any time without notice.")],
        [LEASE],
    )
    assert result == []


def test_wrong_filename_is_dropped() -> None:
    result = verify_citations(
        [_cite("other.pdf", "The term of this lease is fifteen (15) years.")],
        [LEASE],
    )
    assert result == []


def test_duplicate_citations_are_collapsed() -> None:
    quote = "Rent is reviewed every five years."
    result = verify_citations(
        [_cite("lease.pdf", quote), _cite("lease.pdf", quote)],
        [LEASE],
    )
    assert len(result) == 1


def test_document_without_page_markers_defaults_to_page_one() -> None:
    doc = SourceDocument(id="d", filename="memo.pdf", text="A short memo with no markers.")
    result = verify_citations([_cite("memo.pdf", "A short memo with no markers.")], [doc])
    assert len(result) == 1
    assert result[0].page == 1


def test_mixed_valid_and_invalid_preserves_order() -> None:
    citations = [
        _cite("lease.pdf", "The tenant is Meridian Consulting Group LLP."),  # page 2
        _cite("lease.pdf", "This clause does not exist."),  # dropped
        _cite("lease.pdf", "The term of this lease is fifteen (15) years."),  # page 1
    ]
    result = verify_citations(citations, [LEASE])
    assert [c.page for c in result] == [2, 1]


def test_to_payload_shape() -> None:
    [citation] = verify_citations(
        [_cite("lease.pdf", "Rent is reviewed every five years.")],
        [LEASE],
    )
    assert citation.to_payload() == {
        "document_id": "doc-1",
        "filename": "lease.pdf",
        "page": 2,
        "quote": "Rent is reviewed every five years.",
    }
