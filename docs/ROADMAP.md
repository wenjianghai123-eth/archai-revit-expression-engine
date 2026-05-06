# ArchAI Expression Engine Roadmap

## Current / Done

- Vite + React + TypeScript frontend for architectural image expression workflows.
- Express backend serving `/api` routes and production `dist` builds.
- Development auth (`AUTH_MODE=dev`) and optional Supabase Auth (`AUTH_MODE=supabase`).
- JSON metadata backend for local development and optional Supabase DB backend.
- Local file storage and optional Supabase Storage for image, model, mask, and generated-result assets.
- Image upload with multipart parsing, size limits, MIME checks, and magic-byte sniffing.
- Model upload for GLB, GLTF, and OBJ with extension/MIME/content validation.
- Project CRUD with ownership checks.
- Generation jobs with project ownership, input asset ownership, mask asset ownership, credit debit, async processing, generated assets, generation results, project history, cancellation, and refund handling.
- Explicit inpaint mask modes: `asset-mask` and `full-image`.
- Credit balance and transaction APIs, including atomic Supabase RPC for credit adjustments.
- Admin dashboard and manual credit grants for admin users.
- Public share links with limited public payloads.
- Provider adapters for mock, Gemini, and Grsai Nano Banana behind the backend.
- Provider output validation so remote image URLs are downloaded/converted before saving.
- Legacy `/api/generate/*` endpoints retained only as dev/mock helpers and disabled by default in production.
- Focused Vitest coverage for ownership, uploads, credits, legacy endpoint safety, provider output validation, and share-link data exposure.

## Current Boundaries

- This is still an MVP, not a fully hardened production platform.
- No custom password auth; production login relies on Supabase Auth.
- No payment checkout, subscriptions, invoices, or billing webhooks.
- No database migration framework; Supabase is initialized from `docs/SUPABASE_SETUP.md`.
- The generation worker is in-process. It is acceptable for local/dev and simple deployments, but not a durable production queue.
- Rate limiting is lightweight per-process generation job limiting, not distributed abuse protection.
- Local file storage serves `/uploads/...` directly. Sensitive deployments should use private object storage plus signed URL support.
- No real Revit plugin support.
- No IFC/RVT import.
- No collaborative editing.
- No provider observability dashboard beyond basic admin job summaries.

## Next

- Extract the remaining backend routes into smaller route modules after the first `server/index.ts` thinning pass.
- Finish frontend workflow extraction by moving the async generation runner out of `src/App.tsx`.
- Add a durable queue/worker model for generation jobs, retries, cancellation, and job recovery.
- Add structured audit logs for admin actions, credits changes, share-link changes, and generation job lifecycle events.
- Add stronger production rate limits and abuse protection across API routes.
- Add provider health checks, timeout budgets, retry policy, and operational alerts.
- Add private Supabase Storage support with signed URL generation.
- Add database migration/versioning workflow instead of manual SQL copy-paste.
- Add payment and subscription integration once product packaging is defined.
- Expand Playwright E2E coverage for upload, mask selection, async generation, result selection, project history, and share links.

## Post-MVP

- Real Revit plugin for sending views, sheets, geometry context, and generated outputs between Revit and ArchAI.
- IFC/RVT import pipeline with model parsing, geometry simplification, and metadata extraction.
- Organization workspaces, teams, invitations, and role-based access control beyond the current admin flag.
- Collaboration features including comments, review status, version history, and shared project workspaces.
- Richer model asset pipeline for OBJ materials, GLTF external resources, thumbnails, optimization, and persistent previews.
- Production billing, usage metering, quota packages, invoices, and subscription administration.
