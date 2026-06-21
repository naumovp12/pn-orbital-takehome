"""Ad-hoc analysis of the beta usage data to validate the Part 2 product bet.

Tests three hypotheses:
  1. Negative feedback correlates with uncited answers (sources_cited == 0).
  2. Users re-upload the same document across multiple conversations
     (the multi-doc workaround that Part 1 fixes).
  3. The single-document limit forces the "one doc per conversation" pattern.
"""

from __future__ import annotations

import csv
from collections import defaultdict

PATH = "data/usage_events.csv"


def load() -> list[dict[str, str]]:
    with open(PATH) as f:
        return list(csv.DictReader(f))


def as_int(v: str) -> int | None:
    v = (v or "").strip()
    if v == "":
        return None
    try:
        return int(v)
    except ValueError:
        return None


def main() -> None:
    rows = load()

    # ----- Response-level stats -----
    responses = [r for r in rows if r["event_type"] == "response_received"]
    src = [as_int(r["sources_cited"]) or 0 for r in responses]
    zero = sum(1 for s in src if s == 0)
    print("=== Responses ===")
    print(f"total responses        : {len(responses)}")
    print(f"uncited (sources == 0) : {zero}  ({zero / len(responses):.0%})")
    print(f"mean sources_cited     : {sum(src) / len(src):.2f}")

    # ----- Pair each feedback with the preceding response in the same conversation -----
    by_conv: dict[str, list[dict[str, str]]] = defaultdict(list)
    for r in rows:
        by_conv[r["conversation_id"]].append(r)

    paired: list[tuple[str, int]] = []  # (feedback, sources_cited_of_preceding_response)
    for _conv, evs in by_conv.items():
        evs.sort(key=lambda r: r["timestamp"])
        last_src: int | None = None
        for r in evs:
            if r["event_type"] == "response_received":
                last_src = as_int(r["sources_cited"]) or 0
            elif r["event_type"] == "feedback_given" and r["feedback"]:
                if last_src is not None:
                    paired.append((r["feedback"].strip(), last_src))

    # Cross-tab: feedback vs cited / uncited
    cells: dict[tuple[str, str], int] = defaultdict(int)
    for fb, s in paired:
        bucket = "uncited" if s == 0 else "cited"
        cells[(fb, bucket)] += 1

    up_un = cells[("thumbs_up", "uncited")]
    up_ci = cells[("thumbs_up", "cited")]
    dn_un = cells[("thumbs_down", "uncited")]
    dn_ci = cells[("thumbs_down", "cited")]

    print("\n=== Feedback vs citations (paired to preceding response) ===")
    print(f"paired feedback events : {len(paired)}")
    print(f"                 uncited   cited")
    print(f"thumbs_up        {up_un:>5}   {up_ci:>5}")
    print(f"thumbs_down      {dn_un:>5}   {dn_ci:>5}")

    uncited_total = up_un + dn_un
    cited_total = up_ci + dn_ci
    if uncited_total:
        print(f"\nP(thumbs_down | uncited) = {dn_un / uncited_total:.0%}")
    if cited_total:
        print(f"P(thumbs_down | cited)   = {dn_ci / cited_total:.0%}")

    # ----- Re-upload of the same document across conversations -----
    doc_convs: dict[str, set[str]] = defaultdict(set)
    doc_users: dict[str, set[str]] = defaultdict(set)
    for r in rows:
        if r["event_type"] == "document_uploaded" and r["document_hash"]:
            doc_convs[r["document_hash"]].add(r["conversation_id"])
            doc_users[r["document_hash"]].add(r["user_id"])

    uploads = sum(1 for r in rows if r["event_type"] == "document_uploaded")
    reused = {h: c for h, c in doc_convs.items() if len(c) > 1}
    print("\n=== Document re-upload (Part 1 motivation) ===")
    print(f"total upload events      : {uploads}")
    print(f"unique documents         : {len(doc_convs)}")
    print(f"docs re-uploaded in >1 conv: {len(reused)}")
    top = sorted(doc_convs.items(), key=lambda kv: len(kv[1]), reverse=True)[:5]
    print("top reused docs (conv count, user count):")
    for h, convs in top:
        name = next(
            (r["document_name"] for r in rows if r["document_hash"] == h and r["document_name"]),
            h,
        )
        print(f"  {len(convs):>2} convs / {len(doc_users[h]):>2} users  {name}")

    # ----- Docs per conversation (is the 1-doc limit forcing the pattern?) -----
    convs_with_docs = {h for h in by_conv if any(
        r["event_type"] == "document_uploaded" for r in by_conv[h]
    )}
    multi = 0
    for conv in convs_with_docs:
        hashes = {
            r["document_hash"]
            for r in by_conv[conv]
            if r["event_type"] == "document_uploaded" and r["document_hash"]
        }
        if len(hashes) > 1:
            multi += 1
    print("\n=== Docs per conversation ===")
    print(f"conversations with a document : {len(convs_with_docs)}")
    print(f"conversations with >1 document: {multi}  (app blocks this today)")


if __name__ == "__main__":
    main()
