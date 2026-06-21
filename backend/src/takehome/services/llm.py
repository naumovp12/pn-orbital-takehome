from __future__ import annotations

import json
from collections.abc import AsyncIterator
from dataclasses import dataclass
from typing import cast

from pydantic_ai import Agent

from takehome.config import settings  # noqa: F401 — triggers ANTHROPIC_API_KEY export

# Tags that wrap the machine-readable citation block, mirroring the <document>
# tags used in the prompt so it reads as part of the same markup convention.
CITATION_DELIMITER = "<citations>"
CITATION_BLOCK_END = "</citations>"

# Exact phrase the model must use when the documents don't contain the answer.
ABSTAIN_MESSAGE = "I couldn't find this in your documents."

agent = Agent(
    "anthropic:claude-haiku-4-5-20251001",
    system_prompt=(
        "You are a meticulous legal document assistant for commercial real estate "
        "lawyers doing due diligence. Verifiability matters more than anything: every "
        "claim you make must be traceable to the documents.\n\n"
        "GROUNDING RULES:\n"
        "- Answer ONLY using the content of the attached documents. Never rely on outside "
        "knowledge, assumptions, or general legal background.\n"
        "- A conversation may have several documents attached. Use all of them; when "
        "documents disagree, point that out and name each document.\n"
        "- If the documents do not contain the answer, respond with exactly this sentence "
        f"and nothing more before the citations block: \"{ABSTAIN_MESSAGE}\"\n"
        "- Never fabricate facts, clauses, figures, or document names.\n"
        "- Be concise and precise. Lawyers value accuracy over verbosity.\n\n"
        "OUTPUT FORMAT (follow exactly):\n"
        "1. First, write your answer in clear prose. Refer to documents by name where "
        "helpful.\n"
        f"2. Then, on a new line, open a {CITATION_DELIMITER} tag.\n"
        "3. Inside it, output a JSON array of the citations supporting your answer. "
        'Each item is an object: {"document": "<exact document name>", '
        '"quote": "<text copied verbatim from that document>"}.\n'
        f"4. Close the block with {CITATION_BLOCK_END}.\n"
        "- Quotes MUST be copied character-for-character from the document text: no "
        "paraphrasing, no ellipses, no edits. Keep each quote to a single sentence or "
        "clause, but long enough to be locatable.\n"
        "- Only cite documents that are actually attached. If you abstained or made no "
        "document-grounded claim, use an empty array [].\n"
        f"- Output nothing after {CITATION_BLOCK_END}.\n\n"
        "EXAMPLE (format only — never cite this example):\n"
        "The notice period is 30 days.\n"
        f"{CITATION_DELIMITER}\n"
        '[{"document": "agreement.pdf", "quote": "Either party may terminate on '
        'thirty (30) days written notice."}]\n'
        f"{CITATION_BLOCK_END}"
    ),
    model_settings={"temperature": 0.0},
)


@dataclass(frozen=True)
class RawCitation:
    """A citation as emitted by the model, before backend verification."""

    document: str
    quote: str


def _strip_code_fence(text: str) -> str:
    """Strip a leading ```json / ``` fence and trailing ``` if the model added one."""
    text = text.strip()
    if text.startswith("```"):
        newline = text.find("\n")
        if newline != -1:
            text = text[newline + 1 :]
        stripped = text.rstrip()
        if stripped.endswith("```"):
            text = stripped[:-3]
    return text.strip()


def parse_citations(raw: str) -> tuple[str, list[RawCitation]]:
    """Split a raw model response into (prose, citations).

    The prose is everything before ``CITATION_DELIMITER``. The citations are parsed
    from the JSON array after the delimiter. This is deliberately forgiving: a
    missing delimiter, malformed JSON, or unexpected shapes all yield an empty
    citation list rather than raising.
    """
    prose, sep, tail = raw.partition(CITATION_DELIMITER)
    prose = prose.strip()
    if not sep:
        return prose, []

    tail = tail.split(CITATION_BLOCK_END, 1)[0]
    tail = _strip_code_fence(tail)
    if not tail:
        return prose, []

    try:
        data = json.loads(tail)
    except (ValueError, json.JSONDecodeError):
        return prose, []

    if not isinstance(data, list):
        return prose, []

    citations: list[RawCitation] = []
    for item in cast("list[object]", data):
        if not isinstance(item, dict):
            continue
        entry = cast("dict[str, object]", item)
        document = entry.get("document")
        quote = entry.get("quote")
        if isinstance(document, str) and isinstance(quote, str):
            document = document.strip()
            quote = quote.strip()
            if document and quote:
                citations.append(RawCitation(document=document, quote=quote))
    return prose, citations


