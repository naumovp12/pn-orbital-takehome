# Decisions (Part 2)

## The insight
I wanted to make a data-driven decision about what to do next. The clearest signal was that ungrounded answers were the biggest cause of unhappy users. Of 302 AI responses, 16% cited no source. An uncited answer got a thumbs-down 80% of the time; a cited one only 18%. The interviews agreed - one partner called a confident wrong answer "terrifying when you're advising a client on a £40M acquisition," another said an associate "tried it for a week and then stopped" after one fabricated clause. This hurts most - people were leaving because they couldn't trust it. 

## The decision
Be defensive: the assistant should say nothing rather than make something up. A "no answer" costs a lawyer a few minutes of searching. A fabricated clause on a £40M deal costs them the money and client - and us the account. So abstaining is the safe default. 

## How I built it
- Cite-or-abstain prompt - answer only from the attached documents; if the answer isn't there, reply with one exact sentence ("I couldn't find this in your documents.") and nothing else.
- Temperature 0. Deterministic answers, and a reliable citation format instead of a flaky one. This also helped the model to identify the citations without hiccups. Default temperature was making this process more stochastic.
- Verbatim quotes that are verified on the backend. The model returns its quotes character-for-character; the backend checks each quote actually exists in the document and drops anything it can't find. So even if the model paraphrases or cites the wrong file, the user only ever sees citations the server confirmed. Pages are derived from the document text, not trusted from the model.
- I added a new `messages.citations` JSON column (with Alembic migration `002_message_citations`) so verified citations are stored with each assistant message and returned in history.
- The SSE stream sends only prose chunks while generation is running, then emits one final message event containing the verified citations payload, then a done event.
- Each answer shows verified pills (document + page); clicking one shows the exact quote and jumps the viewer to that page. When it abstains, the answer gets a clear "not found" treatment. Inspired by Granola's approach.

## What else I considered
- A numeric confidence score. A number from the model is itself ungrounded; verified citations are the honest signal - either the source is there and clickable, or the answer abstains.
- Per-sentence "unverified" flags - too noisy, and once you've got enough warnings on screen people stop reading them. Abstaining on the whole answer is simpler and works better.
- A full entailment check (does the answer actually follow from the quotes, not just that the quotes exist) - worth doing eventually, but a bigger build, and just checking the quotes are real already kills the worst failure mode.
- A shared document library across deals, and real retrieval instead of dumping every document into the prompt. Both legit problems, both pushed back. The data pointed at trust as the thing to fix, and I'd rather ship one thing that actually works than split the time across two.

Verifiable citations + strict grounding was the most impactful: it fixes the 80%-thumbs-down problem and the churn directly, instead of smoothing over friction.

## What I'd do next
**Document library - reuse documents across conversations.** This is the clear next feature, and the data makes the case: re-uploading is the strongest single behaviour in the events - 63 uploads for only 15 unique files, one lease pulled into 12 conversations by 10 users - backed by the explicit ask "the tool should just remember my documents." It only gets more valuable now that a conversation can hold several documents. I deferred it on purpose to spend the time on trust, the thing actually causing churn. Cheap path: a "+ Add → from previously uploaded" picker that copies the existing `Document` row (reusing the file and extracted text) rather than re-uploading - no re-extraction, no schema change. A fuller version models a proper many-to-many link between documents and conversations and dedupes by content hash. After this, cross-document comparison (Firm F's side-by-side clause ask) and grounded export to a client-ready doc (Firm E) are the next bets.

**More automated testing - integration and e2e.** The pieces have unit tests, but the wiring between them is only checked by hand with `curl`. That's the riskiest gap, because the whole trust story lives in that wiring.
- Integration test on the streaming endpoint: stub the model to return a quote that's in a seeded document, POST a message, parse the SSE stream, and assert the verified citations land in the final event and the `messages.citations` column - plus the abstain path returning an empty array.
- Fabrication test: feed a quote that's in no document and assert it's dropped and zero citations show. Nothing guards this today - if a refactor weakened the verifier, no test would fail.
- End-to-end (Playwright): upload two PDFs, ask a cross-document question, click a pill, and confirm "Jump to source" lands on the right page; plus the abstain journey.

---

Loom link: https://www.loom.com/share/0f7b321a0b83451c9121b072b67b0e43