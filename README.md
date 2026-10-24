# Cedarhaven Municipal Information Assistant

## Signed-in accounts, chat history and uploaded PDFs

The Next.js application (`voice-ui`) provides password sign-up/sign-in, optional mobile number,
per-account chat history, and private text-based PDF upload and question answering. Email verification
is not used. The FastAPI service stores accounts, chats, messages, and upload metadata in PostgreSQL.
Chat queries use parameterized SQL, passwords use Argon2, and session tokens are held in HttpOnly
cookies by the Next.js application. PDF upload is capped at 15 MB and 100 readable pages.

For local development, the backend defaults to SQLite (`cedarhaven.db`) and scrypt if the PostgreSQL
driver / Argon2 package is unavailable. Do not use those development fallbacks in production.
Set `APP_ENV=production`, install all requirements, and configure `.env` from `.env.example` with a
PostgreSQL `DATABASE_URL`, `GROQ_API_KEY`, and a private `UPLOAD_DIR`. Configure `voice-ui/.env.local` from its example with the same `DATABASE_URL` and
`BACKEND_URL`, plus LiveKit settings for voice. Set `FRONTEND_URL` in the backend environment
to the Next.js origin (default `http://localhost:3000`); visiting the FastAPI root URL redirects
to that account-enabled application.
Install `requirements.txt`, run `uvicorn web_app:app`, and run `pnpm install && pnpm dev` in
`voice-ui`. Open `http://localhost:3000` (or `http://127.0.0.1:8000`, which redirects there).
Put both services behind HTTPS and use a managed PostgreSQL service with encrypted,
backed-up storage before production deployment. Account features require PostgreSQL; they are not
available in the old unauthenticated standalone HTML interface.

Text answers can cite passages from the bundled guides and PDFs uploaded to the signed-in account.
The current PDF reader extracts selectable text; scanned/image-only documents need OCR and are
rejected with a readable upload error. Answers continue to fail closed when evidence is insufficient.

A chat assistant that answers resident questions **only** from three supplied town guides
(service requests, by-laws, permits and licensing). Every answer carries citations of the form
`CH-BYL-02 · p.2 · BYL 1.2`, and every claim is checked against the exact wording of the PDF
before it is shown.

## Run it

```bash
python -m venv .venv && source .venv/bin/activate      # Windows: .\.venv\Scripts\Activate.ps1
pip install -r requirements.txt                         # includes watchfiles for safe Windows reload
cp .env.example .env                                   # set DATABASE_URL and GROQ_API_KEY
python -m uvicorn web_app:app --reload --reload-dir . --reload-include "*.py" --reload-exclude "voice-ui/node_modules/**" --reload-exclude "voice-ui/.next/**" --reload-exclude ".venv/**"  # API on http://127.0.0.1:8000

cd voice-ui && pnpm install && pnpm dev                # app on http://localhost:3000
```

Keep the three PDFs in the project root. Without an API key the app still starts and shows the
matching passages verbatim (no generation).

| Command | What it does | Needs key |
|---|---|---|
| `python -m pytest tests -q` | 12 tests of the verifier (fake model) | no |
| `python evals/run_retrieval_evals.py -v` | 44 questions: right section retrieved? off-topic stopped? | no |
| `python evals/run_e2e_evals.py` | same questions through the live model, checking status, wording, citations | yes |
| `python cedarhaven_answer.py` | terminal chat | yes |
| `python -m pytest tests -q` (with `requirements-voice.txt`) | also runs 7 voice-layer tests | no |


## Voice mode (LiveKit + Google speech)

A real-time voice version of the same assistant, using your Vimora interface. The agent has **no free-running
language model**: every question (spoken or typed) goes through the same verified pipeline, and the agent speaks
only text built from verified claims. The room also receives the exact quotes, so the screen shows the evidence
while the answer is spoken.

