import { ChatSidebar } from "@/components/chat-sidebar";
import type { Conversation as SidebarConversation } from "@/components/chat-sidebar";
import { ChatWindow } from "@/components/chat-window";
import { DocumentViewer } from "@/components/document-viewer";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useConversations } from "@/hooks/use-conversations";
import { useDocuments } from "@/hooks/use-documents";
import { useMessages } from "@/hooks/use-messages";
import { uploadDocument } from "@/lib/api";
import { toChatMessage } from "@/lib/chat-message";
import type { Conversation } from "@/types";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

// ─── Mappers: backend shapes → UI component shapes ─────────────────────────────

function toSidebarConversation(c: Conversation): SidebarConversation {
	return {
		id: c.id,
		title: c.title,
		updatedAt: c.updated_at,
		documentCount: c.document_count,
	};
}

// ─── Component ────────────────────────────────────────────────────────────────

export function LegalApp() {
	const {
		conversations,
		selectedId,
		loading: conversationsLoading,
		create,
		select,
		remove,
		refresh: refreshConversations,
	} = useConversations();

	const {
		messages,
		loading: messagesLoading,
		error: messagesError,
		streaming,
		streamingContent,
		send,
	} = useMessages(selectedId);

	const {
		documents,
		upload,
		remove: removeDoc,
		refresh: refreshDocuments,
	} = useDocuments(selectedId);

	// Document viewer state
	const [activeDocId, setActiveDocId] = useState<string | null>(null);
	const [activePage, setActivePage] = useState(1);
	const [highlightPage, setHighlightPage] = useState<number | null>(null);
	// Files dropped/attached before a conversation exists, flushed once one does
	const [pendingUploads, setPendingUploads] = useState<File[]>([]);
	const flushingRef = useRef(false);
	// Guards against a batch of initial uploads each spawning its own conversation
	const creatingRef = useRef(false);
	const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);

	// Reset the viewer when switching conversations
	// biome-ignore lint/correctness/useExhaustiveDependencies: reset only on conversation change
	useEffect(() => {
		setActiveDocId(null);
		setActivePage(1);
		setHighlightPage(null);
	}, [selectedId]);

	// Default to the most-recently-uploaded ready doc when none is active
	useEffect(() => {
		if (activeDocId && documents.some((d) => d.id === activeDocId)) return;
		const ready = documents.filter((d) => d.status === "ready");
		const newest = ready[ready.length - 1] ?? null;
		setActiveDocId(newest?.id ?? null);
	}, [documents, activeDocId]);

	const sidebarConversations = useMemo(
		() => conversations.map(toSidebarConversation),
		[conversations],
	);

	const chatMessages = useMemo(
		() => messages.filter((m) => m.role !== "system").map(toChatMessage),
		[messages],
	);

	const activeDoc =
		documents.find((d) => d.id === activeDocId) ?? documents[0] ?? null;

	// ── Conversation management ────────────────────────────────────────────────

	const handleCreate = useCallback(async () => {
		await create();
	}, [create]);

	const handleSelect = useCallback(
		(id: string) => {
			select(id);
		},
		[select],
	);

	const handleDelete = useCallback(
		(id: string) => {
			remove(id);
		},
		[remove],
	);

	// ── Send message ───────────────────────────────────────────────────────────

	const handleSend = useCallback(
		async (content: string) => {
			await send(content);
			refreshConversations();
		},
		[send, refreshConversations],
	);

	// ── Upload document ────────────────────────────────────────────────────────

	const handleUpload = useCallback(
		async (file: File) => {
			// No conversation yet: queue the file and create one. When several files
			// are uploaded at once (multi-select or drag-drop) they all reach this
			// branch while `selectedId` is still null, so the create() call is
			// de-duplicated with a ref — otherwise each file would spawn its own
			// conversation and the documents would scatter across them. The flush
			// effect below uploads every queued file into the single new conversation.
			if (!selectedId) {
				setPendingUploads((prev) => [...prev, file]);
				if (creatingRef.current) return;
				creatingRef.current = true;
				try {
					const conv = await create();
					if (!conv) {
						// Creation failed: drop the queued batch so nothing tries to
						// flush into a conversation that doesn't exist.
						setPendingUploads([]);
					}
				} finally {
					creatingRef.current = false;
				}
				return;
			}
			const doc = await upload(file);
			if (doc) {
				setActiveDocId(doc.id);
				setActivePage(1);
				refreshConversations();
			}
		},
		[selectedId, create, upload, refreshConversations],
	);

	// Flush queued uploads once a freshly-created conversation becomes active.
	// We upload directly against the new conversation id (rather than the
	// `useDocuments` closure) and reconcile the panel with a real refresh, so the
	// result is independent of render timing or the list-reset that fires when
	// the active conversation changes.
	useEffect(() => {
		if (!selectedId || pendingUploads.length === 0 || flushingRef.current)
			return;
		flushingRef.current = true;
		const convId = selectedId;
		const files = pendingUploads;
		(async () => {
			let lastDocId: string | null = null;
			for (const file of files) {
				try {
					const doc = await uploadDocument(convId, file);
					lastDocId = doc.id;
				} catch {
					// Failures surface when we refresh the document list below.
				}
			}
			setPendingUploads([]);
			await refreshDocuments();
			if (lastDocId) {
				setActiveDocId(lastDocId);
				setActivePage(1);
			}
			refreshConversations();
			flushingRef.current = false;
		})();
	}, [selectedId, pendingUploads, refreshDocuments, refreshConversations]);

	// ── Remove document ────────────────────────────────────────────────────────

	const handleRemoveDocument = useCallback(
		async (docId: string) => {
			await removeDoc(docId);
			setActiveDocId((prev) => (prev === docId ? null : prev));
			refreshConversations();
		},
		[removeDoc, refreshConversations],
	);

	// ── Jump to source ─────────────────────────────────────────────────────────

	const handleJumpToSource = useCallback((documentId: string, page: number) => {
		setActiveDocId(documentId);
		setActivePage(page);
		if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
		setHighlightPage(page);
		highlightTimerRef.current = setTimeout(() => setHighlightPage(null), 2000);
	}, []);

	return (
		<TooltipProvider delayDuration={200}>
			<div className="flex h-screen overflow-hidden bg-background font-sans">
				<ChatSidebar
					conversations={sidebarConversations}
					selectedId={selectedId}
					loading={conversationsLoading}
					onSelect={handleSelect}
					onCreate={handleCreate}
					onDelete={handleDelete}
				/>

				<ChatWindow
					messages={chatMessages}
					loading={messagesLoading}
					error={messagesError}
					streaming={streaming}
					streamingContent={streamingContent}
					verifying={false}
					documents={documents}
					conversationId={selectedId}
					onSend={handleSend}
					onUpload={handleUpload}
					onJumpToSource={handleJumpToSource}
				/>

				{selectedId && (
					<DocumentViewer
						activeDocument={activeDoc}
						documents={documents}
						activePage={activePage}
						highlightPage={highlightPage}
						onDocumentChange={(id) => {
							setActiveDocId(id);
							setActivePage(1);
						}}
						onRemoveDocument={handleRemoveDocument}
						onAddDocument={() => fileInputRef.current?.click()}
						onPageChange={setActivePage}
					/>
				)}

				{/* Global file input for DocumentViewer "+ Add" chip */}
				<input
					ref={fileInputRef}
					type="file"
					accept=".pdf,application/pdf"
					multiple
					className="hidden"
					onChange={(e) => {
						for (const f of Array.from(e.target.files ?? [])) {
							handleUpload(f);
						}
						if (fileInputRef.current) fileInputRef.current.value = "";
					}}
					aria-label="Add PDF to conversation"
				/>
			</div>
		</TooltipProvider>
	);
}
