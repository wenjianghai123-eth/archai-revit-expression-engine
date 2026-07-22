# ArchAI Data Model

This document reflects the current storage adapter model. The same TypeScript-facing shape is used by `DATA_BACKEND=json` and `DATA_BACKEND=supabase`; Supabase stores snake_case columns and maps them back to these camelCase fields.

## Current Relationships

```text
User -> Project -> ImageAsset / ModelAsset
User -> Project -> GenerationJob -> GenerationResult
User -> Project -> GenerationRecord
Project -> ShareLink
User -> Project -> DesignWorkflow -> DesignWorkflowNode
User -> CreditBalance -> CreditTransaction
```

There is no workspace/team model in the current MVP. Future workspace and billing entities are noted at the end of this document.

## User

Users are provided by development auth or Supabase Auth. They are not stored in the JSON/Supabase storage adapter tables except through `userId` references.

Current server user shape:

| Field | Type | Notes |
| --- | --- | --- |
| `id` | string | Dev user id or Supabase user id. |
| `email` | string | Used for display/auth context. |
| `name` | string | Display name. |
| `role` | `admin` \| `member` | Admin role can access admin APIs. |

## Project

| Field | Type | Notes |
| --- | --- | --- |
| `id` | string | Opaque project id. |
| `userId` | string | Owner. All project APIs are scoped by this field. |
| `name` | string | Required. |
| `description` | string | Defaults to empty string. |
| `status` | `active` \| `archived` | Only these two states are currently valid. |
| `coverImageUrl` | string \| null | Optional project cover. |
| `createdAt` | ISO string | Creation time. |
| `updatedAt` | ISO string | Last update time. |
| `deletedAt` | ISO string \| null | Soft delete marker. |

## ImageAsset

| Field | Type | Notes |
| --- | --- | --- |
| `id` | string | Opaque image asset id. |
| `userId` | string | Owner. Generation jobs validate ownership for all input and mask assets. |
| `url` | string | Local `/uploads/...`, Supabase public URL, or legacy data URL in older records. |
| `filename` | string | Stored filename/key. |
| `mimeType` | string | PNG, JPEG, WEBP, SVG for generated masks/results where applicable. |
| `size` | number | Stored byte size. |
| `createdAt` | ISO string | Creation time. |

## ModelAsset

| Field | Type | Notes |
| --- | --- | --- |
| `id` | string | Opaque model asset id. |
| `userId` | string | Owner. |
| `url` | string | Local `/uploads/models/...` or Supabase Storage public URL. |
| `filename` | string | Stored filename/key. |
| `originalFilename` | string | User-supplied file name after path stripping. |
| `fileType` | `glb` \| `gltf` \| `obj` | Current accepted formats. |
| `mimeType` | string | Validated against file type. |
| `size` | number | Stored byte size. |
| `createdAt` | ISO string | Creation time. |
| `deletedAt` | ISO string \| null | Soft delete marker. |

## GenerationJob

| Field | Type | Notes |
| --- | --- | --- |
| `id` | string | Opaque job id. |
| `userId` | string | Owner. |
| `projectId` | string | Owned project id. |
| `mode` | `floorplan` \| `style-render` \| `inpaint` | Workflow type. |
| `prompt` | string | Provider prompt. |
| `config` | object | Includes style settings, `batchCount`, and inpaint `maskMode`/`maskAssetId`. |
| `inputAssetIds` | string[] | Owned image assets. |
| `status` | `queued` \| `running` \| `succeeded` \| `failed` \| `cancelled` | Job lifecycle. |
| `progress` | number | 0-100. |
| `provider` | string | `mock`, `gemini`, `grsai-banana2`, or `grsai-nano-banana`. |
| `outputAssetId` | string \| null | First selected/generated output. |
| `outputAssetIds` | string[] | All output assets for batched jobs. |
| `errorMessage` | string \| null | Failure reason. |
| `createdAt` | ISO string | Creation time. |
| `updatedAt` | ISO string | Last update time. |
| `startedAt` | ISO string \| null | Worker start time. |
| `finishedAt` | ISO string \| null | Terminal time. |
| `idempotencyKey` | string \| null | User-scoped request key; unique when present. |
| `attemptCount` | number | Number of durable worker claims. |
| `maxAttempts` | number | Maximum claims before terminal failure. |
| `nextAttemptAt` | ISO string \| null | Earliest time a retry may be claimed. |
| `leaseOwner` | string \| null | Worker currently holding the job lease. |
| `leaseExpiresAt` | ISO string \| null | Expired leases can be reclaimed after restart. |
| `heartbeatAt` | ISO string \| null | Most recent lease heartbeat. |
| `executionTimeoutAt` | ISO string \| null | Per-attempt execution deadline. |
| `providerStartedAt` / `providerFinishedAt` | ISO string \| null | Provider request timing. |
| `providerDurationMs` | number \| null | Provider wall-clock duration. |
| `lastErrorCode` | string \| null | Normalized provider/worker error code. |
| `lastErrorCategory` | string \| null | Timeout, rate limit, auth, network, storage, etc. |
| `lastErrorRetryable` | boolean \| null | Whether the last failure was eligible for retry. |
| `results` | GenerationResult[] | Included by some read APIs. |

