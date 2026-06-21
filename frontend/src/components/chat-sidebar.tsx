import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
	FileText,
	MessageSquare,
	MessageSquarePlus,
	Scale,
	Trash2,
} from "lucide-react";
import { useState } from "react";

export interface Conversation {
	id: string;
	title: string;
	updatedAt: string;
	documentCount?: number;
}

interface ChatSidebarProps {
	conversations: Conversation[];
	selectedId: string | null;
	loading: boolean;
	onSelect: (id: string) => void;
	onCreate: () => void;
	onDelete: (id: string) => void;
}

function timeAgo(dateStr: string): string {
	// The API returns naive UTC timestamps (no offset, e.g. "2026-06-21T19:08:11").
	// Append "Z" so the browser parses them as UTC instead of local time.
	const normalized = /[zZ]|[+-]\d{2}:?\d{2}$/.test(dateStr)
		? dateStr
		: `${dateStr}Z`;
	const date = new Date(normalized);
	const now = new Date();
	const diffMs = now.getTime() - date.getTime();
	const diffMins = Math.floor(diffMs / 60000);
	const diffHours = Math.floor(diffMins / 60);
	const diffDays = Math.floor(diffHours / 24);

	if (diffMins < 1) return "Just now";
	if (diffMins < 60) return `${diffMins}m ago`;
	if (diffHours < 24) return `${diffHours}h ago`;
	if (diffDays === 1) return "Yesterday";
	if (diffDays < 7) return `${diffDays}d ago`;
	return date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export function ChatSidebar({
	conversations,
	selectedId,
	loading,
	onSelect,
	onCreate,
	onDelete,
}: ChatSidebarProps) {
	const [hoveredId, setHoveredId] = useState<string | null>(null);
	const [deletingId, setDeletingId] = useState<string | null>(null);

	const handleDelete = async (e: React.MouseEvent, id: string) => {
		e.stopPropagation();
		setDeletingId(id);
		await onDelete(id);
		setDeletingId(null);
	};

	return (
		<aside className="flex flex-col w-64 shrink-0 h-screen bg-sidebar border-r border-sidebar-border">
			{/* Header */}
			<div className="flex items-center gap-2.5 px-4 py-4 border-b border-sidebar-border">
				<div className="flex items-center justify-center size-7 rounded-md bg-primary">
					<Scale
						className="size-4 text-primary-foreground"
						strokeWidth={1.75}
					/>
				</div>
				<span className="font-serif text-base font-semibold tracking-tight text-foreground">
					Orbital
				</span>
				<span className="ml-auto">
					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								variant="ghost"
								size="icon"
								className="size-7 text-muted-foreground hover:text-foreground hover:bg-sidebar-accent"
								onClick={onCreate}
							>
								<MessageSquarePlus className="size-4" />
								<span className="sr-only">New conversation</span>
							</Button>
						</TooltipTrigger>
						<TooltipContent side="right">New conversation</TooltipContent>
					</Tooltip>
				</span>
			</div>

			{/* Conversations list */}
			<ScrollArea className="flex-1 px-2 py-3">
				{loading ? (
					<div className="flex flex-col gap-1">
						{["s1", "s2", "s3", "s4", "s5"].map((k) => (
							<div
								key={k}
								className="h-14 rounded-md bg-sidebar-accent/40 animate-pulse"
							/>
						))}
					</div>
				) : conversations.length === 0 ? (
					<div className="flex flex-col items-center justify-center gap-3 py-16 px-4 text-center">
						<div className="flex items-center justify-center size-10 rounded-full bg-sidebar-accent">
							<MessageSquare
								className="size-5 text-sidebar-foreground/40"
								strokeWidth={1.5}
							/>
						</div>
						<p className="text-xs text-sidebar-foreground/50 leading-relaxed">
							No conversations yet. Start one by clicking{" "}
							<span className="text-sidebar-foreground/70">+</span> above.
						</p>
					</div>
				) : (
					<nav className="flex flex-col gap-0.5" aria-label="Conversations">
						{conversations.map((conv) => {
							const isSelected = conv.id === selectedId;
							const isHovered = hoveredId === conv.id;

							return (
								<div
									key={conv.id}
									className="group relative flex items-stretch mb-1"
									onMouseEnter={() => setHoveredId(conv.id)}
									onMouseLeave={() => setHoveredId(null)}
								>
									{isSelected && (
										<span
											className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-full bg-primary"
											aria-hidden="true"
										/>
									)}
									<button
										type="button"
										onClick={() => onSelect(conv.id)}
										className={cn(
											"flex flex-col flex-1 min-w-0 rounded-md px-3 py-2.5 text-left transition-colors",
											isSelected
												? "bg-sidebar-accent text-sidebar-accent-foreground"
												: "text-sidebar-foreground hover:bg-sidebar-accent/60",
										)}
									>
										<div className="flex items-center gap-1 min-w-0">
											<span
												className={cn(
													"text-[13px] leading-snug truncate flex-1 min-w-0",
													isSelected
														? "font-semibold text-foreground"
														: "font-medium",
												)}
											>
												{conv.title}
											</span>
											<button
												type="button"
												onClick={(e) => handleDelete(e, conv.id)}
												className={cn(
													"flex items-center justify-center size-5 shrink-0 rounded transition-all",
													"text-muted-foreground hover:text-destructive hover:bg-destructive/10",
													isHovered || isSelected ? "opacity-100" : "opacity-0",
												)}
												disabled={deletingId === conv.id}
												aria-label={`Delete conversation: ${conv.title}`}
											>
												<Trash2 className="size-3" />
											</button>
										</div>

										<div className="flex items-center gap-2 mt-1">
											{conv.documentCount !== undefined &&
												conv.documentCount > 0 && (
													<span className="flex items-center gap-1 text-[10px] text-muted-foreground">
														<FileText className="size-2.5" />
														{conv.documentCount}{" "}
														{conv.documentCount === 1 ? "doc" : "docs"}
													</span>
												)}
											<span className="font-mono text-[10px] text-muted-foreground/70 ml-auto tabular-nums">
												{timeAgo(conv.updatedAt)}
											</span>
										</div>
									</button>
								</div>
							);
						})}
					</nav>
				)}
			</ScrollArea>
		</aside>
	);
}
