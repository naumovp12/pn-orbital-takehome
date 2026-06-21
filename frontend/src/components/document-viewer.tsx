import type { DocumentItem } from "@/components/chat-window";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { getDocumentUrl } from "@/lib/api";
import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "framer-motion";
import {
	AlertCircle,
	ChevronLeft,
	ChevronRight,
	FileText,
	Loader2,
	PanelRightClose,
	PanelRightOpen,
	Plus,
	X,
} from "lucide-react";
import { useRef, useState } from "react";
import { Document as PDFDocument, Page, pdfjs } from "react-pdf";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
	"pdfjs-dist/build/pdf.worker.min.mjs",
	import.meta.url,
).toString();

const PDF_PAGE_WIDTH = 392;

interface DocumentViewerProps {
	activeDocument: DocumentItem | null;
	documents: DocumentItem[];
	activePage: number;
	highlightPage: number | null;
	onDocumentChange: (id: string) => void;
	onRemoveDocument: (id: string) => void;
	onAddDocument: () => void;
	onPageChange: (page: number) => void;
}

// ─── PDF page ──────────────────────────────────────────────────────────────────

function PdfPage({
	documentId,
	page,
	highlight,
}: {
	documentId: string;
	page: number;
	highlight: boolean;
}) {
	const url = getDocumentUrl(documentId);
	return (
		<PDFDocument
			key={documentId}
			file={url}
			loading={
				<div className="flex items-center justify-center py-16">
					<Loader2 className="size-5 animate-spin text-muted-foreground" />
				</div>
			}
			error={
				<div className="flex flex-col items-center gap-2 py-16 text-center">
					<AlertCircle className="size-5 text-destructive" />
					<p className="text-xs text-muted-foreground">
						Couldn&apos;t load this PDF.
					</p>
				</div>
			}
		>
			<motion.div
				key={page}
				initial={{ opacity: 0 }}
				animate={{ opacity: 1 }}
				transition={{ duration: 0.15 }}
				className={cn(
					"relative bg-white border shadow-sm mx-auto transition-all duration-300 w-fit",
					highlight && "ring-2 ring-offset-2 ring-verified/60",
				)}
			>
				<Page
					pageNumber={page}
					width={PDF_PAGE_WIDTH}
					renderTextLayer={false}
					renderAnnotationLayer={false}
					loading={
						<div
							className="flex items-center justify-center bg-white"
							style={{ width: PDF_PAGE_WIDTH, height: PDF_PAGE_WIDTH * 1.29 }}
						>
							<Loader2 className="size-4 animate-spin text-muted-foreground/50" />
						</div>
					}
				/>
			</motion.div>
		</PDFDocument>
	);
}

// ─── DocumentChip ─────────────────────────────────────────────────────────────

function DocumentChip({
	doc,
	active,
	onSelect,
	onRemove,
}: {
	doc: DocumentItem;
	active: boolean;
	onSelect: () => void;
	onRemove: () => void;
}) {
	const [hovered, setHovered] = useState(false);
	// Short display name
	const shortName =
		doc.name
			.replace(/\.pdf$/i, "")
			.split("–")[0]
			?.trim() ?? doc.name;

	return (
		<motion.div
			layout
			initial={{ opacity: 0, scale: 0.92 }}
			animate={{ opacity: 1, scale: 1 }}
			exit={{ opacity: 0, scale: 0.88 }}
			transition={{ duration: 0.15 }}
			className={cn(
				"flex items-center shrink-0 rounded-md border transition-colors max-w-44",
				active
					? "bg-primary border-primary text-primary-foreground"
					: "bg-card border-border text-muted-foreground hover:border-primary/30 hover:text-foreground",
			)}
			onMouseEnter={() => setHovered(true)}
			onMouseLeave={() => setHovered(false)}
		>
			<button
				type="button"
				onClick={onSelect}
				className="flex items-center gap-1.5 min-w-0 pl-2.5 pr-1.5 py-1.5 text-[11px] font-medium whitespace-nowrap"
			>
				{doc.status === "processing" ? (
					<Loader2 className="size-3 shrink-0 animate-spin" />
				) : doc.status === "error" ? (
					<AlertCircle className="size-3 shrink-0 text-destructive" />
				) : (
					<FileText className="size-3 shrink-0" />
				)}
				<span className="truncate">{shortName}</span>
				<span
					className={cn(
						"font-mono text-[10px] shrink-0 tabular-nums",
						active ? "text-primary-foreground/60" : "text-muted-foreground/60",
					)}
				>
					· {doc.pageCount}p
				</span>
			</button>

			{/* Remove × — inline, revealed on hover */}
			<AnimatePresence initial={false}>
				{hovered && doc.status !== "processing" && (
					<motion.button
						layout
						initial={{ opacity: 0, width: 0 }}
						animate={{ opacity: 1, width: "auto" }}
						exit={{ opacity: 0, width: 0 }}
						transition={{ duration: 0.12 }}
						onClick={(e) => {
							e.stopPropagation();
							onRemove();
						}}
						className={cn(
							"flex items-center justify-center size-5 mr-1 shrink-0 rounded transition-colors",
							active
								? "text-primary-foreground/60 hover:text-primary-foreground hover:bg-white/15"
								: "text-muted-foreground/60 hover:text-destructive hover:bg-destructive/10",
						)}
						aria-label={`Remove ${doc.name}`}
					>
						<X className="size-3" />
					</motion.button>
				)}
			</AnimatePresence>
		</motion.div>
	);
}

