import type { Message } from "@/types";
import { describe, expect, it } from "vitest";
import { ABSTAIN_MESSAGE, toChatMessage } from "./chat-message";

function makeMessage(overrides: Partial<Message> = {}): Message {
	return {
		id: "m1",
		conversation_id: "c1",
		role: "assistant",
		content: "answer",
		sources_cited: 0,
		citations: [],
		created_at: "2026-01-01T00:00:00Z",
		...overrides,
	};
}

describe("toChatMessage", () => {
	it("maps backend citations to the verified UI shape with stable ids", () => {
		const result = toChatMessage(
			makeMessage({
				id: "msg-9",
				content: "The term is 15 years.",
				sources_cited: 2,
				citations: [
					{
						document_id: "doc-a",
						filename: "lease.pdf",
						page: 3,
						quote: "fifteen (15) years",
					},
					{
						document_id: "doc-a",
						filename: "lease.pdf",
						page: 4,
						quote: "Meridian Consulting Group LLP",
					},
				],
			}),
		);

		expect(result.role).toBe("assistant");
		expect(result.abstained).toBe(false);
		expect(result.citations).toEqual([
			{
				id: "msg-9-0",
				documentId: "doc-a",
				documentName: "lease.pdf",
				page: 3,
				quote: "fifteen (15) years",
				verified: true,
			},
			{
				id: "msg-9-1",
				documentId: "doc-a",
				documentName: "lease.pdf",
				page: 4,
				quote: "Meridian Consulting Group LLP",
				verified: true,
			},
		]);
	});

	it("flags an abstention when content is the abstain sentence with no citations", () => {
		const result = toChatMessage(
			makeMessage({ content: ABSTAIN_MESSAGE, citations: [] }),
		);

		expect(result.abstained).toBe(true);
		expect(result.citations).toEqual([]);
	});

	it("trims surrounding whitespace before matching the abstain sentence", () => {
		const result = toChatMessage(
			makeMessage({ content: `  ${ABSTAIN_MESSAGE}\n`, citations: [] }),
		);

		expect(result.abstained).toBe(true);
	});

	it("does not flag a real answer that happens to have no citations", () => {
		const result = toChatMessage(
			makeMessage({ content: "Some answer with no citations.", citations: [] }),
		);

		expect(result.abstained).toBe(false);
	});

	it("never flags a user message as abstained", () => {
		const result = toChatMessage(
			makeMessage({ role: "user", content: ABSTAIN_MESSAGE, citations: [] }),
		);

		expect(result.role).toBe("user");
		expect(result.abstained).toBe(false);
	});
});
