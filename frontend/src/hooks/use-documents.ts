import { useCallback, useEffect, useState } from "react";
import type { DocumentItem } from "../components/chat-window";
import * as api from "../lib/api";
import type { Document } from "../types";

export const MAX_DOCUMENTS = 5;

function toItem(doc: Document): DocumentItem {
	return {
		id: doc.id,
		name: doc.filename,
		pageCount: doc.page_count,
		status: "ready",
	};
}

let tempCounter = 0;

export function useDocuments(conversationId: string | null) {
	const [documents, setDocuments] = useState<DocumentItem[]>([]);
	const [error, setError] = useState<string | null>(null);

	const refresh = useCallback(async () => {
		if (!conversationId) {
			setDocuments([]);
			return;
		}
		try {
			setError(null);
			const docs = await api.fetchDocuments(conversationId);
			setDocuments(docs.map(toItem));
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to load documents");
		}
	}, [conversationId]);

	useEffect(() => {
		refresh();
	}, [refresh]);

	const upload = useCallback(
		async (file: File): Promise<Document | null> => {
			if (!conversationId) return null;

			// Optimistic pending chip while the server extracts text
			const tempId = `pending-${++tempCounter}`;
			const pending: DocumentItem = {
				id: tempId,
				name: file.name,
				pageCount: 0,
				status: "processing",
			};
			setDocuments((prev) => [...prev, pending]);

			try {
				setError(null);
				const doc = await api.uploadDocument(conversationId, file);
				setDocuments((prev) =>
					prev.map((d) => (d.id === tempId ? toItem(doc) : d)),
				);
				return doc;
			} catch (err) {
				const message =
					err instanceof Error ? err.message : "Failed to upload document";
				setError(message);
				setDocuments((prev) =>
					prev.map((d) =>
						d.id === tempId ? { ...d, status: "error" as const } : d,
					),
				);
				return null;
			}
		},
		[conversationId],
	);

	const remove = useCallback(async (documentId: string) => {
		// Pending/error chips that never persisted are removed locally
		if (documentId.startsWith("pending-")) {
			setDocuments((prev) => prev.filter((d) => d.id !== documentId));
			return;
		}
		try {
			setError(null);
			await api.deleteDocument(documentId);
			setDocuments((prev) => prev.filter((d) => d.id !== documentId));
		} catch (err) {
			setError(
				err instanceof Error ? err.message : "Failed to remove document",
			);
		}
	}, []);

	return { documents, error, upload, remove, refresh };
}