// ─── DocumentViewer ────────────────────────────────────────────────────────────

export function DocumentViewer({
	activeDocument,
	documents,
	activePage,
	highlightPage,
	onDocumentChange,
	onRemoveDocument,
	onAddDocument,
	onPageChange,
}: DocumentViewerProps) {
	const [collapsed, setCollapsed] = useState(false);
	const fileInputRef = useRef<HTMLInputElement>(null);
	// Id pending confirmation when removing the conversation's last document
	const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);

	const totalPages = activeDocument?.pageCount ?? 1;
	const atDocLimit = documents.length >= 5;
	const isHighlighted = highlightPage !== null && activePage === highlightPage;

	const handlePrev = () => onPageChange(Math.max(1, activePage - 1));
	const handleNext = () => onPageChange(Math.min(totalPages, activePage + 1));

	// Removing the last document leaves the conversation with nothing to search,
	// so confirm first. Removing any other document happens immediately.
	const requestRemove = (id: string) => {
		const persisted = documents.filter((d) => !d.id.startsWith("pending-"));
		if (persisted.length <= 1) {
			setConfirmRemoveId(id);
		} else {
			onRemoveDocument(id);
		}
	};

	const confirmDoc = documents.find((d) => d.id === confirmRemoveId) ?? null;

	if (collapsed) {
		return (
			<div className="flex flex-col items-center w-10 border-l border-border bg-doc-panel py-4 shrink-0">
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							variant="ghost"
							size="icon"
							className="size-8 text-muted-foreground hover:text-foreground"
							onClick={() => setCollapsed(false)}
						>
							<PanelRightOpen className="size-4" />
							<span className="sr-only">Open document panel</span>
						</Button>
					</TooltipTrigger>
					<TooltipContent side="left">Open document panel</TooltipContent>
				</Tooltip>
			</div>
		);
	}

	return (
		<aside className="flex flex-col w-[440px] shrink-0 border-l border-border bg-doc-panel h-screen">
			{/* ── Header: doc name + page navigation ── */}
			<div className="flex items-center gap-2 px-3 py-2.5 border-b border-border bg-card shrink-0">
				{/* Collapse button */}
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							variant="ghost"
							size="icon"
							className="size-7 text-muted-foreground hover:text-foreground shrink-0"
							onClick={() => setCollapsed(true)}
						>
							<PanelRightClose className="size-3.5" />
							<span className="sr-only">Close panel</span>
						</Button>
					</TooltipTrigger>
					<TooltipContent side="bottom">Close panel</TooltipContent>
				</Tooltip>

				{/* Document name */}
				<div className="flex-1 min-w-0">
					{activeDocument ? (
						<p className="text-xs font-medium text-foreground truncate">
							{activeDocument.name.replace(/\.pdf$/i, "")}
						</p>
					) : (
						<p className="text-xs text-muted-foreground">No document</p>
					)}
				</div>

				{/* Page navigation — lives in header per brief */}
				{activeDocument && (
					<div className="flex items-center gap-0.5 shrink-0">
						<Button
							variant="ghost"
							size="icon"
							className="size-7 text-muted-foreground hover:text-foreground disabled:opacity-30"
							onClick={handlePrev}
							disabled={activePage <= 1}
						>
							<ChevronLeft className="size-3.5" />
							<span className="sr-only">Previous page</span>
						</Button>
						<span className="text-[11px] text-muted-foreground font-mono tabular-nums px-1 whitespace-nowrap">
							p. {activePage} / {totalPages}
						</span>
						<Button
							variant="ghost"
							size="icon"
							className="size-7 text-muted-foreground hover:text-foreground disabled:opacity-30"
							onClick={handleNext}
							disabled={activePage >= totalPages}
						>
							<ChevronRight className="size-3.5" />
							<span className="sr-only">Next page</span>
						</Button>
					</div>
				)}
			</div>

			{/* ── PDF area ── */}
			<div className="flex-1 overflow-auto p-4">
				{!activeDocument ? (
					<div className="flex flex-col items-center justify-center gap-3 h-full py-12 px-6 text-center">
						<div className="flex items-center justify-center size-12 rounded-full bg-muted border border-border">
							<FileText
								className="size-5 text-muted-foreground/50"
								strokeWidth={1.5}
							/>
						</div>
						<div className="flex flex-col gap-1">
							<p className="text-sm font-medium text-foreground">
								No document uploaded
							</p>
							<p className="text-xs text-muted-foreground leading-relaxed">
								Add a PDF via the tab strip below or the chat input.
							</p>
						</div>
					</div>
				) : activeDocument.status === "processing" ? (
					<div className="flex flex-col items-center justify-center gap-3 h-full py-12 text-center">
						<Loader2 className="size-5 animate-spin text-muted-foreground" />
						<p className="text-xs text-muted-foreground">
							Processing {activeDocument.name}…
						</p>
					</div>
				) : activeDocument.status === "error" ? (
					<div className="flex flex-col items-center justify-center gap-3 h-full py-12 text-center">
						<AlertCircle className="size-5 text-destructive" />
						<p className="text-xs text-muted-foreground">
							{activeDocument.name} couldn&apos;t be processed.
						</p>
					</div>
				) : (
					<PdfPage
						documentId={activeDocument.id}
						page={activePage}
						highlight={isHighlighted}
					/>
				)}
			</div>

			{/* ── Bottom document tab strip ── */}
			<div className="shrink-0 border-t border-border bg-card px-3 py-2.5">
				<div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none">
					<AnimatePresence initial={false}>
						{documents.map((doc) => (
							<DocumentChip
								key={doc.id}
								doc={doc}
								active={activeDocument?.id === doc.id}
								onSelect={() => onDocumentChange(doc.id)}
								onRemove={() => requestRemove(doc.id)}
							/>
						))}
					</AnimatePresence>

					{/* + Add chip */}
					{!atDocLimit && (
						<button
							type="button"
							onClick={onAddDocument}
							className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[11px] font-medium border border-dashed border-border text-muted-foreground hover:border-primary/40 hover:text-foreground transition-colors shrink-0 whitespace-nowrap"
						>
							<Plus className="size-3" />
							Add
						</button>
					)}
					{atDocLimit && (
						<Tooltip>
							<TooltipTrigger className="text-[11px] text-muted-foreground/50 px-1 shrink-0 cursor-default">
								5/5
							</TooltipTrigger>
							<TooltipContent side="top" className="max-w-60 text-center">
								This conversation already has 5 documents (the limit). Remove
								one or start a new conversation to add more.
							</TooltipContent>
						</Tooltip>
					)}
				</div>
			</div>

			{/* Hidden file input for + Add chip */}
			<input
				ref={fileInputRef}
				type="file"
				accept=".pdf,application/pdf"
				multiple
				className="hidden"
				aria-label="Add PDF document"
			/>

			{/* Confirm removing the conversation's last document */}
			<Dialog
				open={confirmRemoveId !== null}
				onOpenChange={(open) => {
					if (!open) setConfirmRemoveId(null);
				}}
			>
				<DialogContent className="max-w-md">
					<DialogHeader>
						<DialogTitle className="font-serif">
							Remove the last document?
						</DialogTitle>
						<DialogDescription>
							{confirmDoc
								? `“${confirmDoc.name.replace(/\.pdf$/i, "")}” is the only document in this conversation. `
								: "This is the only document in this conversation. "}
							Removing it leaves nothing to search, so answers will no longer be
							grounded in any document until you add another.
						</DialogDescription>
					</DialogHeader>
					<div className="flex justify-end gap-2 pt-2">
						<Button
							variant="secondary"
							size="sm"
							onClick={() => setConfirmRemoveId(null)}
						>
							Cancel
						</Button>
						<Button
							variant="destructive"
							size="sm"
							onClick={() => {
								if (confirmRemoveId) onRemoveDocument(confirmRemoveId);
								setConfirmRemoveId(null);
							}}
						>
							Remove document
						</Button>
					</div>
				</DialogContent>
			</Dialog>
		</aside>
	);
}
