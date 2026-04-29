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

## Environment Variables

Create a local `.env` or `.env.local` file for development secrets. These files are ignored by git.

- `AI_PROVIDER`: `mock` by default. Set to `gemini` to attempt real Gemini image generation.
- `GEMINI_API_KEY`: backend-only model API key. Required only when `AI_PROVIDER=gemini`. Do not expose this in frontend code.
- `PORT`: Express backend port. Defaults to `8787`.
- `MAX_IMAGE_MB`: per-image server validation limit. Defaults to `10`.

All AI/model calls must go through the Express backend. The frontend should only call backend API routes.

Example `.env` for local mock development:

```bash
AI_PROVIDER=mock
GEMINI_API_KEY=
PORT=8787
MAX_IMAGE_MB=10
```

Example `.env` for Gemini:

```bash
AI_PROVIDER=gemini
GEMINI_API_KEY=your_backend_only_key
PORT=8787
MAX_IMAGE_MB=10
```

When Gemini is selected but unavailable, unsupported, or unable to return an image, the backend falls back to the mock provider and includes a warning in the response instead of crashing.

## NPM Scripts

- `npm run dev`: start the Vite frontend on port 3000.
- `npm run dev:client`: start the Vite frontend on port 3000.
- `npm run dev:server`: start the Express backend with `tsx server/index.ts`.
- `npm run lint`: run TypeScript checks with `tsc --noEmit`.
- `npm run typecheck`: run TypeScript checks with `tsc --noEmit`.
- `npm run build`: build the frontend for production.
- `npm run preview`: preview the production build.
- `npm run clean`: remove build output.

## MVP Limitations

- Mock generation may be used only as a clearly labeled development fallback.
- Authentication and payments are not included.
- Real Revit plugin support is not included.
- Production priorities are upload, generation, mask selection, download, history, backend-only model calls, and deployability.
- UI polish should not take priority over working MVP flows.
