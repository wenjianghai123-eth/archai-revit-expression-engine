# ArchAI Expression Engine MVP 0.1

ArchAI Expression Engine is an MVP for architectural image expression workflows. It provides a Vite + React frontend for prompt templates, generation controls, upload/mask workflows, generated-result review, local history, project views, and asset browsing. AI/model calls run through an Express backend.

Current backend capabilities include:

- Development auth and optional Supabase Auth.
- JSON metadata storage for local development and optional Supabase DB storage.
- Local file storage and optional Supabase Storage for image, mask, model, and generated-result files.
- Authenticated project, asset, generation job, credit, share-link, and admin APIs.
- Async generation jobs with project/asset ownership checks, credit debit/refund, persisted output assets, generation results, and project generation records.
- Provider adapters for `mock`, Gemini, and Grsai Banana2 / Nano Banana, with runtime output validation before generated assets are saved.
- Legacy direct `/api/generate/*` endpoints for explicit local dev/mock debugging only.

This is still an MVP. Supabase modes are usable as optional deployment building blocks, but production hardening still needs external job workers/queues, monitoring, operational rate limits, database backups, provider observability, and a real billing/payment system.

## Local Setup

Prerequisites:

- Node.js 20+
- npm

Install dependencies:

```bash
npm install
```

Run the frontend:

```bash
npm run dev:client
```

Run the backend:

```bash
npm run dev:server
```

For local development, run `npm run dev:client` and `npm run dev:server` in separate terminals. The frontend calls the Express backend for `/api` routes.

Build for production:

```bash
npm run build
```

Start the production server:

```bash
npm run start
```

After `npm run build`, Express serves the generated `dist` frontend and continues to handle `/api` routes on the same server.

## Deployment Modes

### Single-Service Deployment

Deploy this repository as one Node service when the hosting platform can run the Express backend. Use:

- Build command: `npm ci && npm run build`
- Start command: `npm run start`
- Runtime service: `server/index.ts`, which serves both `/api/...` and the built `dist` frontend

In this mode the browser and backend share the same origin, so leave `VITE_API_BASE_URL` empty. Keep backend variables such as `SUPABASE_SERVICE_ROLE_KEY`, `GRSAI_API_KEY`, `DATA_BACKEND`, `FILE_STORAGE`, and `AUTH_MODE` on the Node service.

### Netlify Frontend + Render/Railway Backend

Use this split deployment when Netlify hosts only the static Vite frontend and another platform, such as Render or Railway, runs Express.

- Netlify build command: `npm run build`
- Netlify publish directory: `dist`
- Render/Railway build command: `npm ci && npm run build`
- Render/Railway start command: `npm run start`

In this mode `VITE_API_BASE_URL` is required in the Netlify build environment and must point to the backend origin only, for example `https://your-archai-api.onrender.com`. Netlify does not run `server/index.ts`, so same-origin `/api/...` calls on the Netlify domain will fail without this value.

## Environment Variables

Create a local `.env` or `.env.local` file for development secrets. These files are ignored by git.

Frontend build-time variables, visible in browser bundles:

- `VITE_SUPABASE_URL`: Supabase project URL for the browser client. Required when using Supabase Auth.
- `VITE_SUPABASE_ANON_KEY`: Supabase anon key for the browser client. Required when using Supabase Auth.
- `VITE_API_BASE_URL`: backend origin for split frontend/backend deployments. Required for Netlify static frontend + Render/Railway backend; leave empty only for same-origin single-service deployments.
- `VITE_ENABLE_LEGACY_GENERATION_FALLBACK`: frontend fallback to old `/api/generate/*` endpoints. Set to `true` only for local dev/mock debugging. Production builds ignore this fallback.

Backend/runtime variables, never expose with a `VITE_` prefix:

