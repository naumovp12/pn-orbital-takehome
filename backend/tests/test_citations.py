"""Unit tests for the LLM citation contract (Part 2, Step 1).

These are pure tests: no network, no database. They cover the parsing of the
model's ``===CITATIONS===`` block and the streaming filter that keeps that block
hidden from the user.
"""

from __future__ import annotations

from takehome.services.llm import (
    CITATION_BLOCK_END,
    CITATION_DELIMITER,
    CitationStreamFilter,
    RawCitation,
    parse_citations,
)


def _stream_through_filter(chunks: list[str]) -> str:
    """Feed chunks through a fresh filter and return everything it surfaced."""
    f = CitationStreamFilter()
    out = "".join(f.feed(c) for c in chunks)
    out += f.finalize()
    return out


# --------------------------------------------------------------------------- #
# parse_citations
# --------------------------------------------------------------------------- #


def test_parse_citations_happy_path() -> None:
    raw = (
        "The term is 10 years.\n"
        f"{CITATION_DELIMITER}\n"
        '[{"document": "lease.pdf", "quote": "The term is ten (10) years."},'
        ' {"document": "lease.pdf", "quote": "commencing on 1 January 2024"}]'
    )
    prose, citations = parse_citations(raw)

    assert prose == "The term is 10 years."
    assert citations == [
        RawCitation(document="lease.pdf", quote="The term is ten (10) years."),
        RawCitation(document="lease.pdf", quote="commencing on 1 January 2024"),
    ]


def test_parse_citations_no_delimiter_returns_empty() -> None:
    prose, citations = parse_citations("Just a plain answer with no citations.")
    assert prose == "Just a plain answer with no citations."
    assert citations == []


def test_parse_citations_empty_array() -> None:
    abstain = "I couldn't find this in your documents."
    raw = f"{abstain}\n{CITATION_DELIMITER}\n[]"
    prose, citations = parse_citations(raw)
    assert prose == abstain
    assert citations == []


def test_parse_citations_malformed_json_is_forgiving() -> None:
    raw = f"Answer text.\n{CITATION_DELIMITER}\n[{{not valid json"
    prose, citations = parse_citations(raw)
    assert prose == "Answer text."
    assert citations == []


def test_parse_citations_strips_code_fence() -> None:
    raw = (
        "Answer text.\n"
        f"{CITATION_DELIMITER}\n"
        '```json\n[{"document": "a.pdf", "quote": "hello world"}]\n```'
    )
    prose, citations = parse_citations(raw)
    assert prose == "Answer text."
    assert citations == [RawCitation(document="a.pdf", quote="hello world")]


def test_parse_citations_strips_closing_tag() -> None:
    raw = (
        "Answer text.\n"
        f"{CITATION_DELIMITER}\n"
        '[{"document": "a.pdf", "quote": "hello world"}]\n'
        f"{CITATION_BLOCK_END}"
    )
    prose, citations = parse_citations(raw)
    assert prose == "Answer text."
    assert citations == [RawCitation(document="a.pdf", quote="hello world")]


def test_parse_citations_skips_items_with_missing_fields() -> None:
    raw = (
        "Answer.\n"
        f"{CITATION_DELIMITER}\n"
        '[{"document": "a.pdf", "quote": "valid"},'
        ' {"document": "a.pdf"},'
        ' {"quote": "orphan"},'
        ' "not an object",'
        ' {"document": "  ", "quote": "blank doc"}]'
    )
    _, citations = parse_citations(raw)
    assert citations == [RawCitation(document="a.pdf", quote="valid")]


def test_parse_citations_non_list_payload() -> None:
    raw = f'Answer.\n{CITATION_DELIMITER}\n{{"document": "a.pdf"}}'
    prose, citations = parse_citations(raw)
    assert prose == "Answer."
    assert citations == []


# --------------------------------------------------------------------------- #
# CitationStreamFilter
# --------------------------------------------------------------------------- #


def test_filter_hides_citation_block() -> None:
    raw = (
        "The rent is reviewed every five years."
        f"{CITATION_DELIMITER}"
        '[{"document": "lease.pdf", "quote": "reviewed every five years"}]'
    )
    # One big chunk
    assert _stream_through_filter([raw]) == "The rent is reviewed every five years."


def test_filter_handles_delimiter_split_across_chunks() -> None:
    # The delimiter is split right down the middle of two chunks.
    mid = len(CITATION_DELIMITER) // 2
    chunks = [
        "Answer body here",
        CITATION_DELIMITER[:mid],
        CITATION_DELIMITER[mid:],
        '[{"document": "a.pdf", "quote": "x"}]',
    ]
    assert _stream_through_filter(chunks) == "Answer body here"


def test_filter_passes_through_when_no_delimiter() -> None:
    chunks = ["Hello ", "there, ", "this is the whole answer."]
    assert _stream_through_filter(chunks) == "Hello there, this is the whole answer."


def test_filter_streams_incrementally() -> None:
    # Prose should be surfaced progressively, not only at finalize().
    f = CitationStreamFilter()
    first = f.feed("This is a fairly long sentence of prose. ")
    assert first != ""  # something was emitted before the stream ended
    rest = f.feed(f"more text{CITATION_DELIMITER}[]")
    rest += f.finalize()
    assert first + rest == "This is a fairly long sentence of prose. more text"
