"""Service-layer tests for multi-document support (services/document.py)."""

from __future__ import annotations

from pathlib import Path

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from takehome.config import settings
from takehome.db.models import Conversation, Document
from takehome.services.document import (
    MAX_DOCUMENTS_PER_CONVERSATION,
    delete_document,
    get_document,
    list_documents_for_conversation,
    upload_document,
)

from .conftest import make_upload


@pytest.fixture(autouse=True)
def isolated_upload_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """Write uploaded files into a throwaway directory."""
    monkeypatch.setattr(settings, "upload_dir", str(tmp_path))


async def _add_document(session: AsyncSession, conversation_id: str, filename: str) -> Document:
    """Insert a Document row directly (bypassing PDF extraction)."""
    doc = Document(
        conversation_id=conversation_id,
        filename=filename,
        file_path=f"/tmp/{filename}",
        extracted_text="text",
        page_count=1,
    )
    session.add(doc)
    await session.commit()
    await session.refresh(doc)
    return doc


async def test_multiple_documents_persist_for_one_conversation(
    session: AsyncSession, conversation: Conversation
) -> None:
    await upload_document(session, conversation.id, make_upload("a.pdf", "Alpha"))
    await upload_document(session, conversation.id, make_upload("b.pdf", "Bravo"))
    await upload_document(session, conversation.id, make_upload("c.pdf", "Charlie"))

    docs = await list_documents_for_conversation(session, conversation.id)
    assert len(docs) == 3
    assert {d.filename for d in docs} == {"a.pdf", "b.pdf", "c.pdf"}


async def test_list_documents_ordered_by_uploaded_at_ascending(
    session: AsyncSession, conversation: Conversation
) -> None:
    from datetime import datetime, timedelta

    base = datetime(2024, 1, 1, 12, 0, 0)
    # Insert out of chronological order to prove the query orders by uploaded_at.
    for name, offset in [("third.pdf", 2), ("first.pdf", 0), ("second.pdf", 1)]:
        doc = Document(
            conversation_id=conversation.id,
            filename=name,
            file_path=f"/tmp/{name}",
            extracted_text="text",
            page_count=1,
            uploaded_at=base + timedelta(minutes=offset),
        )
        session.add(doc)
    await session.commit()

    docs = await list_documents_for_conversation(session, conversation.id)
    assert [d.filename for d in docs] == ["first.pdf", "second.pdf", "third.pdf"]


async def test_upload_past_cap_raises_value_error(
    session: AsyncSession, conversation: Conversation
) -> None:
    for i in range(MAX_DOCUMENTS_PER_CONVERSATION):
        await _add_document(session, conversation.id, f"doc-{i}.pdf")

    with pytest.raises(ValueError, match="the limit"):
        await upload_document(session, conversation.id, make_upload("overflow.pdf"))

    # The failed upload did not add a row.
    docs = await list_documents_for_conversation(session, conversation.id)
    assert len(docs) == MAX_DOCUMENTS_PER_CONVERSATION


async def test_delete_document_removes_row_and_returns_true(
    session: AsyncSession, conversation: Conversation
) -> None:
    doc = await _add_document(session, conversation.id, "deletable.pdf")

    deleted = await delete_document(session, doc.id)
    assert deleted is True
    assert await get_document(session, doc.id) is None


async def test_delete_missing_document_returns_false(session: AsyncSession) -> None:
    assert await delete_document(session, "does-not-exist") is False
