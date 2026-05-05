# ArchAI Expression Engine MVP 0.1

ArchAI Expression Engine is an MVP for architectural image expression workflows. It provides a Vite + React frontend for prompt templates, generation controls, image preview, session history, and asset browsing, with AI/model calls intended to run through an Express backend.

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

Run the backend when server routes are present:

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

## Environment Variables

Create a local `.env` or `.env.local` file for development secrets. These files are ignored by git.

- `AI_PROVIDER`: `mock` by default. Set to `grsai-nano-banana` to attempt real Grsai Nano Banana image generation.
- `AUTH_MODE`: `dev` by default. Use `supabase` in production to require Supabase Auth JWTs for project, asset, and generation job APIs.
- `DATA_BACKEND`: `json` by default. Set to `supabase` to store metadata in Supabase tables.
- `FILE_STORAGE`: `local` by default. Set to `supabase` to store uploaded images, models, and generated results in Supabase Storage.
- `SUPABASE_URL`: backend-only Supabase project URL for server adapters.
- `SUPABASE_STORAGE_BUCKET`: Supabase Storage bucket name used when `FILE_STORAGE=supabase`.
- `VITE_SUPABASE_URL`: Supabase project URL for the browser client. Required when using Supabase Auth.
- `VITE_SUPABASE_ANON_KEY`: Supabase anon key for the browser client. Required when using Supabase Auth.
- `SUPABASE_SERVICE_ROLE_KEY`: backend-only Supabase service role key used to validate JWTs. Never expose this in frontend code.
- `GRSAI_API_KEY`: backend-only model API key. Required only when `AI_PROVIDER=grsai-nano-banana`. Do not expose this in frontend code.
- `GRSAI_BASE_URL`: optional Grsai API base URL. Defaults to `https://grsai.dakka.com.cn`.
- `GRSAI_MODEL`: optional Grsai model name. Defaults to `nano-banana-fast`.
- `PORT`: Express backend port. Defaults to `8787`.
- `MAX_IMAGE_MB`: per-image server validation limit. Defaults to `10`.
- `MAX_MODEL_MB`: per-model server validation limit. Defaults to `50`.
- `GENERATION_JOB_RATE_LIMIT_PER_MINUTE`: per-user generation job creation limit. Defaults to `10`.
- `CORS_ORIGIN`: comma-separated browser origins allowed to call the backend. Defaults to local Vite origins.

All AI/model calls must go through the Express backend. The frontend should only call backend API routes.

Example `.env` for local mock development:

```bash
AI_PROVIDER=mock
AUTH_MODE=dev
DATA_BACKEND=json
FILE_STORAGE=local
GRSAI_API_KEY=
PORT=8787
MAX_IMAGE_MB=10
```

Example `.env` for Supabase Auth:

```bash
AI_PROVIDER=mock
AUTH_MODE=supabase
DATA_BACKEND=supabase
FILE_STORAGE=supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_STORAGE_BUCKET=archai-assets
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_public_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_backend_only_service_role_key
PORT=8787
MAX_IMAGE_MB=10
```

Example `.env` for Grsai Nano Banana:

```bash
AI_PROVIDER=grsai-nano-banana
AUTH_MODE=dev
DATA_BACKEND=json
FILE_STORAGE=local
GRSAI_API_KEY=your_backend_only_key
GRSAI_BASE_URL=https://grsai.dakka.com.cn
GRSAI_MODEL=nano-banana-fast
PORT=8787
MAX_IMAGE_MB=10
```

When a real provider is selected but unavailable, unsupported, or unable to return an image, the backend falls back to the mock provider and includes a warning in the response instead of crashing.

## Authentication

Local development defaults to `AUTH_MODE=dev`, which injects a single development user and requires no Supabase configuration. This keeps mock generation and local project workflows available after `npm run dev:client` and `npm run dev:server`.

Production authentication uses Supabase when `AUTH_MODE=supabase` is set. The frontend uses `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` for email magic-link login and logout. The Express backend uses `SUPABASE_SERVICE_ROLE_KEY` only on the server to validate incoming Bearer JWTs. Project, asset, and generation job APIs return `401` when a valid Supabase session is not present.

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
- `npm run test:e2e`: run Playwright end-to-end tests against local mock/dev/json services.
- `npm run build`: build the frontend for production.
- `npm run start`: start the Express server and serve `dist` after a production build.
- `npm run preview`: preview the production build.
- `npm run clean`: remove build output.

The E2E config uses the local Microsoft Edge channel on Windows. If Edge is not available on a fresh machine, install a Playwright browser binary and adjust `playwright.config.ts` if needed:

```bash
npx playwright install chromium
```

The E2E suite starts its own backend and frontend servers with `AI_PROVIDER=mock`, `AUTH_MODE=dev`, `DATA_BACKEND=json`, and isolated `e2e-data/` plus `e2e-uploads/` directories.

## Continuous Integration

GitHub Actions runs CI on `push` and `pull_request` with mock/dev configuration only, so no real AI API keys or Supabase secrets are required. The required CI job installs dependencies with `npm ci`, then runs `npm run typecheck`, `npm run build`, and `npm run test`.

An optional Playwright E2E job is also configured. It installs the Playwright Edge browser on Linux and runs `npm run test:e2e`; failures in that job are reported without blocking the required build job.

## MVP Limitations

- Mock generation may be used only as a clearly labeled development fallback.
- Payments are not included.
- Real Revit plugin support is not included.
- Production priorities are upload, generation, mask selection, download, history, backend-only model calls, and deployability.
- UI polish should not take priority over working MVP flows.