- `GENERATION_PROVIDER`: `mock` by default. Set to `grsai` to use the GRS AI Banana2 provider through the backend. Legacy `AI_PROVIDER` values (`mock`, `gemini`, `grsai-banana2`, `grsai-nano-banana`) are still accepted when `GENERATION_PROVIDER` is unset.
- `GEMINI_API_KEY`: backend-only Gemini API key. Required only when `AI_PROVIDER=gemini`.
- `GEMINI_IMAGE_MODEL`: optional Gemini image model. Defaults in code to `gemini-2.5-flash-image-preview`.
- `AUTH_MODE`: `dev` by default. Use `supabase` in production to require Supabase Auth JWTs for project, asset, and generation job APIs.
- `DATA_BACKEND`: `json` by default. Set to `supabase` to store metadata in Supabase tables.
- `FILE_STORAGE`: `local` by default. Set to `supabase` to store uploaded images, models, and generated results in Supabase Storage.
- `ENABLE_LEGACY_GENERATION_ENDPOINTS`: controls old `/api/generate/*` endpoints. Defaults to enabled outside production and disabled in production. Production keeps these endpoints disabled even if this flag is set.
- `ENABLE_PROVIDER_FALLBACK`: controls backend fallback from a real provider to mock when the provider fails. Defaults to `true` outside production and `false` in production.
- `SUPABASE_URL`: server-side Supabase project URL for backend adapters. This URL is not a secret, but keep service-role keys backend-only.
- `SUPABASE_STORAGE_BUCKET`: Supabase Storage bucket name used when `FILE_STORAGE=supabase`.
- `SUPABASE_SERVICE_ROLE_KEY`: backend-only Supabase service role key used to validate JWTs. Never expose this in frontend code.
- `GRSAI_API_KEY`: backend-only model API key. Required only when `GENERATION_PROVIDER=grsai`, `AI_PROVIDER=grsai-banana2`, or `AI_PROVIDER=grsai-nano-banana`. Do not expose this in frontend code.
- `GRSAI_BASE_URL`: optional Grsai API base URL. Defaults to `https://grsai.dakka.com.cn` for China direct access. Overseas deployments can use `https://grsaiapi.com`.
- `GRSAI_MODEL`: optional Grsai model name. Defaults to `nano-banana-2`.
- `GRSAI_IMAGE_SIZE`: optional Grsai output size. Defaults to `1K`.
- `GRSAI_ASPECT_RATIO`: optional Grsai aspect ratio. Defaults to `auto`.
- `GRSAI_POLL_INTERVAL_MS`: optional Grsai result polling interval. Defaults to `2500`.
- `GRSAI_POLL_TIMEOUT_MS`: optional Grsai result polling timeout. Defaults to `180000`.
- `GRSAI_DOWNLOAD_TIMEOUT_MS`: optional timeout for downloading Grsai temporary result URLs. Defaults to `30000`.
- `PORT`: Express backend port. Defaults to `8787`.
- `HOST`: Express bind host. Defaults to `0.0.0.0`.
- `DATA_DIR`: JSON backend directory. Defaults to `data`.
- `UPLOADS_DIR`: local file storage directory. Defaults to `uploads`.
- `MAX_IMAGE_MB`: per-image server validation limit. Defaults to `10`.
- `MAX_MODEL_MB`: per-model server validation limit. Defaults to `600`.
- `GENERATION_JOB_RATE_LIMIT_PER_MINUTE`: per-user generation job creation limit. Defaults to `10`.
- `ARCHAI_DISABLE_GENERATION_WORKER`: test/dev switch. Set to `true` to stop the in-process generation worker from automatically processing queued jobs.
- `CORS_ORIGIN`: comma-separated browser origins allowed to call the backend. Defaults to local Vite origins.
- `CORS_ORIGINS`: alternate comma-separated CORS variable name; `CORS_ORIGIN` takes precedence.

All AI/model calls must go through the Express backend. The frontend should only call backend API routes.

Example `.env` for local mock development:

```bash
GENERATION_PROVIDER=mock
AUTH_MODE=dev
DATA_BACKEND=json
FILE_STORAGE=local
ENABLE_LEGACY_GENERATION_ENDPOINTS=true
VITE_ENABLE_LEGACY_GENERATION_FALLBACK=true
ENABLE_PROVIDER_FALLBACK=true
GRSAI_API_KEY=
PORT=8787
MAX_IMAGE_MB=10
```

Example `.env` for Supabase Auth:

```bash
GENERATION_PROVIDER=mock
AUTH_MODE=supabase
DATA_BACKEND=supabase
FILE_STORAGE=supabase
ENABLE_LEGACY_GENERATION_ENDPOINTS=false
VITE_ENABLE_LEGACY_GENERATION_FALLBACK=false
ENABLE_PROVIDER_FALLBACK=false
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_STORAGE_BUCKET=archai-assets
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_public_anon_key
VITE_API_BASE_URL=
SUPABASE_SERVICE_ROLE_KEY=your_backend_only_service_role_key
PORT=8787
MAX_IMAGE_MB=10
```

Before using `DATA_BACKEND=supabase`, run the SQL in `docs/SUPABASE_SETUP.md`. Before using `FILE_STORAGE=supabase`, create the configured bucket and apply the storage policy guidance in that document.

Example `.env` for Grsai Banana2 / Nano Banana:

```bash
GENERATION_PROVIDER=grsai
AUTH_MODE=dev
DATA_BACKEND=json
FILE_STORAGE=local
ENABLE_LEGACY_GENERATION_ENDPOINTS=false
ENABLE_PROVIDER_FALLBACK=false
GRSAI_API_KEY=your_backend_only_key
GRSAI_BASE_URL=https://grsai.dakka.com.cn
GRSAI_MODEL=nano-banana-2
GRSAI_IMAGE_SIZE=1K
GRSAI_ASPECT_RATIO=auto
PORT=8787
MAX_IMAGE_MB=10
```

Keep the Grsai API key only in the backend environment. The frontend should never configure or send a Grsai key; it continues to create and poll `/api/generation-jobs`. Grsai result URLs are temporary, so the backend immediately downloads the image and stores it through this project's configured asset storage before exposing the final result to history or projects.

When a real provider is selected but unavailable, unsupported, or unable to return an image, the backend falls back to the mock provider only when `ENABLE_PROVIDER_FALLBACK=true` or when running outside production without an explicit fallback setting. In production, provider fallback defaults to disabled so failed real-provider jobs fail clearly and refund through the generation job flow.

Provider implementations must return a valid image `dataUrl` internally before generated assets are saved. If a provider returns a remote image URL, the backend downloads it and converts it to a data URL first; a failed download is treated as provider failure, never saved as if it were image data.

## Generation APIs

Production generation should use `/api/generation-jobs`. That path requires auth, checks project and asset ownership, deducts credits, runs async generation, stores results, and records history.

The old `/api/generate/floorplan`, `/api/generate/style-render`, and `/api/generate/inpaint` endpoints are legacy development helpers for direct mock generation. They do not create jobs or deduct credits, so they are disabled by default in production. The frontend only falls back to them when `VITE_ENABLE_LEGACY_GENERATION_FALLBACK=true` in a Vite development build.

## Authentication

Local development defaults to `AUTH_MODE=dev`, which injects a single development user and requires no Supabase configuration. This keeps mock generation and local project workflows available after `npm run dev:client` and `npm run dev:server`.

Production authentication uses Supabase when `AUTH_MODE=supabase` is set. The frontend uses `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` for email + password login and logout. Accounts are created by administrators; public registration and magic-link login are intentionally not used. The Express backend uses `SUPABASE_SERVICE_ROLE_KEY` only on the server to validate incoming Bearer JWTs. Project, asset, and generation job APIs return `401` when a valid Supabase session is not present.

`VITE_*` variables are embedded by Vite at build time. After setting or changing `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, or `VITE_API_BASE_URL` on Vercel, Netlify, Render, or another hosting platform, rebuild and redeploy the frontend. Updating only runtime server variables will not change an already-built browser bundle.

Frontend deployment checklist:

- Configure `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in the frontend deployment platform's build environment, not only in the backend service.
- If the frontend and backend are deployed separately, set `VITE_API_BASE_URL` to the backend origin, for example `https://api.example.com`.
- After changing any `VITE_*` variable, run `npm run build` again and redeploy the frontend. Only restarting the backend will not update the already-built browser bundle.
- Keep `SUPABASE_SERVICE_ROLE_KEY`, `GRSAI_API_KEY`, and any other model/provider secret only in the backend environment. Do not add them with a `VITE_` prefix.

### Netlify Frontend Deployment

