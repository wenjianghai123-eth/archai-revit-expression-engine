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
- `GRSAI_API_KEY`: backend-only model API key. Required only when `AI_PROVIDER=grsai-nano-banana`. Do not expose this in frontend code.
- `GRSAI_BASE_URL`: optional Grsai API base URL. Defaults to `https://grsai.dakka.com.cn`.
- `GRSAI_MODEL`: optional Grsai model name. Defaults to `nano-banana-fast`.
- `PORT`: Express backend port. Defaults to `8787`.
- `MAX_IMAGE_MB`: per-image server validation limit. Defaults to `10`.

All AI/model calls must go through the Express backend. The frontend should only call backend API routes.

Example `.env` for local mock development:

```bash
AI_PROVIDER=mock
GRSAI_API_KEY=
PORT=8787
MAX_IMAGE_MB=10
```

Example `.env` for Grsai Nano Banana:

```bash
AI_PROVIDER=grsai-nano-banana
GRSAI_API_KEY=your_backend_only_key
GRSAI_BASE_URL=https://grsai.dakka.com.cn
GRSAI_MODEL=nano-banana-fast
PORT=8787
MAX_IMAGE_MB=10
```

When a real provider is selected but unavailable, unsupported, or unable to return an image, the backend falls back to the mock provider and includes a warning in the response instead of crashing.

## NPM Scripts

- `npm run dev`: start the Vite frontend on port 3000.
- `npm run dev:client`: start the Vite frontend on port 3000.
- `npm run dev:server`: start the Express backend with `tsx server/index.ts`.
- `npm run lint`: run TypeScript checks with `tsc --noEmit`.
- `npm run typecheck`: run TypeScript checks with `tsc --noEmit`.
- `npm run build`: build the frontend for production.
- `npm run start`: start the Express server and serve `dist` after a production build.
- `npm run preview`: preview the production build.
- `npm run clean`: remove build output.

## MVP Limitations

- Mock generation may be used only as a clearly labeled development fallback.
- Authentication and payments are not included.
- Real Revit plugin support is not included.
- Production priorities are upload, generation, mask selection, download, history, backend-only model calls, and deployability.
- UI polish should not take priority over working MVP flows.
