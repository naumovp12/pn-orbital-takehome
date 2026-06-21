from __future__ import annotations

import json
from collections.abc import AsyncIterator
from datetime import datetime

import structlog
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.responses import StreamingResponse

from takehome.db.models import Message
from takehome.db.session import get_session
from takehome.services.citations import SourceDocument, verify_citations
from takehome.services.conversation import get_conversation, update_conversation
from takehome.services.document import list_documents_for_conversation
from takehome.services.llm import (
    CitationStreamFilter,
    chat_with_document,
    generate_title,
    parse_citations,
)

logger = structlog.get_logger()

router = APIRouter(tags=["messages"])


# --------------------------------------------------------------------------- #
# Schemas
# --------------------------------------------------------------------------- #


class Citation(BaseModel):
    document_id: str
    filename: str
    page: int
    quote: str


class MessageOut(BaseModel):
    id: str
    conversation_id: str
    role: str
    content: str
    sources_cited: int
    citations: list[Citation] = []
    created_at: datetime

    model_config = {"from_attributes": True}


class MessageCreate(BaseModel):
    content: str


# --------------------------------------------------------------------------- #
# Endpoints
# --------------------------------------------------------------------------- #


@router.get(
    "/api/conversations/{conversation_id}/messages",
    response_model=list[MessageOut],
)
async def list_messages(
    conversation_id: str,
    session: AsyncSession = Depends(get_session),
) -> list[MessageOut]:
    """List all messages in a conversation, ordered by creation time."""
    # Verify the conversation exists
    conversation = await get_conversation(session, conversation_id)
    if conversation is None:
        raise HTTPException(status_code=404, detail="Conversation not found")

    stmt = (
        select(Message)
        .where(Message.conversation_id == conversation_id)
        .order_by(Message.created_at.asc())
    )
    result = await session.execute(stmt)
    messages = list(result.scalars().all())

    return [
        MessageOut(
            id=m.id,
            conversation_id=m.conversation_id,
            role=m.role,
            content=m.content,
            sources_cited=m.sources_cited,
            citations=[Citation(**c) for c in (m.citations or [])],
            created_at=m.created_at,
        )
        for m in messages
    ]


@router.post("/api/conversations/{conversation_id}/messages")
async def send_message(
    conversation_id: str,
    body: MessageCreate,
    session: AsyncSession = Depends(get_session),
) -> StreamingResponse:
    """Send a user message and stream back the AI response via SSE."""
    # Verify the conversation exists
    conversation = await get_conversation(session, conversation_id)
    if conversation is None:
        raise HTTPException(status_code=404, detail="Conversation not found")

    # Save the user message
    user_message = Message(
        conversation_id=conversation_id,
        role="user",
        content=body.content,
    )
    session.add(user_message)
    await session.commit()
    await session.refresh(user_message)

    logger.info("User message saved", conversation_id=conversation_id, message_id=user_message.id)

    # Capture document data up front as plain values so the streaming generator
    # never touches ORM objects after the request session has closed.
    documents = await list_documents_for_conversation(session, conversation_id)
    source_documents: list[SourceDocument] = [
        SourceDocument(id=d.id, filename=d.filename, text=d.extracted_text)
        for d in documents
        if d.extracted_text
    ]
    document_context: list[tuple[str, str]] = [
        (d.filename, d.text) for d in source_documents
    ]

    # Load conversation history (exclude the message we just saved, it will be the user_message param)
    stmt = (
        select(Message)
        .where(Message.conversation_id == conversation_id)
        .where(Message.id != user_message.id)
        .order_by(Message.created_at.asc())
    )
    result = await session.execute(stmt)
    history_messages = list(result.scalars().all())

    conversation_history: list[dict[str, str]] = [
        {"role": m.role, "content": m.content} for m in history_messages
    ]

    # Determine if this is the first user message (for title generation)
    user_msg_count = sum(1 for m in history_messages if m.role == "user")
    is_first_message = user_msg_count == 0

    async def event_stream() -> AsyncIterator[str]:
        """Generate SSE events with the streamed LLM response."""
        raw_response = ""
        citation_filter = CitationStreamFilter()
        errored = False

        try:
            async for chunk in chat_with_document(
                user_message=body.content,
                documents=document_context,
                conversation_history=conversation_history,
            ):
                raw_response += chunk
                # Only surface the prose; the citation block stays hidden.
                visible = citation_filter.feed(chunk)
                if visible:
                    event_data = json.dumps({"type": "content", "content": visible})
                    yield f"data: {event_data}\n\n"

            # Flush any prose held back behind the delimiter guard.
            tail = citation_filter.finalize()
            if tail:
                event_data = json.dumps({"type": "content", "content": tail})
                yield f"data: {event_data}\n\n"

        except Exception:
            logger.exception(
                "Error during LLM streaming",
                conversation_id=conversation_id,
            )
            errored = True
            raw_response = (
                "I'm sorry, an error occurred while generating a response. "
                "Please try again."
            )
            event_data = json.dumps({"type": "content", "content": raw_response})
            yield f"data: {event_data}\n\n"

        # Separate the human-readable answer from the citation block, then verify
        # each citation against the documents it claims to quote.
        if errored:
            answer, raw_citations = raw_response, []
        else:
            answer, raw_citations = parse_citations(raw_response)
        verified = verify_citations(raw_citations, source_documents)
        citations_payload = [c.to_payload() for c in verified]
        sources = len(verified)

        # Save the assistant message to the database.
        # We need a fresh session since the outer one may have been closed.
        from takehome.db.session import async_session as session_factory

        async with session_factory() as save_session:
            assistant_message = Message(
                conversation_id=conversation_id,
                role="assistant",
                content=answer,
                sources_cited=sources,
                citations=citations_payload,
            )
            save_session.add(assistant_message)
            await save_session.commit()
            await save_session.refresh(assistant_message)

            # Auto-generate title from first user message
            if is_first_message:
                try:
                    title = await generate_title(body.content)
                    await update_conversation(save_session, conversation_id, title)
                    logger.info(
                        "Auto-generated conversation title",
                        conversation_id=conversation_id,
                        title=title,
                    )
                except Exception:
                    logger.exception(
                        "Failed to generate title",
                        conversation_id=conversation_id,
                    )

            # Send the final message event with the complete assistant message
            message_data = json.dumps(
                {
                    "type": "message",
                    "message": {
                        "id": assistant_message.id,
                        "conversation_id": assistant_message.conversation_id,
                        "role": assistant_message.role,
                        "content": assistant_message.content,
                        "sources_cited": assistant_message.sources_cited,
                        "citations": citations_payload,
                        "created_at": assistant_message.created_at.isoformat(),
                    },
                }
            )
            yield f"data: {message_data}\n\n"

            # Send the done signal
            done_data = json.dumps(
                {
                    "type": "done",
                    "sources_cited": sources,
                    "message_id": assistant_message.id,
                }
            )
            yield f"data: {done_data}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
