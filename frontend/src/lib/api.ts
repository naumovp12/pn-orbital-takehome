import { z } from "zod";
import {
	type Conversation,
	type ConversationDetail,
	ConversationDetailSchema,
	ConversationSchema,
	type Document,
	DocumentSchema,
	type Message,
	MessageSchema,
} from "../types";

const BASE = "/api";

async function parseJson<S extends z.ZodTypeAny>(
	response: Response,
	schema: S,
): Promise<z.infer<S>> {
	if (!response.ok) {
		const text = await response.text().catch(() => "Unknown error");
		throw new Error(`API error ${response.status}: ${text}`);
	}
	return schema.parse(await response.json());
}

export async function fetchConversations(): Promise<Conversation[]> {
	const res = await fetch(`${BASE}/conversations`);
	return parseJson(res, z.array(ConversationSchema));
}

export async function createConversation(): Promise<Conversation> {
	const res = await fetch(`${BASE}/conversations`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ title: "New conversation" }),
	});
	return parseJson(res, ConversationSchema);
}

export async function deleteConversation(id: string): Promise<void> {
	const res = await fetch(`${BASE}/conversations/${id}`, {
		method: "DELETE",
	});
	if (!res.ok) {
		const text = await res.text().catch(() => "Unknown error");
		throw new Error(`API error ${res.status}: ${text}`);
	}
}

export async function fetchConversation(
	id: string,
): Promise<ConversationDetail> {
	const res = await fetch(`${BASE}/conversations/${id}`);
	return parseJson(res, ConversationDetailSchema);
}

export async function fetchMessages(
	conversationId: string,
): Promise<Message[]> {
	const res = await fetch(`${BASE}/conversations/${conversationId}/messages`);
	return parseJson(res, z.array(MessageSchema));
}

export async function sendMessage(
	conversationId: string,
	content: string,
): Promise<Response> {
	const res = await fetch(`${BASE}/conversations/${conversationId}/messages`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ content }),
	});
	if (!res.ok) {
		const text = await res.text().catch(() => "Unknown error");
		throw new Error(`API error ${res.status}: ${text}`);
	}
	return res;
}

export async function uploadDocument(
	conversationId: string,
	file: File,
): Promise<Document> {
	const formData = new FormData();
	formData.append("file", file);
	const res = await fetch(`${BASE}/conversations/${conversationId}/documents`, {
		method: "POST",
		body: formData,
	});
	return parseJson(res, DocumentSchema);
}

export async function fetchDocuments(
	conversationId: string,
): Promise<Document[]> {
	const res = await fetch(`${BASE}/conversations/${conversationId}/documents`);
	return parseJson(res, z.array(DocumentSchema));
}

export async function deleteDocument(documentId: string): Promise<void> {
	const res = await fetch(`${BASE}/documents/${documentId}`, {
		method: "DELETE",
	});
	if (!res.ok) {
		const text = await res.text().catch(() => "Unknown error");
		throw new Error(`API error ${res.status}: ${text}`);
	}
}

export function getDocumentUrl(documentId: string): string {
	return `${BASE}/documents/${documentId}/content`;
}
