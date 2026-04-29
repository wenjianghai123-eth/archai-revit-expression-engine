# ArchAI Expression Engine Roadmap

## Current MVP Scope

- Vite + React + TypeScript frontend for architectural image expression workflows.
- Express backend API for health checks and image generation requests.
- Mock provider by default, with optional Gemini provider behind the backend only.
- Floorplan image upload, validation, preview, and generation request flow.
- Optional material reference image upload.
- Local inpainting workflow with rectangular mask selection.
- Download generated image and export project metadata JSON.
- Browser-local generation history with size-aware storage safeguards.
- AssetBank with sample assets and local GLB/GLTF preview; OBJ is metadata-only.
- Settings modal showing provider mode, backend health, and mock/real provider status.

## Current MVP Boundaries

- No authentication.
- No payment or billing.
- No backend database.
- No cloud object storage.
- No real Revit plugin support.
- No IFC/RVT import.
- No collaborative editing.
- No persistence for large uploaded model files.

## Post-MVP Roadmap

- Real Revit plugin for sending views, sheets, geometry context, and generated outputs between Revit and ArchAI.
- IFC/RVT import pipeline with model parsing, geometry simplification, and metadata extraction.
- User accounts, organization workspaces, and role-based access control.
- Cloud storage for uploads, generated results, model assets, masks, and project packages.
- Collaboration features including shared projects, comments, review status, and version history.
- Billing, usage metering, quota management, and subscription administration.
- Production provider management with per-provider health, retries, rate-limit handling, and observability.
- Richer model asset pipeline for OBJ materials, GLTF external resources, thumbnails, and persistent previews.
- Automated browser QA covering upload, generation, masking, download, history, and AssetBank flows.
