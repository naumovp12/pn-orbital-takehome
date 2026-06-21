"""Router-level tests for multi-document endpoints (web/routers)."""

from __future__ import annotations

from pathlib import Path

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from takehome.config import settings
from takehome.db.models import Conversation, Document
from takehome.services.document import MAX_DOCUMENTS_PER_CONVERSATION

from .conftest import make_pdf_bytes


@pytest.fixture(autouse=True)
def isolated_upload_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "upload_dir", str(tmp_path))


async def _seed_documents(session: AsyncSession, conversation_id: str, count: int) -> None:
    for i in range(count):
        session.add(
            Document(
                conversation_id=conversation_id,
                filename=f"seed-{i}.pdf",
                file_path=f"/tmp/seed-{i}.pdf",
                extracted_text="text",
                page_count=1,
            )
        )
    await session.commit()


async def test_list_documents_returns_expected_shape(
    client: AsyncClient, session: AsyncSession, conversation: Conversation
) -> None:
    await _seed_documents(session, conversation.id, 2)

    resp = await client.get(f"/api/conversations/{conversation.id}/documents")
    assert resp.status_code == 200
    body = resp.json()
    assert len(body) == 2
    first = body[0]
    assert set(first.keys()) == {
        "id",
        "conversation_id",
        "filename",
        "page_count",
        "uploaded_at",
    }
    assert first["conversation_id"] == conversation.id


async def test_upload_document_returns_201(client: AsyncClient, conversation: Conversation) -> None:
    files = {"file": ("uploaded.pdf", make_pdf_bytes("Body text"), "application/pdf")}
    resp = await client.post(f"/api/conversations/{conversation.id}/documents", files=files)
    assert resp.status_code == 201
    body = resp.json()
    assert body["filename"] == "uploaded.pdf"
    assert body["conversation_id"] == conversation.id


async def test_upload_past_cap_returns_409(
    client: AsyncClient, session: AsyncSession, conversation: Conversation
) -> None:
    await _seed_documents(session, conversation.id, MAX_DOCUMENTS_PER_CONVERSATION)

    files = {"file": ("overflow.pdf", make_pdf_bytes(), "application/pdf")}
    resp = await client.post(f"/api/conversations/{conversation.id}/documents", files=files)
    assert resp.status_code == 409
    assert "the limit" in resp.json()["detail"]


async def test_delete_document_returns_204(
    client: AsyncClient, session: AsyncSession, conversation: Conversation
) -> None:
    await _seed_documents(session, conversation.id, 1)
    docs = (await client.get(f"/api/conversations/{conversation.id}/documents")).json()
    document_id = docs[0]["id"]

    resp = await client.delete(f"/api/documents/{document_id}")
    assert resp.status_code == 204

    remaining = (await client.get(f"/api/conversations/{conversation.id}/documents")).json()
    assert remaining == []


async def test_delete_missing_document_returns_404(client: AsyncClient) -> None:
    resp = await client.delete("/api/documents/missing-id")
    assert resp.status_code == 404


async def test_conversation_detail_includes_documents_and_count(
    client: AsyncClient, session: AsyncSession, conversation: Conversation
) -> None:
    await _seed_documents(session, conversation.id, 3)

    resp = await client.get(f"/api/conversations/{conversation.id}")
    assert resp.status_code == 200
    body = resp.json()
    assert body["document_count"] == 3
    assert body["has_document"] is True
    assert len(body["documents"]) == 3
    assert body["documents"][0]["conversation_id"] == conversation.id


async def test_conversation_list_includes_document_count(
    client: AsyncClient, session: AsyncSession, conversation: Conversation
) -> None:
    await _seed_documents(session, conversation.id, 2)

    resp = await client.get("/api/conversations")
    assert resp.status_code == 200
    item = next(c for c in resp.json() if c["id"] == conversation.id)
    assert item["document_count"] == 2
    assert item["has_document"] is True
