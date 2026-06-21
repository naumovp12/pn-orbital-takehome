import type { ChatMessage } from "@/components/chat-window";
import type { Message } from "@/types";

// Mirrors ABSTAIN_MESSAGE in backend/src/takehome/services/llm.py — the exact
// sentence the model returns when it cannot ground an answer in the documents.
export const ABSTAIN_MESSAGE = "I couldn't find this in your documents.";

// Maps a persisted/streamed backend message onto the shape the chat UI renders.
export function toChatMessage(m: Message): ChatMessage {
	const role = m.role === "assistant" ? "assistant" : "user";
	// Every persisted citation has already passed backend verification, so all
	// are flagged verified for the UI.
	const citations = m.citations.map((c, i) => ({
		id: `${m.id}-${i}`,
		documentId: c.document_id,
		documentName: c.filename,
		page: c.page,
		quote: c.quote,
		verified: true,
	}));
	return {
		id: m.id,
		role,
		content: m.content,
		citations,
		abstained:
			role === "assistant" &&
			citations.length === 0 &&
			m.content.trim() === ABSTAIN_MESSAGE,
	};
}
