# Deploying Sealio to a free public URL (for a tester)

This guide deploys the app so you can hand a tester **two links**:

1. **The app** — `https://sealio-web-xxxx.onrender.com`
2. **The mailbox (Mailhog)** — `https://sealio-mailhog-xxxx.onrender.com` — where the tester reads
   their own OTP code.

Everything runs on **free** tiers: **Render** (web + API + Postgres + Mailhog) and
**Cloudflare R2** (file storage). Redis is not used.

> Heads-up on the free tier: services **sleep after ~15 min idle** (first hit is a ~30–60s cold
> start), and Render's free Postgres is **deleted after 30 days** (swap in a free Neon database if
> you need it to last longer). Fine for a tester demo.

---

## How it works (the important design points)

- The browser only ever talks to the **web** app. The web app proxies `/api/*` to the API
  server-side (`apps/web/next.config.ts` → `INTERNAL_API_URL`). This keeps auth cookies
  first-party, so login/signing work without CORS or cross-site cookie headaches — and you only
  share **one** app URL.
- PDFs are streamed through the API (`GET /documents/:id/file`), so R2 never needs to be public.
- Email isn't "real" — the app sends to **Mailhog**, a fake inbox. On the public deploy Mailhog
  has its own URL; the tester opens it to read their OTP. **Mailhog (not Mailpit) is used on
  purpose** so the Live UI Test OTP proxy keeps working unchanged.

---

## Step 1 — Cloudflare R2 (object storage)

1. Create a free Cloudflare account → **R2** → **Create bucket** named `sealio-documents`.
2. **R2 → Manage API Tokens → Create API token** (Object Read & Write). Copy the **Access Key ID**
   and **Secret Access Key**.
3. Note your endpoint: `https://<accountid>.r2.cloudflarestorage.com` (use the host without
   `https://` for `MINIO_ENDPOINT`).

## Step 2 — Push this branch to GitHub

```bash
git push -u origin qa-test
```

## Step 3 — Create the Render Blueprint

1. Render dashboard → **New → Blueprint** → connect the `Sealio` repo → pick branch **qa-test**.
   Render reads `render.yaml` and proposes: `sealio-web`, `sealio-api`, `sealio-mailhog`,
   `sealio-db`.
2. Apply. The first deploy will pause on the `sync: false` secrets — that's expected; fill them in
   next.

## Step 4 — Fill in the environment variables

Render assigns URLs on first deploy. Grab them, then set:

**sealio-api**
- `JWT_PRIVATE_KEY`, `JWT_PUBLIC_KEY` — paste the RS256 PEMs (reuse the pair from `.env.local`).
- `NEXT_PUBLIC_APP_URL` = the **sealio-web** public URL.
- `SMTP_HOST` = the **sealio-mailhog** *internal* hostname (service page → "Internal Address").
- `MINIO_ENDPOINT`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY` = from R2 (Step 1).

**sealio-web**
- `NEXT_PUBLIC_APP_URL` = its own public URL (same value as the API's).
- `INTERNAL_API_URL` and `API_URL` = `http://<sealio-api internal hostname>:3001`.
- `MAILHOG_URL` = `http://<sealio-mailhog internal hostname>:8025`.

> `NEXT_PUBLIC_*` are inlined at build, so after setting them, **trigger a redeploy of sealio-web**.

**sealio-mailhog**
- If the public URL doesn't show the Mailhog UI, set the service's **port to 8025** in Settings.

## Step 5 — Seed the demo accounts

Once `sealio-api` is live, open its **Shell** (Render → service → Shell) and run:

```bash
pnpm db:seed
```

This creates:
- `demo@sealio.local` / `password123` — owner (upload/send/sign as a creator)
- `testuser@sealio.local` / `password123` — **tester role** (can open the **Live UI Test** page)

## Step 6 — Verify

- Open `https://<web>/` → loads.
- `https://<web>/api/health` → `{"status":"ok"}` (proves the proxy).
- Log in as `demo@sealio.local`, upload a PDF, send it to a signer email.
- Open the **Mailhog URL** → read the invite + 6-digit OTP → click the signing link → enter OTP →
  sign.
- Log in as `testuser@sealio.local` → open **Live UI Test** → run the **smoke** phase. OTP-dependent
  steps pass because `MAILHOG_URL` is wired. (A cold first run may trip a couple of timeouts; rerun
  once warm.)

## Step 7 — Share with the tester

Send them: the **app URL**, the **Mailhog URL**, and the credentials above.

---

## Notes / troubleshooting

- **Live UI Test is gated to the `tester` role** — use `testuser@sealio.local`, not the demo owner.
- **Build/runtime:** the API runs through `tsx` (not a compiled `dist/`) because the workspace
  packages `@sealio/db` / `@sealio/types` ship TypeScript source. This matches local dev.
- **pnpm on Render:** the blueprint uses `corepack enable`. If a build can't find pnpm, set the
  build command to `npm i -g pnpm@10 && pnpm install ...` instead.
- **R2 signing:** `MINIO_REGION=auto` is set for R2. Files are streamed via the API, so presigned
  URLs aren't on the critical path.
- **Local dev is unaffected:** with `NEXT_PUBLIC_API_URL` unset (or the localhost value in
  `.env.local`), the browser hits `http://localhost:3001` directly and the rewrite is simply unused.
