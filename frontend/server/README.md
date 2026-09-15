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

The middleware permits loopback requests only and checks browser origin against the request host. It caps request size, validates card IDs/orientations/roles, retrieves a small grounded evidence set from `reading-rag.mjs`, asks for a JSON answer, and rejects references outside that set. It limits request concurrency/rate and has a 90-second timeout with disconnect cancellation. Only the current question/cards/conversation go to DeepSeek; archives and personal memory are not automatically transmitted. Past demo assistant answers are excluded from model context.

## Reading contract

`POST /api/readings/interpret` returns `{text, source, provider, model, references, followUp, uncertainty}`. Each reference includes an `evidenceId`, `cardId`, `position`, and optional `claim`. The model receives only the selected cards plus retrieved evidence, never the full 78-card corpus. A plain-text provider response remains readable for compatibility, but the server adds orientation-level fallback references and records empty follow-up/uncertainty fields.

Model endpoint and names verified against the official docs:
https://api-docs.deepseek.com/zh-cn/

## Deployment boundary
This integration runs on the LOCAL Vite dev/preview server. The preserved Sites worker still serves static assets only. Publishing the static build does not deploy this API; public hosting requires a separately authenticated backend and server-side secret configuration. Do not publish this local paid endpoint as an unauthenticated public proxy.

## Acceptance 2026-09-12
- Real model inventory authentication: HTTP 200, deepseek-flash and deepseek-v4-pro.
- Real first reading: HTTP 200, source ai, model deepseek-flash, 827 Chinese/text characters.
- Real follow-up: remembered the prior two-hours-per-day question and provided an actionable next step.
- Build passes; 21 tests pass, including six backend tests.
- Secret absent from all dist files; /.env.local and /@fs absolute env path return 403 without secret content; git ignores local secret file.
- Existing Vite bundle-size warning remains.

- Browser end-to-end: enter → choose one-card spread → select → flip → request reading; DeepSeek badge visible, 852-character AI response rendered, no UI error. Separate QA browser used; existing user archives untouched.
