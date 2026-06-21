import { Button } from "@/components/ui/button";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "framer-motion";
import {
	AlertTriangle,
	ArrowRight,
	Check,
	FileText,
	Loader2,
	Paperclip,
	Send,
	Upload,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

export type DocStatus = "ready" | "processing" | "error";

export interface DocumentItem {
	id: string;
	name: string;
	pageCount: number;
	status: DocStatus;
}

export interface Citation {
	id: string;
	documentId: string;
	documentName: string;
	page: number;
	quote: string;
	verified: boolean;
}

export interface ChatMessage {
	id: string;
	role: "user" | "assistant";
	content: string;
	citations?: Citation[];
	abstained?: boolean;
}

// ─── CitationPill ─────────────────────────────────────────────────────────────

function CitationPill({
	citation,
	onJump,
}: {
	citation: Citation;
	onJump: (documentId: string, page: number) => void;
}) {
	// Short display name: strip ".pdf" and truncate
	const shortName =
		citation.documentName
			.replace(/\.pdf$/i, "")
			.split("–")[0]
			?.trim() ?? citation.documentName;

	return (
		<Popover>
			<PopoverTrigger
				className={cn(
					"inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium align-baseline",
					"bg-verified-bg border border-verified-border text-foreground",
					"hover:border-verified/50 transition-colors cursor-pointer",
					"font-sans",
				)}
			>
				<Check className="size-2.5 text-verified shrink-0" strokeWidth={2.5} />
				<span>{shortName}</span>
				<span className="font-mono text-muted-foreground tabular-nums">
					· p.{citation.page}
				</span>
			</PopoverTrigger>
			<PopoverContent
				side="top"
				align="start"
				className="w-80 p-0 shadow-lg border border-border"
				sideOffset={6}
			>
				{/* Popover header */}
				<div className="px-4 py-2.5 border-b border-border bg-muted/40">
					<p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
						<Check className="size-3 text-verified" strokeWidth={2.5} />
						Verified · {citation.documentName.replace(/\.pdf$/i, "")} · page{" "}
						{citation.page}
					</p>
				</div>
				{/* Verbatim quote */}
				<div className="px-4 py-3">
					<blockquote className="border-l-2 border-verified pl-3 text-sm text-foreground leading-relaxed italic">
						&ldquo;{citation.quote}&rdquo;
					</blockquote>
				</div>
				{/* Jump to source */}
				<div className="px-4 pb-3">
					<Button
						size="sm"
						className="w-full gap-1.5 text-xs"
						onClick={() => onJump(citation.documentId, citation.page)}
					>
						Jump to source
						<ArrowRight className="size-3" />
					</Button>
				</div>
			</PopoverContent>
		</Popover>
	);
}

// ─── Parse content with inline citation slots ─────────────────────────────────
// Citations are rendered *after* content as per brief ("appear only after streaming finishes")
// We render the content as plain text, then a row of pills beneath.

// ─── AssistantMessage ─────────────────────────────────────────────────────────

function AssistantMessage({
	message,
	onJumpToSource,
}: {
	message: ChatMessage;
	onJumpToSource: (documentId: string, page: number) => void;
}) {
	const verifiedCitations = message.citations?.filter((c) => c.verified) ?? [];

	if (message.abstained) {
		return (
			<motion.div
				initial={{ opacity: 0, y: 6 }}
				animate={{ opacity: 1, y: 0 }}
				transition={{ duration: 0.2 }}
				className="flex gap-3 w-full"
			>
				{/* Assistant monogram */}
				<div
					className="flex items-center justify-center shrink-0 size-6 rounded-md text-xs font-semibold font-serif mt-0.5 bg-primary text-primary-foreground select-none"
					aria-hidden="true"
				>
					O
				</div>
				<div className="flex flex-col gap-1 max-w-[78%]">
					<div className="rounded-lg px-4 py-3 bg-abstain-bg border border-abstain-border text-sm text-foreground leading-relaxed">
						<div className="flex items-start gap-2.5">
							<AlertTriangle
								className="size-4 text-abstain shrink-0 mt-0.5"
								strokeWidth={1.5}
							/>
							<div className="flex flex-col gap-1">
								<p className="font-semibold text-abstain">
									Not found in your documents.
								</p>
								<p className="text-muted-foreground text-[13px] leading-relaxed">
									{message.content}
								</p>
							</div>
						</div>
					</div>
				</div>
			</motion.div>
		);
	}

	return (
		<motion.div
			initial={{ opacity: 0, y: 6 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ duration: 0.2 }}
			className="flex gap-3 w-full"
		>
			{/* Assistant monogram */}
			<div
				className="flex items-center justify-center shrink-0 size-6 rounded-md text-xs font-semibold font-serif mt-0.5 bg-primary text-primary-foreground select-none"
				aria-hidden="true"
			>
				O
			</div>

			<div className="flex flex-col gap-2 max-w-[78%] items-start">
				{/* Message bubble */}
				<div className="rounded-xl rounded-tl-sm px-4 py-3 bg-card border border-border text-sm leading-relaxed text-foreground shadow-sm">
					<p className="whitespace-pre-wrap">{message.content}</p>
				</div>

				{/* Citation pills — animate in together */}
				{verifiedCitations.length > 0 && (
					<motion.div
						initial={{ opacity: 0, y: 4 }}
						animate={{ opacity: 1, y: 0 }}
						transition={{ duration: 0.25, delay: 0.05 }}
						className="flex flex-wrap gap-1.5 px-0.5"
					>
						{verifiedCitations.map((c) => (
							<CitationPill key={c.id} citation={c} onJump={onJumpToSource} />
						))}
					</motion.div>
				)}

				{/* Sources count footer */}
				{verifiedCitations.length > 0 && (
					<p className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground px-0.5">
						{verifiedCitations.length}{" "}
						{verifiedCitations.length === 1 ? "source" : "sources"} cited
					</p>
				)}
			</div>
		</motion.div>
	);
}

// ─── UserMessage ──────────────────────────────────────────────────────────────

function UserMessage({ message }: { message: ChatMessage }) {
	return (
		<motion.div
			initial={{ opacity: 0, y: 6 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ duration: 0.18 }}
			className="flex flex-row-reverse gap-3 w-full"
		>
			<div className="flex flex-col gap-1 max-w-[78%] items-end">
				<div className="rounded-xl rounded-tr-sm px-4 py-3 bg-secondary text-sm leading-relaxed text-foreground">
					<p className="whitespace-pre-wrap">{message.content}</p>
				</div>
			</div>
		</motion.div>
	);
}

// ─── StreamingBubble ──────────────────────────────────────────────────────────

function StreamingBubble({
	content,
	verifying,
}: {
	content: string;
	verifying: boolean;
}) {
	return (
		<div className="flex gap-3 w-full">
			<div
				className="flex items-center justify-center shrink-0 size-6 rounded-md text-xs font-semibold font-serif mt-0.5 bg-primary text-primary-foreground select-none"
				aria-hidden="true"
			>
				O
			</div>
			<div className="flex flex-col gap-1.5 max-w-[78%] items-start">
				<div className="rounded-xl rounded-tl-sm px-4 py-3 bg-card border border-border shadow-sm text-sm leading-relaxed text-foreground">
					{verifying ? (
						<span className="flex items-center gap-2 text-muted-foreground text-[13px]">
							<Loader2 className="size-3.5 animate-spin" />
							Verifying sources…
						</span>
					) : content ? (
						<p className="whitespace-pre-wrap">{content}</p>
					) : (
						<span className="flex gap-1 items-center">
							<span className="inline-block size-1.5 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:0ms]" />
							<span className="inline-block size-1.5 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:150ms]" />
							<span className="inline-block size-1.5 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:300ms]" />
						</span>
					)}
				</div>
			</div>
		</div>
	);
}

// ─── FirstRunUploadPrompt ─────────────────────────────────────────────────────

function FirstRunUploadPrompt({
	onUploadClick,
	dragOver,
}: {
	onUploadClick: () => void;
	dragOver: boolean;
}) {
	return (
		<div className="flex flex-col items-center justify-center gap-6 py-12 px-8 text-center">
			<button
				type="button"
				onClick={onUploadClick}
				className={cn(
					"flex flex-col items-center gap-5 w-full max-w-sm px-8 py-10 rounded-xl border-2 border-dashed transition-colors cursor-pointer",
					dragOver
						? "border-primary/50 bg-secondary"
						: "border-border hover:border-primary/40 hover:bg-secondary/50",
				)}
			>
				<div className="flex items-center justify-center size-14 rounded-full bg-secondary border border-border">
					<Upload className="size-6 text-muted-foreground" strokeWidth={1.5} />
				</div>
				<div className="flex flex-col gap-1.5">
					<h2 className="font-serif text-lg font-semibold text-foreground text-balance">
						Upload documents to get started
					</h2>
					<p className="text-sm text-muted-foreground leading-relaxed text-balance">
						Ask questions about leases, title reports, contracts and other legal
						documents
					</p>
				</div>
				<p className="font-mono text-[11px] text-muted-foreground/60">
					Click to browse or drag PDFs here
				</p>
			</button>
		</div>
	);
}

// ─── ChatWindow ───────────────────────────────────────────────────────────────

interface ChatWindowProps {
	messages: ChatMessage[];
	loading: boolean;
	error: string | null;
	streaming: boolean;
	streamingContent: string;
	verifying: boolean;
	documents: DocumentItem[];
	conversationId: string | null;
	onSend: (content: string) => Promise<void>;
	onUpload: (file: File) => Promise<void>;
	onJumpToSource: (documentId: string, page: number) => void;
}

export function ChatWindow({
	messages,
	loading,
	error,
	streaming,
	streamingContent,
	verifying,
	documents,
	conversationId,
	onSend,
	onUpload,
	onJumpToSource,
}: ChatWindowProps) {
	const [input, setInput] = useState("");
	const [sending, setSending] = useState(false);
	const [uploading, setUploading] = useState(false);
	const [dragOver, setDragOver] = useState(false);

	const bottomRef = useRef<HTMLDivElement>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const textareaRef = useRef<HTMLTextAreaElement>(null);

	const MAX_DOCS = 5;
	const readyDocs = documents.filter((d) => d.status === "ready");
	const atDocLimit = documents.length >= MAX_DOCS;

	// Auto-scroll to bottom
	// biome-ignore lint/correctness/useExhaustiveDependencies: scroll when messages/stream change
	useEffect(() => {
		bottomRef.current?.scrollIntoView({ behavior: "smooth" });
	}, [messages, streamingContent]);

	// Auto-resize textarea
	// biome-ignore lint/correctness/useExhaustiveDependencies: re-measure on input/conversation change
	useEffect(() => {
		const el = textareaRef.current;
		if (!el) return;
		el.style.height = "auto";
		el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
	}, [input, conversationId]);

	const handleSend = async () => {
		const content = input.trim();
		if (!content || sending || !conversationId) return;
		setInput("");
		setSending(true);
		try {
			await onSend(content);
		} finally {
			setSending(false);
		}
	};

	const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			handleSend();
		}
	};

	const handleFileChange = useCallback(
		async (file: File | null) => {
			if (!file) return;
			if (file.type !== "application/pdf") return;
			if (atDocLimit) return;
			setUploading(true);
			try {
				await onUpload(file);
			} finally {
				setUploading(false);
				if (fileInputRef.current) fileInputRef.current.value = "";
			}
		},
		[onUpload, atDocLimit],
	);

	const handleDrop = useCallback(
		(e: React.DragEvent) => {
			e.preventDefault();
			setDragOver(false);
			for (const file of Array.from(e.dataTransfer.files)) {
				handleFileChange(file);
			}
		},
		[handleFileChange],
	);

	const hasDocuments = documents.length > 0;
	const hasMessages = messages.length > 0;

	return (
		<main
			className="flex flex-col flex-1 min-w-0 h-screen bg-background"
			onDragOver={(e) => {
				e.preventDefault();
				setDragOver(true);
			}}
			onDragLeave={() => setDragOver(false)}
			onDrop={handleDrop}
		>
			{/* Messages area */}
			<div className="relative flex-1 overflow-hidden">
				<ScrollArea className="h-full">
					<div className="flex flex-col gap-5 px-6 py-6 max-w-3xl mx-auto w-full">
						{!conversationId ? (
							/* No conversation yet — uploading starts a new one */
							<FirstRunUploadPrompt
								onUploadClick={() => fileInputRef.current?.click()}
								dragOver={dragOver}
							/>
						) : loading ? (
							/* Loading skeleton */
							<div className="flex flex-col gap-5">
								{[
									{ id: "sk-1", reverse: false },
									{ id: "sk-2", reverse: true },
									{ id: "sk-3", reverse: false },
								].map((s) => (
									<div
										key={s.id}
										className={cn(
											"flex gap-3",
											s.reverse ? "flex-row-reverse" : "flex-row",
										)}
									>
										<div className="size-6 rounded-full bg-muted animate-pulse shrink-0" />
										<div
											className={cn(
												"h-14 rounded-xl bg-muted animate-pulse",
												s.reverse ? "w-1/2" : "w-2/3",
											)}
										/>
									</div>
								))}
							</div>
						) : !hasDocuments && !hasMessages ? (
							/* First-run: no documents, no messages */
							<FirstRunUploadPrompt
								onUploadClick={() => fileInputRef.current?.click()}
								dragOver={dragOver}
							/>
						) : !hasMessages ? (
							/* Has documents but no messages yet */
							<div className="flex flex-col items-center justify-center gap-2 py-24 text-center">
								<div className="flex items-center justify-center size-12 rounded-full bg-secondary border border-border mb-1">
									<FileText
										className="size-5 text-muted-foreground"
										strokeWidth={1.5}
									/>
								</div>
								<p className="font-serif text-base text-foreground">
									Documents ready
								</p>
								<p className="text-sm text-muted-foreground">
									Ask a question to get started.
								</p>
								<p className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground/70 mt-1">
									{readyDocs.length} document
									{readyDocs.length !== 1 ? "s" : ""} loaded
								</p>
							</div>
						) : (
							/* Messages */
							<>
								{messages.map((msg) =>
									msg.role === "user" ? (
										<UserMessage key={msg.id} message={msg} />
									) : (
										<AssistantMessage
											key={msg.id}
											message={msg}
											onJumpToSource={onJumpToSource}
										/>
									),
								)}
								{(streaming || verifying) && (
									<StreamingBubble
										content={streamingContent}
										verifying={verifying}
									/>
								)}
							</>
						)}

						{error && (
							<div className="flex items-center gap-2.5 px-4 py-3 rounded-lg bg-destructive/8 border border-destructive/20 text-sm text-destructive">
								<AlertTriangle className="size-4 shrink-0" />
								<span>{error}</span>
							</div>
						)}

						<div ref={bottomRef} />
					</div>
				</ScrollArea>

				{/* Drag overlay */}
				<AnimatePresence>
					{dragOver && hasDocuments && (
						<motion.div
							initial={{ opacity: 0 }}
							animate={{ opacity: 1 }}
							exit={{ opacity: 0 }}
							className="absolute inset-0 bg-background/90 border-2 border-dashed border-border flex flex-col items-center justify-center gap-3 z-10"
						>
							<Upload
								className="size-7 text-muted-foreground"
								strokeWidth={1.5}
							/>
							<p className="text-sm font-medium text-foreground">
								Drop PDF to add to conversation
							</p>
						</motion.div>
					)}
				</AnimatePresence>
			</div>

			{/* Input area — only shown when a conversation is active */}
			{conversationId && (
				<div className="px-5 pb-4 pt-3 border-t border-border bg-card">
					<div className="max-w-3xl mx-auto w-full">
						{/* "Asking across N documents" cue */}
						{readyDocs.length >= 1 && (
							<p className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground/70 mb-2 text-center">
								Asking across {readyDocs.length}{" "}
								{readyDocs.length === 1 ? "document" : "documents"}
							</p>
						)}

						<div
							className={cn(
								"flex flex-col rounded-xl border border-border bg-background transition-shadow",
								"focus-within:ring-2 focus-within:ring-primary/15 focus-within:border-primary/40",
								!conversationId && "opacity-50 pointer-events-none",
							)}
						>
							<textarea
								ref={textareaRef}
								value={input}
								onChange={(e) => setInput(e.target.value)}
								onKeyDown={handleKeyDown}
								placeholder={
									!hasDocuments
										? "Upload one or more documents first…"
										: "Ask about your documents…"
								}
								rows={1}
								disabled={!conversationId || sending || streaming}
								className="w-full resize-none bg-transparent px-4 pt-3.5 pb-1 text-sm text-foreground placeholder:text-muted-foreground/50 outline-none disabled:cursor-not-allowed"
							/>
							<div className="flex items-center justify-between px-3 pb-2.5">
								<div className="flex items-center gap-1.5">
									<Tooltip>
										<TooltipTrigger asChild>
											<Button
												variant="ghost"
												size="icon"
												className="size-7 text-muted-foreground hover:text-foreground"
												onClick={() => fileInputRef.current?.click()}
												disabled={uploading || atDocLimit || !conversationId}
											>
												{uploading ? (
													<Loader2 className="size-4 animate-spin" />
												) : (
													<Paperclip className="size-4" />
												)}
												<span className="sr-only">Attach PDF</span>
											</Button>
										</TooltipTrigger>
										<TooltipContent>
											{atDocLimit
												? "This conversation already has 5 documents (the limit). Remove one or start a new conversation to add more."
												: "Attach PDF"}
										</TooltipContent>
									</Tooltip>
								</div>

								<Button
									size="icon"
									className="size-7 rounded-lg"
									onClick={handleSend}
									disabled={
										!input.trim() || sending || streaming || !conversationId
									}
								>
									{sending || streaming ? (
										<Loader2 className="size-3.5 animate-spin" />
									) : (
										<Send className="size-3.5" />
									)}
									<span className="sr-only">Send message</span>
								</Button>
							</div>
						</div>
					</div>
				</div>
			)}

			{/* Hidden file input */}
			<input
				ref={fileInputRef}
				type="file"
				accept=".pdf,application/pdf"
				multiple
				className="hidden"
				onChange={(e) => {
					for (const f of Array.from(e.target.files ?? [])) {
						handleFileChange(f);
					}
				}}
				aria-label="Upload PDF document"
			/>
		</main>
	);
}
