import { z } from "zod";

export const ConversationSchema = z.object({
	id: z.string(),
	title: z.string(),
	created_at: z.string(),
	updated_at: z.string(),
	has_document: z.boolean(),
	document_count: z.number(),
});
export type Conversation = z.infer<typeof ConversationSchema>;

export const CitationSchema = z.object({
	document_id: z.string(),
	filename: z.string(),
	page: z.number(),
	quote: z.string(),
});
export type Citation = z.infer<typeof CitationSchema>;

export const MessageSchema = z.object({
	id: z.string(),
	conversation_id: z.string(),
	role: z.enum(["user", "assistant", "system"]),
	content: z.string(),
	sources_cited: z.number(),
	citations: z.array(CitationSchema).default([]),
	created_at: z.string(),
});
export type Message = z.infer<typeof MessageSchema>;

export const DocumentSchema = z.object({
	id: z.string(),
	conversation_id: z.string(),
	filename: z.string(),
	page_count: z.number(),
	uploaded_at: z.string(),
});
export type Document = z.infer<typeof DocumentSchema>;

export const ConversationDetailSchema = ConversationSchema.extend({
	documents: z.array(DocumentSchema),
});
export type ConversationDetail = z.infer<typeof ConversationDetailSchema>;
