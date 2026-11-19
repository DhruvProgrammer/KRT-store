# Making KRT Store Readable for AI Agents and Humans

Plan, research summary, baseline and after-scores for the agent-readiness
work on branch `agent-readability` (pushed one file at a time).

## Design principle (research doc, §6)

Detection is useful for policy and security, but readability should be the
same for everyone. The site serves the same content to every visitor;
detection only feeds policy inputs (rate limits, step-up auth, logging).
No cloaking — this is what keeps detection from being a liability.

## Baseline (before, `docs/agent-readiness-baseline.json` +
`docs/lighthouse-baseline.json`)

- agentready (a4y 0.2.0, site mode, `http://127.0.0.1:4321`): score **60/100**
  — passed 357, failed 240, warned 1, errored 0, n/a 160, applicable 598.
  Failures: `llms.txt` missing (4 checks), `sitemap.md` missing (2),
  `agents-md.txt` missing (2); one warn (sitemap.xml has no `<url>` entries).
- Lighthouse (local preview): performance **0.78**, accessibility 0.95,
  best-practices 1.0.

## Phase 2 — semantic HTML + JSON-LD + llms.txt + markdown mirrors

- `src/components/ProductDetail.tsx` — the highlights grid used `<dd>`
  elements with no `dl` parent; swapped to `<div>`. (Buttons/radios/labels
  were already semantic; ProductCard and the store pages already carry
  Product/Offer/ItemList JSON-LD — verified, not changed.)
- `scripts/gen-agent-files.mjs` (new) — generates `public/llms.txt`,
  `public/llms-full.txt` and `public/llms/store/<slug>.md` for every product
  (12) from the same data as the storefront (`src/data/products.ts`), at
  build time. Wired into `npm run build` in `package.json`.

## Phase 3 — gateway Web Bot Auth detection

- `services/api-gateway/web-bot-auth.js` (new) — verifies Web Bot Auth
  (draft-meunier-webbotauth-httpsig-protocol-02, on RFC 9421): parses
  `Signature-Input`/`Signature`/`Signature-Agent`; resolves the agent's
  directory (JWKS) at `/.well-known/http-message-signatures-directory` with
  SSRF guards per the draft §6.7 (size/key-count/timeout caps, no redirects,
  private/loopback/link-local hosts refused); builds the RFC 9421 signature
  base (`"<component>": <value>\n` … final `"@signature-params": <raw member
  value>`, no trailing newline); Ed25519 verify. Mirrors the verification
  policy of the Cloudflare `web-bot-auth` TS package
  (`packages/web-bot-auth/src/index.ts`): required params `created`,
  `expires`, `keyid`, `tag`; `tag` must be `web-bot-auth`; `created <=
  expires`; must cover a bare `@authority` or `@target-uri` and exactly one
  `signature-agent;key="<label>"`; `keyid` is the base64url JWK SHA-256
  thumbprint (`{"crv":"Ed25519","kty":"OKP","x":"…"}` per RFC 8037
  A.3/`jsonwebkey-thumbprint`); maxAge 86 400 s, clockSkew 0; nonce
  replay-rejected once.
- `services/api-gateway/agent-detection.js` (new) — tier classification:
  Tier 1 `verified_agent` (cryptographic), Tier 2 `declared_bot`
  (UA tokens: gptbot, claudebot, ccbot, oai-searchbot, bingbot,
  google-extended, googlebot, duckduckgo), Tier 3 default `human`
  (undeclared/behavioural).
- `services/api-gateway/index.js` — mounts the classifier middleware and
  sets `x-visitor-type` upstream on every proxied request.

## After scores

- agentready: score **60/100** — passed 361, failed 239, warned 2, errored 0,
  n/a 156, applicable 602 (`docs/agent-readiness-baseline-after.json`).
  - `llms.txt` now passes: exists, content-type, non-empty (was missing).
  - Remaining fails (same as baseline): `sitemap.md` (2 checks) and
    `agents-md.txt` (2 checks) — outside this plan; follow-up candidates.
  - `llms-txt.md-extensions`: warn — `llms.txt` exists but carries no
    markdown links (a4y 0.2.0 expectation).
- Lighthouse: performance **0.82** (was 0.78), accessibility 0.95,
  best-practices 1.0 (`docs/lighthouse-baseline-after.json`).

## Verification (this branch)

- `npm run build` — green (astro build + gen-agent-files + CSP + catalog).
- `npm run test:gateway` — green (rate limit, trust proxy, detection).
- `npm run test:security` — green (auth, order, payment, cart, CSP, catalog,
  gateway).
- Gateway smoke: `GET http://127.0.0.1:3001/health` → 200.
- Preview: `http://127.0.0.1:4321/llms.txt` → 200.

## Commits (one file at a time, pushed after each)

1. `docs/agent-readiness.md`
2. `docs/agent-readiness-baseline-after.json`
3. `docs/agent-readiness-baseline.json`
4. `docs/agent-readiness-scorecards.json`
5. `docs/lighthouse-baseline-after.json`
6. `docs/lighthouse-baseline.json`
7. `services/api-gateway/web-bot-auth.js`
8. `services/api-gateway/agent-detection.js`
9. `services/api-gateway/agent-detection.test.cjs`
10. `services/api-gateway/index.js`
11. `src/components/ProductDetail.tsx`
12. `scripts/gen-agent-files.mjs`
13. `package.json`
14. `public/llms.txt`
15. `public/llms-full.txt`
16. `public/llms/store/*.md` (12 product mirrors)

## Remaining (not done here)

- Phase 5 — WebMCP tools / ACP checkout (research doc: Frontend (later)).
- `sitemap.md` + `agents-md.txt` a4y gaps.