## GenerationResult

| Field | Type | Notes |
| --- | --- | --- |
| `id` | string | Opaque result id. |
| `userId` | string | Owner. |
| `projectId` | string | Parent project. |
| `jobId` | string | Parent job. |
| `assetId` | string | Generated image asset. |
| `imageUrl` | string | Stored generated asset URL. |
| `isSelected` | boolean | Preferred result marker. |
| `isFavorite` | boolean | User favorite marker. |
| `resultKey` | string \| null | Job-scoped idempotency key for one output index. |
| `createdAt` | ISO string | Creation time. |
| `updatedAt` | ISO string | Last update time. |

## GenerationRecord

Generation records power project history and public share payloads.

## DesignWorkflow

A project design workflow tracks the current position in the connected design-expression process without changing existing `GenerationStep` values.

| Field | Type | Notes |
| --- | --- | --- |
| `id` | string | Opaque workflow id. |
| `userId` | string | Project owner. |
| `projectId` | string | Owned project. |
| `title` | string | Defaults to `设计表达流程`. |
| `status` | `active` \| `completed` \| `archived` | Delivery marks the workflow completed; back navigation can reactivate it. |
| `currentNodeId` | string \| null | Pointer only; moving it does not delete later nodes. |
| `createdAt` | ISO string | Creation time. |
| `updatedAt` | ISO string | Last workflow movement. |

## DesignWorkflowNode

Workflow nodes are immutable relationship/history records except for generation completion fields and status. Branching is represented by multiple nodes sharing an earlier parent.

| Field | Type | Notes |
| --- | --- | --- |
| `workflowId` | string | Parent workflow. |
| `parentNodeId` | string \| null | Previous workflow node. |
| `stageKey` | workflow stage key | Independent from `GenerationStep`. |
| `status` | `active` \| `completed` \| `skipped` | Skipped steps remain visible in history. |
| `sourceFeature` | string \| null | Feature that supplied this node. |
| `inputAssetId` | string \| null | Formal image asset used by the stage. |
| `parentJobId` | string \| null | Generation job that produced the input. |
| `parentResultId` | string \| null | Selected generation result that produced the input asset. |
| `outputJobId` | string \| null | Generation job created in this stage. |
| `outputResultId` | string \| null | Persisted result selected for downstream use. |
| `outputAssetId` | string \| null | Formal generated asset. |
| `metadata` | object | Optional stage context; no image base64 is stored. |

| Field | Type | Notes |
| --- | --- | --- |
| `id` | string | Opaque record id. |
| `userId` | string | Owner. |
| `projectId` | string | Parent project. |
| `jobId` | string \| null | Linked async job when available. |
| `mode` | `floorplan` \| `style-render` \| `inpaint` | Workflow type. |
| `prompt` | string | Prompt used. |
| `inputImageUrl` | string \| null | Stored input image URL. |
| `inputImageDataPreview` | string \| null | Legacy/local preview fallback. |
| `outputImageUrl` | string \| null | Stored output image URL. |
| `outputImageDataPreview` | string \| null | Legacy/local preview fallback. |
| `provider` | string | Provider used. |
| `status` | `succeeded` \| `failed` | Record status. |
| `createdAt` | ISO string | Creation time. |
| `updatedAt` | ISO string | Last update time. |
| `results` | GenerationResult[] | Optional joined results. |

