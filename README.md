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
- Health check path: `/api/health`

In this mode the browser and backend share the same origin, so leave `VITE_API_BASE_URL` empty. Keep backend variables such as `SUPABASE_SERVICE_ROLE_KEY`, `APIYI_API_KEY`, `JWT_SECRET`, `DATA_BACKEND`, `FILE_STORAGE`, and `AUTH_MODE` on the Node service. Render injects `PORT`; the Express server listens on `process.env.PORT || 8787` and binds `0.0.0.0`.

### Netlify Frontend + Render/Railway Backend

Use this split deployment when Netlify hosts only the static Vite frontend and another platform, such as Render or Railway, runs Express.

- Netlify build command: `npm run build`
- Netlify publish directory: `dist`
- Render/Railway build command: `npm ci && npm run build`
- Render/Railway start command: `npm run start`

In this mode `VITE_API_BASE_URL` is required in the Netlify build environment and must point to the backend origin only, for example `https://your-archai-api.onrender.com`. Netlify does not run `server/index.ts`, so same-origin `/api/...` calls on the Netlify domain will fail without this value.

If the browser shows `API_ROUTE_NOT_FOUND`, first check the Network tab for the exact request URL. A request to `https://guangtian123-eth.netlify.app/api/...` means the static Netlify site is receiving the API call directly; either configure `VITE_API_BASE_URL` to the deployed Express backend and rebuild Netlify, or replace the default Netlify `/api/*` placeholder redirect with a proxy to the backend. Do not use both approaches at the same time. The Express backend logs unknown API requests as `[api] route not found` with method, path, and original URL.

## Environment Variables

Create a local `.env` or `.env.local` file for development secrets. These files are ignored by git.

Frontend build-time variables, visible in browser bundles:

- `VITE_API_BASE_URL`: backend origin for split frontend/backend deployments. Required for Netlify static frontend + Render/Railway backend; leave empty only for same-origin single-service deployments.
- `VITE_ENABLE_LEGACY_GENERATION_FALLBACK`: frontend fallback to old `/api/generate/*` endpoints. Set to `true` only for local dev/mock debugging. Production builds ignore this fallback.

Backend/runtime variables, never expose with a `VITE_` prefix:

- Image generation jobs are fixed in the backend to API易 / `nano-banana2`; the frontend must not choose or send provider/model fields.
- `AUTH_MODE`: `dev` by default. Use `supabase` in production. Express verifies email/password through Supabase Auth at `/api/auth/login`, then signs its own JWT for business APIs.
- `JWT_SECRET`: fixed backend-only secret used to sign Express access tokens. Required in production; changing it invalidates all existing logins.
- `JWT_EXPIRES_IN`: optional access token lifetime. Defaults to `7d`.
- `DATA_BACKEND`: `json` by default. Set to `supabase` to store metadata in Supabase tables.
- `FILE_STORAGE`: `local` by default. Set to `supabase` to store uploaded images, models, and generated results in Supabase Storage.
- `ENABLE_LEGACY_GENERATION_ENDPOINTS`: controls old `/api/generate/*` endpoints. Defaults to disabled; set `true` only for local diagnostics. Production keeps these endpoints disabled even if this flag is set.
- `ENABLE_PROVIDER_FALLBACK`: controls backend fallback from a real provider to mock when the provider fails. Defaults to `true` outside production and `false` in production.
- `SUPABASE_URL`: server-side Supabase project URL for backend adapters. This URL is not a secret, but keep service-role keys backend-only.
- `SUPABASE_STORAGE_BUCKET`: Supabase Storage bucket name used when `FILE_STORAGE=supabase`.
- `SUPABASE_ANON_KEY`: backend-only anon key used by Express to verify email/password through Supabase Auth. Do not expose this from the backend service.
- `SUPABASE_SERVICE_ROLE_KEY`: backend-only Supabase service role key used for admin user creation and storage adapters. Never expose this in frontend code.
- `APIYI_API_KEY`: backend-only API易 API key. Required for image generation. Do not expose this in frontend code, browser requests, localStorage, or any `VITE_*` variable.
- `APIYI_API_BASE_URL`: optional API易 base URL. Defaults to `https://api.apiyi.com`.
- `APIYI_IMAGE_TIMEOUT_MS`: optional API易 request timeout. Defaults to `300000`.
- `APIYI_IMAGE_PROVIDER_ENABLED`: set to `false` only to temporarily disable the backend API易 channel.
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

Example `.env` for local development:

```bash
AUTH_MODE=dev
DATA_BACKEND=json
FILE_STORAGE=local
ENABLE_LEGACY_GENERATION_ENDPOINTS=false
VITE_ENABLE_LEGACY_GENERATION_FALLBACK=false
ENABLE_PROVIDER_FALLBACK=false
APIYI_API_KEY=your_backend_only_apiyi_key
PORT=8787
MAX_IMAGE_MB=10
```

Example `.env` for Supabase Auth:

```bash
AUTH_MODE=supabase
DATA_BACKEND=supabase
FILE_STORAGE=supabase
ENABLE_LEGACY_GENERATION_ENDPOINTS=false
VITE_ENABLE_LEGACY_GENERATION_FALLBACK=false
ENABLE_PROVIDER_FALLBACK=false
APIYI_API_KEY=your_backend_only_apiyi_key
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your_public_anon_key
SUPABASE_STORAGE_BUCKET=archai-assets
VITE_API_BASE_URL=
SUPABASE_SERVICE_ROLE_KEY=your_backend_only_service_role_key
JWT_SECRET=replace-with-a-fixed-long-random-string
PORT=8787
MAX_IMAGE_MB=10
```

Before using `DATA_BACKEND=supabase`, run the SQL in `docs/SUPABASE_SETUP.md`. Before using `FILE_STORAGE=supabase`, create the configured bucket and apply the storage policy guidance in that document.

Keep `APIYI_API_KEY` only in the backend environment. The frontend should never configure or send an API key; it continues to create and poll `/api/generation-jobs`. All image generation jobs are stored with provider `apiyi` and use model `nano-banana2`.

When the fixed provider is unavailable or unable to return an image, jobs fail clearly and refund through the generation job flow. Mock provider behavior is kept only for isolated provider tests and explicitly enabled local diagnostics.

Provider implementations must return a valid image `dataUrl` internally before generated assets are saved. If a provider returns a remote image URL, the backend downloads it and converts it to a data URL first; a failed download is treated as provider failure, never saved as if it were image data.

## Generation APIs

Production generation should use `/api/generation-jobs`. That path requires auth, checks project and asset ownership, deducts credits, runs async generation, stores results, and records history.

The old `/api/generate/floorplan`, `/api/generate/style-render`, and `/api/generate/inpaint` endpoints are legacy development helpers for direct mock generation. They do not create jobs or deduct credits, so they are disabled by default in production. The frontend only falls back to them when `VITE_ENABLE_LEGACY_GENERATION_FALLBACK=true` in a Vite development build.

## Authentication

Local development defaults to `AUTH_MODE=dev`, which injects a single development user and requires no Supabase configuration. This keeps mock generation and local project workflows available after `npm run dev:client` and `npm run dev:server`.

Production authentication uses Express JWT when `AUTH_MODE=supabase` is set. The frontend posts email/password to `POST /api/auth/login`; Express verifies the password with Supabase Auth on the server, checks the matching `public.profiles` row by `id = auth.users.id` with an email fallback, then returns `user`, `accessToken`, and `tokenType=Bearer`. If a Supabase Auth user exists but the profile row is missing, login auto-creates a `role=member`, `status=active` profile so administrator-created Auth users are not blocked by missing business metadata. Disabled profiles still cannot log in. The frontend stores `auth_access_token` in localStorage and sends it on `/api/me`, `/api/projects`, `/api/assets`, `/api/generation-jobs`, prompt templates, credits, and admin APIs. Accounts are created by administrators; public registration and magic-link login are intentionally not used.

Manual profile activation or admin promotion can be done in Supabase SQL editor:

```sql
insert into public.profiles (id, email, name, role, status)
select id, email, coalesce(raw_user_meta_data->>'name', split_part(email, '@', 1)), 'member', 'active'
from auth.users
where email = 'user@example.com'
on conflict (id) do update
set email = excluded.email,
    name = excluded.name,
    status = 'active',
    updated_at = now();

-- Optional: make the first administrator account an admin.
update public.profiles
set role = 'admin', status = 'active', updated_at = now()
where email = 'admin@example.com';
```

`VITE_*` variables are embedded by Vite at build time. After setting or changing `VITE_API_BASE_URL` on Vercel, Netlify, Render, or another hosting platform, rebuild and redeploy the frontend. Updating only runtime server variables will not change an already-built browser bundle.

Frontend deployment checklist:

- If the frontend and backend are deployed separately, set `VITE_API_BASE_URL` to the backend origin, for example `https://api.example.com`.
- After changing any `VITE_*` variable, run `npm run build` again and redeploy the frontend. Only restarting the backend will not update the already-built browser bundle.
- Keep `SUPABASE_SERVICE_ROLE_KEY`, `APIYI_API_KEY`, and any other backend secret only in the backend environment. Do not add them with a `VITE_` prefix.

### Netlify Frontend Deployment

Netlify deploys this Vite app as static frontend files only. It is suitable for showing the landing page and frontend shell, but full AI generation requires an independently deployed Express backend. Netlify does not run the Express backend from `server/index.ts`, so `/api/...` on the Netlify domain will return the SPA fallback or fail unless you deploy the backend separately and point the frontend at it.

Deploy the Express backend to a server platform such as Render or Railway, then configure the browser-facing variables in Netlify, not only in local `.env` files or the backend service:

- Open Netlify Site configuration -> Environment variables.
- Add `VITE_API_BASE_URL` for split frontend/backend deployments.
- Set `VITE_API_BASE_URL` to the backend origin only, for example `https://your-archai-api.onrender.com`, not to the Supabase URL and not with a trailing `/api`.
- Make sure each variable's Scope includes Builds.
- Make sure the Production deploy context has values for these variables; branch deploy or deploy-preview values do not fix a Production deploy unless Production also has values.
- Set Build command to `npm run build`.
- Set Publish directory to `dist`.
- Keep `netlify.toml` publish set to `dist`; `public/_redirects` is copied into `dist/_redirects` during `npm run build` for SPA routing.
- The default `public/_redirects` and `netlify.toml` put `/api/*` before the SPA fallback and return `api-not-configured.json`. This prevents API requests from being rewritten to `index.html` when no backend URL is configured.
- After changing any `VITE_*` value, use Clear cache and deploy site so Netlify rebuilds the browser bundle with the new values.
- To confirm the Netlify build environment before building, run `npm run check:env` in the build log or temporarily set the build command to `npm run check:env && npm run build`.

Optional proxy mode: if you intentionally want the frontend to call same-origin `/api/...` on Netlify, replace the default `/api/* /api-not-configured.json 404` rule with a Netlify redirect proxy before the SPA fallback:

```text
/api/* https://your-archai-api.onrender.com/api/:splat 200
/* /index.html 200
```

The default repository config does not include this proxy because the backend domain is deployment-specific. Without that proxy, `VITE_API_BASE_URL` is required for Netlify static frontend deployments.

Keep backend-only secrets such as `SUPABASE_SERVICE_ROLE_KEY` and `APIYI_API_KEY` on the Render/Railway backend service. Do not add them to Netlify with a `VITE_` prefix.

Complete AI generation deployment requires the Express backend to be deployed with:

- `Supabase` tables and storage configured.
- `DATA_BACKEND=supabase`
- `FILE_STORAGE=supabase`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_STORAGE_BUCKET`
- `JWT_SECRET`
- `CORS_ORIGIN=https://guangtian123-eth.netlify.app` or a comma-separated list that includes the Netlify frontend origin.
- `APIYI_API_KEY` for fixed API易 / `nano-banana2` image generation.

The Netlify frontend build environment then needs:

- `VITE_API_BASE_URL=https://your-backend.example.com`

## Storage

Metadata storage is selected with `DATA_BACKEND`. Local development uses `DATA_BACKEND=json`, which writes metadata to `data/app-db.json`. Production can use `DATA_BACKEND=supabase` after creating the tables in `docs/SUPABASE_SETUP.md`.

File storage is selected with `FILE_STORAGE`. Local development uses `FILE_STORAGE=local`, which writes files under `uploads/` and serves them from `/uploads/...`. Production can use `FILE_STORAGE=supabase`, which uploads images, models, and generated results to `SUPABASE_STORAGE_BUCKET` using the backend-only service role key. For the current MVP public-preview flow, configure that Supabase bucket with `public = true`; otherwise image previews need signed URL support before using a private bucket.

Image asset responses include `url`, `publicUrl`, `path`, and `storageProvider`. With `FILE_STORAGE=supabase`, `url`/`publicUrl` are Supabase public URLs. With local storage, they remain `/uploads/...`, and the frontend resolves those relative asset paths against `VITE_API_BASE_URL` when Netlify and Render are deployed separately.

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

The E2E suite starts its own backend and frontend servers with `AUTH_MODE=dev`, `DATA_BACKEND=json`, and isolated `e2e-data/` plus `e2e-uploads/` directories.

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
