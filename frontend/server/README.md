# Local DeepSeek reading backend

The local Vite dev and preview servers install `createReadingMiddleware` for:
- `POST /api/readings/interpret`: grounded Chinese reading and same-deck follow-ups.
- `GET /api/readings/status`: configuration presence and model name, no credentials. This is not a provider health/balance check.

Server-only settings in ignored `frontend/.env.local`:
```
DEEPSEEK_API_KEY=<local secret>
DEEPSEEK_MODEL=deepseek-flash
VITE_READING_ENDPOINT=/api/readings/interpret
```
Never prefix the API key with VITE_. The local file has mode 0600 and is not included in the client build. Change the key there and restart the local server after rotation.

The middleware permits loopback requests only and checks browser origin against the request host. It caps request size, validates card IDs/orientations/roles, retrieves a small grounded evidence set from `reading-rag.mjs`, asks for a JSON answer, and rejects references outside that set. On the first reading, every selected card and at least one evidence-backed action are required; malformed output gets at most one structure-repair request before the same validation runs again. Health, legal, investment, and similar high-stakes questions require a non-empty reality-based uncertainty boundary. It limits request concurrency/rate and has a 90-second timeout with disconnect cancellation. Only the current question/cards/conversation and explicitly enabled memory records go to DeepSeek; disabled memories and archives are not transmitted. Past demo assistant answers are excluded from model context.

## Reading contract

`POST /api/readings/interpret` returns `{text, source, provider, model, cardReadings, actions, references, followUp, uncertainty}`. On the first reading, `cardReadings` must contain every selected card with matching `evidenceIds`, and `actions` must contain at least one `{text, reason, evidenceIds}` item; follow-ups may focus on only the relevant cards and may omit actions. The optional `spread` object is checked against the fixed catalog (or a bounded custom layout) before it reaches the model. Each reference includes an `evidenceId`, `cardId`, `position`, and optional `claim`; action evidence IDs must also come from this request's evidence set. The model receives only the selected cards, the checked spread, and retrieved evidence, never the full 78-card corpus. A plain-text provider response remains readable for compatibility, but the server adds orientation-level fallback references and records empty follow-up/uncertainty fields.

Model endpoint and names verified against the official docs:
https://api-docs.deepseek.com/zh-cn/

## Deployment boundary
This integration runs on the LOCAL Vite dev/preview server. The preserved Sites worker still serves static assets only. Publishing the static build does not deploy this API; public hosting requires a separately authenticated backend and server-side secret configuration. Do not publish this local paid endpoint as an unauthenticated public proxy.

## Acceptance 2026-09-12
- Real model inventory authentication: HTTP 200, deepseek-flash and deepseek-v4-pro.
- Real first reading: HTTP 200, source ai, model deepseek-flash, 827 Chinese/text characters.
- Real follow-up: remembered the prior two-hours-per-day question and provided an actionable next step.
- Build passes; 50 tests pass, including the offline RAG/Prompt quality gate, structured actions, high-stakes boundary checks, and bounded repair tests.
- Secret absent from all dist files; /.env.local and /@fs absolute env path return 403 without secret content; git ignores local secret file.
- Existing Vite bundle-size warning remains.

- Browser end-to-end: enter → choose one-card spread → select → flip → request reading; DeepSeek badge visible, 852-character AI response rendered, no UI error. Separate QA browser used; existing user archives untouched.