What it does in a room: voice questions, typed questions, live evidence panel, "repeat that" (no new lookup),
"where is that from?" (reads the sources), and spoken gap/refusal answers in the guides' own wording.

Voice starts from the **Voice** button in a signed-in chat. It uses the configured LiveKit agent
`assistant-b92`; the selected chat ID is bound into the authenticated room, and voice transcripts,
answers, and evidence are saved in that user's selected chat. The agent loads only that account's
uploaded PDFs. Deepgram Nova-3 handles speech recognition and Deepgram Aura-2 handles speech output
through the direct LiveKit plugins; the answer itself still goes through the exact-quote evidence verifier.

Install `requirements.txt` and `requirements-voice.txt`, and register/run the LiveKit agent under
the exact name `assistant-b92`. Set `LIVEKIT_URL`, `LIVEKIT_API_KEY`, and `LIVEKIT_API_SECRET` for
the agent. Set `DEEPGRAM_API_KEY` in the project-root `.env`. Optionally choose
`DEEPGRAM_STT_MODEL`, `DEEPGRAM_STT_LANGUAGE`, and `DEEPGRAM_TTS_MODEL`. Then run
`python agent.py download-files` once and `python agent.py dev`.
Run the signed-in web application separately with its `voice-ui/.env.local` LiveKit settings.
LiveKit keys must be kept server-side and out of source control.

## How an answer is produced

1. **Chunking by section and paragraph.** Bundled guides are split by numbered subsection;
   user-uploaded PDFs are split into bounded, page-level paragraph chunks. Callouts such as
   "Document gap" remain separate evidence, so citations point to the passage actually used.
2. **Hybrid retrieval.** BM25 on words, a weaker BM25 on lexicon synonyms (fine/penalty, saw/construction),
   TF-IDF on character n-grams, and an IDF-weighted coverage score. A question is split into clauses so
   "deck and power saw" searches both, and every document with a strong match is represented.
3. **Relevance gate.** If no passage covers enough of the question, the model is not called.
4. **Structured extraction.** `gpt-oss` (Groq, OpenAI-compatible) returns JSON claims, each with a quoted
   passage. Retrieved text and the question are wrapped as untrusted data.
5. **Verification (our code, not the model).**
   - the quote must appear verbatim in the cited passage (whitespace/case/punctuation-insensitive; `...` allowed);
   - every number in a claim must appear in its quote (so "8 cm" cannot replace "20 cm");
   - each claim is judged alone: bad ones are dropped, good ones are kept;
   - if everything fails, the model gets one repair attempt with the exact failures, then we fail closed.
6. **We write the visible answer and citations** from verified claims only. If the guides say a detail is
   not published, the answer uses the guides' own wording: *"The supplied Cedarhaven documents do not specify
   that detail."* with the citation of that statement.

## Design choices and limits

- **Fail closed** with `Sorry, this is currently out of my knowledge.` when nothing verifiable remains.
- **Graceful degradation:** if the model is unreachable, verbatim passages are shown with citations.
- **Privacy:** the prompt forbids names, phone numbers, complainant identities; numbers are grounded in quotes.
- **Context:** each chat retrieves only its own recent eight messages to resolve follow-up questions.
  Prior messages are not treated as evidence; facts still need citations from retrieved PDF passages.
- **Not done:** keyword/synonym retrieval rather than embeddings (the bundled corpus is small, and exact
  numbers matter); the lexicon is hand-built
  from resident vocabulary and the guides; PDFs are text-only (no OCR).
- Page numbers are the PDF page numbers, which match the printed "PAGE n OF 8" footers.

## AI tools used

Built with AI assistance (Claude for design review, refactoring, tests and the UI; GPT-style research notes
for the initial plan). Errors found and corrected in those notes: wrong grass limit (8 cm vs the guide's 20 cm),
wrong deck threshold (the guide says 0.6 m), citing every retrieved chunk instead of only those used, and a
keyword blocklist as injection defence (replaced by untrusted-data wrapping plus output verification).
