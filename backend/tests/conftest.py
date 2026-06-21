"""Shared fixtures for the multi-document test suite.

Each test runs inside an outer transaction that is rolled back on teardown, so the
real PostgreSQL database used by the app is never mutated. The session uses
``join_transaction_mode="create_savepoint"`` so that ``session.commit()`` calls made
by the service layer commit a savepoint rather than the outer transaction, keeping
every test isolated.
"""

from __future__ import annotations

import io
from collections.abc import AsyncIterator

import fitz  # PyMuPDF
import pytest_asyncio
from fastapi import UploadFile
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.pool import NullPool

from takehome.config import settings
from takehome.db.models import Conversation
from takehome.db.session import get_session
from takehome.web.app import app


@pytest_asyncio.fixture
async def session() -> AsyncIterator[AsyncSession]:
    """Provide an AsyncSession bound to a transaction that is rolled back afterwards.

    A dedicated NullPool engine is created per test so connections bind to the
    current event loop (avoiding cross-loop pool reuse). The session uses
    ``join_transaction_mode="create_savepoint"`` so service-layer ``commit()`` calls
    operate on savepoints while the outer transaction is rolled back on teardown.
    """
    test_engine = create_async_engine(settings.database_url, poolclass=NullPool)
    connection = await test_engine.connect()
    transaction = await connection.begin()
    test_session = AsyncSession(
        bind=connection,
        expire_on_commit=False,
        join_transaction_mode="create_savepoint",
    )
    try:
        yield test_session
    finally:
        await test_session.close()
        if transaction.is_active:
            await transaction.rollback()
        await connection.close()
        await test_engine.dispose()


@pytest_asyncio.fixture
async def client(session: AsyncSession) -> AsyncIterator[AsyncClient]:
    """An httpx client wired to the FastAPI app, sharing the test transaction.

    The ``get_session`` dependency is overridden to yield the same session the test
    uses, so data created through the API is visible to assertions and rolled back.
    Lifespan (which runs Alembic migrations) is intentionally not triggered — the
    running container has already applied them.
    """

    async def override_get_session() -> AsyncIterator[AsyncSession]:
        yield session

    app.dependency_overrides[get_session] = override_get_session
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()


@pytest_asyncio.fixture
async def conversation(session: AsyncSession) -> Conversation:
    """Create and persist a conversation for tests that need one."""
    conv = Conversation()
    session.add(conv)
    await session.commit()
    await session.refresh(conv)
    return conv


def make_pdf_bytes(text: str = "Hello world") -> bytes:
    """Build a minimal single-page PDF containing the given text."""
    doc = fitz.open()
    page = doc.new_page()
    page.insert_text((72, 72), text)
    data: bytes = doc.tobytes()
    doc.close()
    return data


def make_upload(filename: str = "sample.pdf", text: str = "Hello world") -> UploadFile:
    """Build a FastAPI UploadFile wrapping an in-memory PDF."""
    return UploadFile(filename=filename, file=io.BytesIO(make_pdf_bytes(text)))
