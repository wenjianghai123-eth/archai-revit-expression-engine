# ArchAI Product Specification

## Product Positioning

ArchAI is an AI-assisted architectural concept expression and delivery workbench. It helps design teams move from early visual intent to client-ready outputs faster, while keeping all model and AI calls behind the backend.

The product focuses on architectural and interior design expression workflows rather than general image generation. Its priority is to make plan uploads, reference-driven generation, local edits, version review, sharing, and exports feel like one connected delivery process.

## Target Users

- Architectural designers who need fast concept visualization from plans, sketches, or references.
- Interior designers who need reference-based style exploration and partial scene edits.
- Concept and proposal teams who prepare client-facing options under tight timelines.
- Design firms that need a repeatable workflow for project assets, generation history, review, and delivery packages.

## Core Workflow

1. Create a project with basic metadata, design intent, and output goals.
2. Upload floorplans, reference images, material references, and model assets.
3. Generate design schemes from selected inputs, prompts, templates, and style controls.
4. Apply local modifications with mask selection or region-based instructions.
5. Compare versions across generated results, prompts, settings, and source assets.
6. Share selected versions with clients for review and lightweight feedback.
7. Export deliverables such as generated images, project metadata, prompt records, and presentation-ready packages.

## MVP Scope

The MVP should prove the smallest useful loop for architectural expression:

- Upload floorplan and reference images.
- Validate image type and size before generation.
- Generate floorplan-to-expression previews through the Express backend.
- Generate style-render results from reference images.
- Support local inpainting with rectangular mask selection or full-image selection.
- Keep mock provider behavior as a clearly labeled development fallback.
- Route all AI/model calls through backend API endpoints.
- Download generated images.
- Export project metadata JSON.
- Store browser-local generation history with storage safeguards.
- Provide an asset bank for sample assets and local GLB/GLTF preview.
- Provide settings and backend health visibility.
- Keep deployment simple with Vite frontend build served by Express.

## Beta Scope

Beta should turn the MVP loop into a more reliable project workflow:

- Project creation and project-level asset organization.
- Version timeline with prompts, settings, inputs, warnings, and generated outputs.
- Side-by-side version comparison.
- Reuse a previous version as the source for a new generation.
- Richer prompt templates for common architectural and interior scenarios.
- Better local edit tools beyond a single rectangle, while keeping the workflow lightweight.
- Persistent backend storage for projects, assets, masks, and generated results.
- Provider configuration for multiple real AI providers with clear health and fallback states.
- Share links for selected outputs with client-facing read-only review.
- Export packages containing images, metadata, prompts, and selected project assets.
- Basic workspace administration for design teams, without billing complexity.
- Browser QA coverage for upload, generation, mask editing, history, sharing, and export flows.

## Commercial Scope

Commercialization should add team, operational, and delivery capabilities:

- User accounts, organizations, and role-based permissions.
- Paid plans, billing, usage metering, quotas, and invoices.
- Cloud object storage for uploads, generated outputs, previews, and export packages.
- Project dashboards for active proposals, client reviews, and delivery status.
- Client review portals with comments, approvals, and selected version visibility.
- Brandable export templates for design firms.
- Production provider routing with retries, rate-limit handling, cost tracking, and observability.
- Admin controls for provider keys, workspace policies, storage limits, and audit history.
- Team asset libraries for materials, styles, references, and reusable prompt presets.
- Enterprise deployment options, data retention controls, and security review support.

## Out Of Scope For Now

The following capabilities are intentionally deferred:

- Complete Revit plugin support with full bidirectional model synchronization.
- Complex browser-based 3D modeling or editing.
- Multiplayer real-time collaboration.
- Full BIM authoring, IFC/RVT parsing, or construction documentation.
- Photorealistic rendering engine replacement.
- Payment, authentication, or enterprise administration inside the MVP.
- A general-purpose AI image generation marketplace.
- Deep CAD editing, parametric modeling, or quantity takeoff.

## Mature Product Module List

- Project workspace
- Asset upload and asset library
- Floorplan expression generation
- Reference image style rendering
- Local inpainting and region editing
- Prompt template library
- Material and style libraries
- Version history and comparison
- Client sharing and review
- Export and delivery packages
- Backend AI provider orchestration
- Cloud storage and project persistence
- Team workspace management
- User authentication and roles
- Billing and usage metering
- Admin and observability console
- Integration layer for future Revit, BIM, and design-tool workflows
- QA and release validation suite
