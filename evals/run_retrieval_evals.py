"""Offline retrieval evals (no API key, no network). Run:  python evals/run_retrieval_evals.py [-v]

Checks that for every case the expected PDF section(s) appear in the top-k evidence,
and that clearly off-topic questions are stopped by the relevance gate."""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from cedarhaven_rag import CedarhavenRAG  # noqa: E402


def sec_ok(expected: str, got: str) -> bool:
    # "BYL 1" matches BYL 1, BYL 1.2 ...; "BYL 1.2" matches only BYL 1.2
    return got == expected or got.startswith(expected + ".")


def main(verbose: bool = False, top_k: int = 7) -> int:
    rag = CedarhavenRAG(ROOT)
    cases = json.loads((ROOT / "evals" / "cases.json").read_text(encoding="utf-8"))
    passed = total = 0
    for c in cases:
        if c["status"] == "greeting":
            continue
        total += 1
        res = rag.search(c["q"], top_k=top_k)
        got = [r["section"] for r in res]
        if c["status"] == "out_of_scope":
            ok = True  # LLM-level refusal is tested in e2e; here only report the gate
            note = "gate closed" if not res else f"gate open ({len(res)} chunks; LLM must refuse)"
            if c.get("gate") == "closed":
                ok = not res
        else:
            want = c.get("sections", [])
            hits = [any(sec_ok(w, g) for g in got) for w in want]
            ok = all(hits) if c.get("sections_all") else any(hits)
            docs = {r["doc_id"] for r in res}
            if ok and c.get("min_docs"):
                ok = len(docs) >= c["min_docs"]
            note = f"expected {want} | top: {got}"
        passed += ok
        if verbose or not ok:
            print(f"[{'PASS' if ok else 'FAIL'}] {c['id']}: {note}")
    print(f"\nRetrieval evals: {passed}/{total} passed")
    return 0 if passed == total else 1


if __name__ == "__main__":
    sys.exit(main("-v" in sys.argv))