## ShareLink

| Field | Type | Notes |
| --- | --- | --- |
| `id` | string | Opaque share link id. |
| `projectId` | string | Shared project. |
| `token` | string | Public token. Store and transmit carefully. |
| `permission` | `view` | Current MVP supports view-only links. |
| `expiresAt` | ISO string | Expiration time. Defaults to 14 days from creation if omitted. |
| `createdAt` | ISO string | Creation time. |
| `revokedAt` | ISO string \| null | Revocation marker. |

Public share responses intentionally expose a smaller payload and omit `userId`, internal ownership fields, credit data, and admin data.

## Credits

### CreditBalance

| Field | Type | Notes |
| --- | --- | --- |
| `userId` | string | Balance owner. |
| `balance` | number | Current available credits. |
| `updatedAt` | ISO string | Last update time. |

### CreditTransaction

| Field | Type | Notes |
| --- | --- | --- |
| `id` | string | Opaque transaction id. |
| `userId` | string | Owner. |
| `type` | `grant` \| `debit` \| `refund` | Current transaction types. |
| `amount` | number | Debit is negative; grant/refund are positive. |
| `balanceAfter` | number | Balance after the transaction. |
| `reason` | string | Human-readable reason. |
| `referenceType` | `generation_job` \| `system` \| null | Reference category. |
| `referenceId` | string \| null | Used for idempotent debits/refunds. |
| `createdAt` | ISO string | Creation time. |

## AdminDashboard

The admin dashboard is a computed view, not a persisted table.

| Field | Type |
| --- | --- |
| `stats.userCount` | number |
| `stats.projectCount` | number |
| `stats.generationJobCount` | number |
| `stats.succeededJobCount` | number |
| `stats.failedJobCount` | number |
| `stats.totalCreditsConsumed` | number |
| `stats.queuedJobCount` | number |
| `stats.runningJobCount` | number |
| `stats.retryingJobCount` | number |
| `stats.expiredLeaseJobCount` | number |
| `stats.leasedJobCount` | number |
| `stats.averageProviderDurationMs` | number |
| `recentJobs` | GenerationJob[] |
| `recentErrorJobs` | GenerationJob[] |

## Future Entities

These are not implemented yet and should not be assumed in current API clients:

- Workspaces, organizations, team membership, and invitations.
- Payment checkout, subscriptions, invoices, billing usage records, and billing webhooks.
- Audit logs.
- Provider health/status tables.
- Revit, IFC, or RVT model import entities.

## Project Report Package

`archai.project-report.v1` is a derived, replaceable client-side report model. It is assembled from an owned `Project`, selected `GenerationResult` records, continuous-edit sessions/versions/messages, and the latest share link. It does not add a database table and does not duplicate image base64.

The model contains:

- project cover and objective;
- formal source image assets;
- selected candidate schemes and before/after comparisons;
- scheme descriptions, material summaries, quality status, and primary-scheme markers;
- continuous-edit modification history;
- active/revoked/expired share-link state;
- a deduplicated image-file manifest using formal `assetId` and stored URLs.

The same model drives browser print/PDF, JSON metadata export, and the TAR report package containing `project-report.json` plus an `images/` directory.

## Enterprise Asset Knowledge Model

The first enterprise knowledge-library iteration uses a derived `EnterpriseAsset` model rather than introducing a new database table or vector database. Existing materials, furniture styles, prompt templates, showcase cases, and uploaded model assets are adapted without replacing their original records.

Supported knowledge kinds:

```text
material
furniture
lighting
plant
person
style-reference
project-case
prompt-template
```

Each unified asset includes:

- stable namespaced id and original record reference;
- kind, category, tags, name, description, and preview URL;
- visibility (`personal` or `administrator-shared`);
- source type, source label, original filename, and creator when available;
- formal `assetId` when the source record has one;
- optional creation time.

Favorites, recent-use timestamps, and project associations are stored as browser preferences under `archai-enterprise-asset-preferences-v1` for this first iteration. Existing prompt-template favorite/recent keys are migrated when read. A later iteration can replace this preference store with organization-scoped backend persistence without changing the unified asset interface.
