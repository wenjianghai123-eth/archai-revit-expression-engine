# AGENTS.md

Guidance for agents working on ArchAI Expression Engine, a Vite + React + TypeScript + Tailwind + Express MVP.

## Project Rules

- Keep changes small and reviewable.
- Do not rewrite the whole UI unless necessary.
- Do not commit `node_modules` or `dist`.
- Do not expose `GEMINI_API_KEY` or any model API key in frontend code.
- All AI/model calls must go through the Express backend.
- Prefer type-safe TypeScript. Avoid `any` unless unavoidable.
- Preserve the Chinese UI copy style.
- After every implementation task, run:
  - `npm run lint`
  - `npm run build`
- If a command fails, explain the failure and fix it before finishing.
- For MVP, prioritize working upload, generation, mask selection, download, history, and deployability over visual polish.
- Supabase Auth is allowed for this MVP only with administrator-created accounts. Do not add public user registration, self-serve signup, payment, or real Revit plugin support.
- Keep mock fallback behavior only as a development fallback, clearly labeled as mock.
