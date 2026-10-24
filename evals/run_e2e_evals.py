"""End-to-end evals against the real LLM (needs GROQ_API_KEY / LLM_API_KEY in .env).

    python evals/run_e2e_evals.py            # all cases
    python evals/run_e2e_evals.py -k fence   # only case ids containing 'fence'
    python evals/run_e2e_evals.py -v         # show every answer

Each case checks: status, required phrases (regex), forbidden phrases (e.g. an invented "$ amount"),
and that the answer cites at least one of the expected sections. Results are saved to evals/last_run.json."""
import json
import re
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from cedarhaven_answer import CedarhavenAssistant  # noqa: E402

OK_STATUS = {"answered": {"answered"}, "gap": {"gap"}, "out_of_scope": {"out_of_scope", "gap"}, "greeting": {"greeting"}}


def sec_ok(expected, got):
    return got == expected or got.startswith(expected + ".")


def main():
    verbose = "-v" in sys.argv
    flt = sys.argv[sys.argv.index("-k") + 1] if "-k" in sys.argv else ""
    bot = CedarhavenAssistant()
    if not bot.llm_ready:
        sys.exit("No API key found. Put GROQ_API_KEY=... in .env (see .env.example).")
    cases = [c for c in json.loads((ROOT / "evals" / "cases.json").read_text(encoding="utf-8")) if flt in c["id"]]
    rows, passed = [], 0
    for c in cases:
        t = time.time()
        r = bot.answer(c["q"])
        problems = []
        if r["status"] not in OK_STATUS[c["status"]]:
            problems.append(f"status {r['status']} != {c['status']}")
        text = r["answer"]
        if r["status"] in {"answered", "gap"}:
            for pat in c.get("must_match", []):
                if not re.search(pat, text, re.I):
                    problems.append(f"missing /{pat}/")
            if c.get("sections") and r["sources"] and not any(
                    sec_ok(w, s["section"]) for w in c["sections"] for s in r["sources"]):
                problems.append(f"cites {[s['section'] for s in r['sources']]}, expected one of {c['sections']}")
        for pat in c.get("must_not", []):
            if re.search(pat, text, re.I):
                problems.append(f"forbidden /{pat}/ present")
        if c.get("min_docs") and len({s["doc_id"] for s in r["sources"]}) < c["min_docs"]:
            problems.append(f"expected >= {c['min_docs']} documents cited")
        ok = not problems
        passed += ok
        rows.append({"id": c["id"], "q": c["q"], "ok": ok, "problems": problems, "status": r["status"],
                     "answer": text, "cites": [s["citation"] for s in r["sources"]],
                     "rejected": r.get("debug", {}).get("rejected_claims", []), "secs": round(time.time() - t, 1)})
        print(f"[{'PASS' if ok else 'FAIL'}] {c['id']:<22} {r['status']:<12} {rows[-1]['secs']}s"
              + ("" if ok else "  <- " + "; ".join(problems)))
        if verbose or not ok:
            print("      " + text.replace("\n", "\n      ")[:700])
    (ROOT / "evals" / "last_run.json").write_text(json.dumps(rows, indent=1, ensure_ascii=False), encoding="utf-8")
    print(f"\nEnd-to-end evals: {passed}/{len(cases)} passed  (details in evals/last_run.json)")
    sys.exit(0 if passed == len(cases) else 1)


if __name__ == "__main__":
    main()