Netlify deploys this Vite app as static frontend files only. It does not run the Express backend from `server/index.ts`, so `/api/...` on the Netlify domain will return 404 unless you deploy the backend separately and point the frontend at it.

Deploy the Express backend to a server platform such as Render or Railway, then configure the browser-facing variables in Netlify, not only in local `.env` files or the backend service:

- Open Netlify Site configuration -> Environment variables.
- Add `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and, for split frontend/backend deployments, `VITE_API_BASE_URL`.
- Set `VITE_API_BASE_URL` to the backend origin only, for example `https://your-archai-api.onrender.com`, not to the Supabase URL and not with a trailing `/api`.
- Make sure each variable's Scope includes Builds.
- Make sure the Production deploy context has values for these variables; branch deploy or deploy-preview values do not fix a Production deploy unless Production also has values.
- Set Build command to `npm run build`.
- Set Publish directory to `dist`.
- After changing any `VITE_*` value, use Clear cache and deploy site so Netlify rebuilds the browser bundle with the new values.
- To confirm the Netlify build environment before building, run `npm run check:env` in the build log or temporarily set the build command to `npm run check:env && npm run build`.

Keep backend-only secrets such as `SUPABASE_SERVICE_ROLE_KEY` and `GRSAI_API_KEY` on the Render/Railway backend service. Do not add them to Netlify with a `VITE_` prefix.

## Storage

Metadata storage is selected with `DATA_BACKEND`. Local development uses `DATA_BACKEND=json`, which writes metadata to `data/app-db.json`. Production can use `DATA_BACKEND=supabase` after creating the tables in `docs/SUPABASE_SETUP.md`.

File storage is selected with `FILE_STORAGE`. Local development uses `FILE_STORAGE=local`, which writes files under `uploads/` and serves them from `/uploads/...`. Production can use `FILE_STORAGE=supabase`, which uploads images, models, and generated results to `SUPABASE_STORAGE_BUCKET` using the backend-only service role key.

## NPM Scripts

- `npm run dev`: start the Vite frontend on port 3000.
- `npm run dev:client`: start the Vite frontend on port 3000.
- `npm run dev:server`: start the Express backend with `tsx server/index.ts`.
- `npm run lint`: run TypeScript checks with `tsc --noEmit`.
- `npm run typecheck`: run TypeScript checks with `tsc --noEmit`.
- `npm run test`: run Vitest tests.
- `npm run test:watch`: run Vitest in watch mode.
- `npm run test:e2e`: run Playwright end-to-end tests against local mock/dev/json services with the Chromium project.
- `npm run build`: build the frontend for production.
- `npm run start`: start the Express server and serve `dist` after a production build.
- `npm run preview`: preview the production build.
- `npm run clean`: remove build output.

The E2E config includes both `chromium` and `msedge` projects. Ordinary local validation uses Chromium so a missing Edge install does not block `npm run test:e2e`.

```bash
npx playwright install chromium
npm run test:e2e
```

To explicitly run the Edge project, install Edge support and select that project:

```bash
npx playwright install msedge
npx playwright test --project=msedge
```

The E2E suite starts its own backend and frontend servers with `AI_PROVIDER=mock`, `AUTH_MODE=dev`, `DATA_BACKEND=json`, and isolated `e2e-data/` plus `e2e-uploads/` directories.

## Continuous Integration

GitHub Actions runs CI on `push` and `pull_request` with mock/dev configuration only, so no real AI API keys or Supabase secrets are required. The required CI job installs dependencies with `npm ci`, then runs `npm run typecheck`, `npm run build`, and `npm run test`.

An optional Playwright E2E job is also configured. It installs a Playwright browser on Linux and runs `npm run test:e2e`; failures in that job are reported without blocking the required build job.

## MVP Limitations

- Mock generation may be used only as a clearly labeled development fallback.
- Payments are not included.
- Real Revit plugin support is not included.
- Production priorities are upload, generation, mask selection, download, history, backend-only model calls, and deployability.
- UI polish should not take priority over working MVP flows.
- The in-process worker and JSON storage are not designed for concurrent multi-instance production traffic. Use Supabase RPC-backed credits for stronger credit consistency, and add durable queues plus monitoring before serious production usage.