class CitationStreamFilter:
    """Incrementally surfaces only the prose portion of a streamed response.

    As deltas arrive, ``feed`` returns the next slice of prose that is safe to
    show the user, holding back any text from ``CITATION_DELIMITER`` onward. It
    also guards against the delimiter being split across chunk boundaries by
    withholding a small tail until more text arrives or ``finalize`` is called.
    """

    def __init__(self) -> None:
        self._raw = ""
        self._emitted = 0
        self._sealed = False

    def feed(self, delta: str) -> str:
        self._raw += delta
        if self._sealed:
            return ""

        idx = self._raw.find(CITATION_DELIMITER)
        if idx != -1:
            self._sealed = True
            prose = self._raw[:idx]
        else:
            # Hold back enough characters that a partial delimiter can't leak.
            holdback = len(CITATION_DELIMITER) - 1
            prose = self._raw[:-holdback] if len(self._raw) > holdback else ""

        out = prose[self._emitted :]
        self._emitted = len(prose)
        return out

    def finalize(self) -> str:
        """Flush any remaining prose once the stream is complete."""
        prose = self._raw.partition(CITATION_DELIMITER)[0]
        out = prose[self._emitted :]
        self._emitted = len(prose)
        return out


async def generate_title(user_message: str) -> str:
    """Generate a 3-5 word conversation title from the first user message."""
    result = await agent.run(
        f"Generate a concise 3-5 word title for a conversation that starts with: '{user_message}'. "
        "Return only the title, nothing else."
    )
    title = str(result.output).strip().strip('"').strip("'")
    # Truncate if too long
    if len(title) > 100:
        title = title[:97] + "..."
    return title


async def chat_with_document(
    user_message: str,
    documents: list[tuple[str, str]],
    conversation_history: list[dict[str, str]],
) -> AsyncIterator[str]:
    """Stream a response to the user's message, yielding text chunks.

    Builds a prompt that includes the content of every document attached to the
    conversation (each wrapped with its filename) plus the conversation history,
    then streams the response from the LLM.

    ``documents`` is a list of ``(filename, extracted_text)`` tuples.
    """
    # Build the full prompt with context
    prompt_parts: list[str] = []

    # Add document context if available
    if documents:
        plural = "documents" if len(documents) > 1 else "document"
        prompt_parts.append(
            f"The following {plural} are attached to this conversation. "
            "Use them to answer the question:\n"
        )
        for filename, text in documents:
            prompt_parts.append(
                f'<document name="{filename}">\n{text}\n</document>\n'
            )
    else:
        prompt_parts.append(
            "No documents have been uploaded yet. If the user asks about a document, "
            "let them know they need to upload one first.\n"
        )

    # Add conversation history
    if conversation_history:
        prompt_parts.append("Previous conversation:\n")
        for msg in conversation_history:
            role = msg["role"]
            content = msg["content"]
            if role == "user":
                prompt_parts.append(f"User: {content}\n")
            elif role == "assistant":
                prompt_parts.append(f"Assistant: {content}\n")
        prompt_parts.append("\n")

    # Add the current user message
    prompt_parts.append(f"User: {user_message}")

    # Reinforce the output contract last so it survives a long document context.
    prompt_parts.append(
        "\nReminder: write your prose answer, then a "
        f"{CITATION_DELIMITER}...{CITATION_BLOCK_END} block containing a JSON array of "
        '{"document", "quote"} objects with quotes copied verbatim from the '
        "documents above. Use [] if you abstained or made no document-grounded claim."
    )

    full_prompt = "\n".join(prompt_parts)

    async with agent.run_stream(full_prompt) as result:
        async for text in result.stream_text(delta=True):
            yield text
