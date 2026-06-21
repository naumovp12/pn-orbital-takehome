import { MAX_DOCUMENTS, useDocuments } from "@/hooks/use-documents";
import * as api from "@/lib/api";
import type { Document } from "@/types";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api");

const mockApi = vi.mocked(api);

function makeDoc(overrides: Partial<Document> = {}): Document {
	return {
		id: "doc-1",
		conversation_id: "conv-1",
		filename: "lease.pdf",
		page_count: 7,
		uploaded_at: "2024-01-01T00:00:00Z",
		...overrides,
	};
}

/** A promise whose resolve/reject can be invoked from the test. */
function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (reason?: unknown) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

beforeEach(() => {
	vi.clearAllMocks();
	mockApi.fetchDocuments.mockResolvedValue([]);
});

describe("useDocuments", () => {
	it("exposes the document cap", () => {
		expect(MAX_DOCUMENTS).toBe(5);
	});

	it("clears documents and does not fetch when there is no conversation", async () => {
		const { result } = renderHook(() => useDocuments(null));

		await waitFor(() => expect(result.current.documents).toEqual([]));
		expect(mockApi.fetchDocuments).not.toHaveBeenCalled();
	});

	it("maps fetched documents to chips on refresh", async () => {
		mockApi.fetchDocuments.mockResolvedValue([
			makeDoc({ id: "d1", filename: "title.pdf", page_count: 3 }),
		]);

		const { result } = renderHook(() => useDocuments("conv-1"));

		await waitFor(() => expect(result.current.documents).toHaveLength(1));
		expect(mockApi.fetchDocuments).toHaveBeenCalledWith("conv-1");
		expect(result.current.documents[0]).toEqual({
			id: "d1",
			name: "title.pdf",
			pageCount: 3,
			status: "ready",
		});
	});

	it("returns null from upload when there is no conversation", async () => {
		const { result } = renderHook(() => useDocuments(null));
		await waitFor(() => expect(result.current.documents).toEqual([]));

		let returned: Document | null = makeDoc();
		await act(async () => {
			returned = await result.current.upload(
				new File(["x"], "x.pdf", { type: "application/pdf" }),
			);
		});

		expect(returned).toBeNull();
		expect(mockApi.uploadDocument).not.toHaveBeenCalled();
	});

	it("optimistically appends a processing chip then replaces it on success", async () => {
		const { result } = renderHook(() => useDocuments("conv-1"));
		await waitFor(() => expect(result.current.documents).toEqual([]));

		const pendingUpload = deferred<Document>();
		mockApi.uploadDocument.mockReturnValue(pendingUpload.promise);

		let uploadPromise!: Promise<Document | null>;
		act(() => {
			uploadPromise = result.current.upload(
				new File(["x"], "lease.pdf", { type: "application/pdf" }),
			);
		});

		// Optimistic pending chip while awaiting the server.
		await waitFor(() => expect(result.current.documents).toHaveLength(1));
		expect(result.current.documents[0]?.status).toBe("processing");
		expect(result.current.documents[0]?.id).toMatch(/^pending-/);

		await act(async () => {
			pendingUpload.resolve(makeDoc({ id: "real-1", filename: "lease.pdf" }));
			await uploadPromise;
		});

		expect(result.current.documents).toHaveLength(1);
		expect(result.current.documents[0]).toEqual({
			id: "real-1",
			name: "lease.pdf",
			pageCount: 7,
			status: "ready",
		});
	});

	it("marks the chip as error and returns null when upload fails", async () => {
		const { result } = renderHook(() => useDocuments("conv-1"));
		await waitFor(() => expect(result.current.documents).toEqual([]));

		mockApi.uploadDocument.mockRejectedValue(new Error("boom"));

		let returned: Document | null = makeDoc();
		await act(async () => {
			returned = await result.current.upload(
				new File(["x"], "bad.pdf", { type: "application/pdf" }),
			);
		});

		expect(returned).toBeNull();
		expect(result.current.documents).toHaveLength(1);
		expect(result.current.documents[0]?.status).toBe("error");
		expect(result.current.error).toBe("boom");
	});

	it("removes a pending chip locally without calling the API", async () => {
		const { result } = renderHook(() => useDocuments("conv-1"));
		await waitFor(() => expect(result.current.documents).toEqual([]));

		const pendingUpload = deferred<Document>();
		mockApi.uploadDocument.mockReturnValue(pendingUpload.promise);

		act(() => {
			void result.current.upload(
				new File(["x"], "lease.pdf", { type: "application/pdf" }),
			);
		});
		await waitFor(() => expect(result.current.documents).toHaveLength(1));
		const pendingId = result.current.documents[0]?.id as string;
		expect(pendingId).toMatch(/^pending-/);

		await act(async () => {
			await result.current.remove(pendingId);
		});

		expect(result.current.documents).toEqual([]);
		expect(mockApi.deleteDocument).not.toHaveBeenCalled();

		// Resolve the dangling upload so it does not leak across tests.
		await act(async () => {
			pendingUpload.resolve(makeDoc());
		});
	});

	it("deletes a persisted document via the API and removes it", async () => {
		mockApi.fetchDocuments.mockResolvedValue([
			makeDoc({ id: "real-1", filename: "title.pdf" }),
		]);
		mockApi.deleteDocument.mockResolvedValue(undefined);

		const { result } = renderHook(() => useDocuments("conv-1"));
		await waitFor(() => expect(result.current.documents).toHaveLength(1));

		await act(async () => {
			await result.current.remove("real-1");
		});

		expect(mockApi.deleteDocument).toHaveBeenCalledWith("real-1");
		expect(result.current.documents).toEqual([]);
	});
});
