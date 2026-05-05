# ArchAI Data Model

This document describes the mature-product data model for ArchAI. The current MVP can keep most of these entities as local or mock structures, while the commercial product should persist them in backend storage.

## Model Relationships

Primary workflow relationship:

```text
User -> Workspace -> Project -> GenerationJob -> GenerationResult
```

Supporting relationships:

- `Workspace` has many `User` members through workspace membership.
- `Workspace` has many `Project`, `PromptTemplate`, `BillingUsage`, `CreditTransaction`, and `AuditLog` records.
- `Project` has many `ImageAsset`, `ModelAsset`, `GenerationJob`, `GenerationResult`, and `ShareLink` records.
- `GenerationJob` references source `ImageAsset`, optional `ModelAsset`, optional `PromptTemplate`, and produces one or more `GenerationResult` records.
- `GenerationResult` references its parent `GenerationJob` and may create new `ImageAsset` records for reusable outputs.
- `ShareLink` can expose one project, one result, or a curated result collection.
- `BillingUsage` and `CreditTransaction` are workspace-level commercial records.
- `AuditLog` records important user, workspace, project, generation, sharing, billing, and admin events.

## User

Represents a person who can sign in, belong to workspaces, and perform actions.

| Field | Type | Required | Purpose | MVP Needed | Commercial Needed |
| --- | --- | --- | --- | --- | --- |
| `id` | string | Yes | Stable user identifier. | No | Yes |
| `email` | string | Yes | Login and notification address. | No | Yes |
| `name` | string | Yes | Display name in project and audit views. | No | Yes |
| `avatarUrl` | string | No | Optional profile image. | No | Yes |
| `role` | `owner` \| `admin` \| `member` \| `viewer` | Yes | Default role when shown outside a workspace-specific membership table. | No | Yes |
| `createdAt` | datetime | Yes | Account creation time. | No | Yes |
| `updatedAt` | datetime | Yes | Last profile update time. | No | Yes |
| `lastLoginAt` | datetime | No | Security and activity tracking. | No | Yes |
| `status` | `active` \| `invited` \| `disabled` | Yes | Account lifecycle state. | No | Yes |

## Workspace

Represents a design firm, team, or organization account.

| Field | Type | Required | Purpose | MVP Needed | Commercial Needed |
| --- | --- | --- | --- | --- | --- |
| `id` | string | Yes | Stable workspace identifier. | No | Yes |
| `name` | string | Yes | Workspace display name. | No | Yes |
| `slug` | string | Yes | URL-friendly workspace handle. | No | Yes |
| `ownerUserId` | string | Yes | User who owns billing and top-level administration. | No | Yes |
| `plan` | `free` \| `pro` \| `team` \| `enterprise` | Yes | Product plan and feature entitlement. | No | Yes |
| `creditBalance` | number | Yes | Remaining generation credits. | No | Yes |
| `storageLimitBytes` | number | Yes | Workspace storage cap. | No | Yes |
| `createdAt` | datetime | Yes | Workspace creation time. | No | Yes |
| `updatedAt` | datetime | Yes | Last workspace settings update time. | No | Yes |
| `status` | `active` \| `past_due` \| `suspended` | Yes | Billing and access state. | No | Yes |

## Project

Represents a design project that groups assets, generation jobs, results, and sharing.

| Field | Type | Required | Purpose | MVP Needed | Commercial Needed |
| --- | --- | --- | --- | --- | --- |
| `id` | string | Yes | Stable project identifier. | Yes | Yes |
| `workspaceId` | string | Yes | Owning workspace. | No | Yes |
| `createdByUserId` | string | Yes | User who created the project. | No | Yes |
| `name` | string | Yes | Project name shown in the UI. | Yes | Yes |
| `description` | string | No | Brief project intent or client notes. | No | Yes |
| `clientName` | string | No | Client-facing project context. | No | Yes |
| `status` | `draft` \| `active` \| `review` \| `archived` | Yes | Project lifecycle state. | No | Yes |
| `coverImageAssetId` | string | No | Thumbnail or hero image for project lists. | No | Yes |
| `createdAt` | datetime | Yes | Project creation time. | Yes | Yes |
| `updatedAt` | datetime | Yes | Last project update time. | Yes | Yes |

## GenerationJob

Represents a request sent to the backend generation system.

| Field | Type | Required | Purpose | MVP Needed | Commercial Needed |
| --- | --- | --- | --- | --- | --- |
| `id` | string | Yes | Stable job identifier. | Yes | Yes |
| `workspaceId` | string | Yes | Workspace charged for the job. | No | Yes |
| `projectId` | string | Yes | Project containing the job. | No | Yes |
| `createdByUserId` | string | Yes | User who initiated generation. | No | Yes |
| `mode` | `floorplan` \| `style-render` \| `inpaint` | Yes | Generation workflow type. | Yes | Yes |
| `provider` | string | Yes | Provider selected or used for the request. | Yes | Yes |
| `providerJobId` | string | No | External provider job identifier. | No | Yes |
| `status` | `queued` \| `running` \| `succeeded` \| `failed` \| `cancelled` | Yes | Backend job state. | Yes | Yes |
| `prompt` | string | Yes | Prompt sent to the provider. | Yes | Yes |
| `negativePrompt` | string | No | Optional constraints. | No | Yes |
| `config` | object | Yes | Generation settings, style, strength, lighting, and model options. | Yes | Yes |
| `inputImageAssetIds` | string[] | Yes | Source floorplans or reference images. | Yes | Yes |
| `maskImageAssetId` | string | No | Mask used for local inpainting. | Yes | Yes |
| `modelAssetId` | string | No | Optional model source. | No | Yes |
| `promptTemplateId` | string | No | Template used to produce the prompt. | No | Yes |
| `errorMessage` | string | No | Human-readable failure reason. | Yes | Yes |
| `warnings` | string[] | No | Fallback or quality warnings. | Yes | Yes |
| `startedAt` | datetime | No | Execution start time. | No | Yes |
| `completedAt` | datetime | No | Execution completion time. | No | Yes |
| `createdAt` | datetime | Yes | Job creation time. | Yes | Yes |

## GenerationResult

Represents one generated output and its metadata.

| Field | Type | Required | Purpose | MVP Needed | Commercial Needed |
| --- | --- | --- | --- | --- | --- |
| `id` | string | Yes | Stable result identifier. | Yes | Yes |
| `jobId` | string | Yes | Parent generation job. | Yes | Yes |
| `projectId` | string | Yes | Project containing the result. | No | Yes |
| `workspaceId` | string | Yes | Owning workspace. | No | Yes |
| `imageAssetId` | string | Yes | Stored generated image asset. | No | Yes |
| `imageDataUrl` | string | No | Inline image payload for local MVP storage. | Yes | No |
| `thumbnailUrl` | string | No | Small preview image. | No | Yes |
| `width` | number | No | Output image width. | No | Yes |
| `height` | number | No | Output image height. | No | Yes |
| `mimeType` | string | Yes | Output media type. | Yes | Yes |
| `seed` | string | No | Reproducibility metadata where supported. | No | Yes |
| `providerMetadata` | object | No | Provider response details. | No | Yes |
| `isSelected` | boolean | Yes | Marks a preferred version. | No | Yes |
| `createdAt` | datetime | Yes | Result creation time. | Yes | Yes |

## ImageAsset

Represents uploaded or generated image files.

| Field | Type | Required | Purpose | MVP Needed | Commercial Needed |
| --- | --- | --- | --- | --- | --- |
| `id` | string | Yes | Stable asset identifier. | Yes | Yes |
| `workspaceId` | string | Yes | Owning workspace. | No | Yes |
| `projectId` | string | No | Project association. | No | Yes |
| `uploadedByUserId` | string | No | User who uploaded or generated the asset. | No | Yes |
| `source` | `upload` \| `generated` \| `sample` \| `mask` | Yes | Asset origin. | Yes | Yes |
| `name` | string | Yes | Original or display filename. | Yes | Yes |
| `mimeType` | string | Yes | File media type. | Yes | Yes |
| `sizeBytes` | number | Yes | Storage size and validation. | Yes | Yes |
| `storageKey` | string | No | Object storage key. | No | Yes |
| `url` | string | No | Resolved file URL. | No | Yes |
| `dataUrl` | string | No | Local MVP payload. | Yes | No |
| `width` | number | No | Image width. | No | Yes |
| `height` | number | No | Image height. | No | Yes |
| `createdAt` | datetime | Yes | Asset creation time. | Yes | Yes |

## ModelAsset

Represents uploaded model files such as GLB, GLTF, or future BIM-adjacent assets.

| Field | Type | Required | Purpose | MVP Needed | Commercial Needed |
| --- | --- | --- | --- | --- | --- |
| `id` | string | Yes | Stable model asset identifier. | Yes | Yes |
| `workspaceId` | string | Yes | Owning workspace. | No | Yes |
| `projectId` | string | No | Project association. | No | Yes |
| `uploadedByUserId` | string | No | User who uploaded the model. | No | Yes |
| `name` | string | Yes | Original or display filename. | Yes | Yes |
| `format` | `glb` \| `gltf` \| `obj` \| `ifc` \| `rvt` | Yes | Model file type. | Yes | Yes |
| `mimeType` | string | Yes | File media type. | Yes | Yes |
| `sizeBytes` | number | Yes | Validation and storage usage. | Yes | Yes |
| `storageKey` | string | No | Object storage key. | No | Yes |
| `previewImageAssetId` | string | No | Thumbnail or rendered preview. | No | Yes |
| `metadata` | object | No | Units, dimensions, source notes, and parser details. | Yes | Yes |
| `isPreviewSupported` | boolean | Yes | Whether the app can preview this format. | Yes | Yes |
| `createdAt` | datetime | Yes | Upload time. | Yes | Yes |

## PromptTemplate

Represents reusable prompt and configuration presets.

| Field | Type | Required | Purpose | MVP Needed | Commercial Needed |
| --- | --- | --- | --- | --- | --- |
| `id` | string | Yes | Stable template identifier. | Yes | Yes |
| `workspaceId` | string | No | Owning workspace for custom templates. | No | Yes |
| `createdByUserId` | string | No | User who created the template. | No | Yes |
| `name` | string | Yes | Template display name. | Yes | Yes |
| `description` | string | No | Template usage explanation. | Yes | Yes |
| `feature` | `floorplan` \| `style-render` \| `inpaint` | Yes | Workflow where the template applies. | Yes | Yes |
| `prompt` | string | Yes | Prompt text or prompt body. | Yes | Yes |
| `config` | object | Yes | Default generation settings. | Yes | Yes |
| `tags` | string[] | No | Search and organization. | Yes | Yes |
| `visibility` | `system` \| `workspace` \| `private` | Yes | Template access scope. | No | Yes |
| `createdAt` | datetime | Yes | Template creation time. | Yes | Yes |
| `updatedAt` | datetime | Yes | Last template update time. | No | Yes |

## ShareLink

Represents a read-only link for client review or external delivery.

| Field | Type | Required | Purpose | MVP Needed | Commercial Needed |
| --- | --- | --- | --- | --- | --- |
| `id` | string | Yes | Stable share link identifier. | No | Yes |
| `workspaceId` | string | Yes | Owning workspace. | No | Yes |
| `projectId` | string | Yes | Shared project. | No | Yes |
| `createdByUserId` | string | Yes | User who created the link. | No | Yes |
| `tokenHash` | string | Yes | Secure lookup token hash. | No | Yes |
| `scope` | `project` \| `result` \| `collection` | Yes | Shared content scope. | No | Yes |
| `resultIds` | string[] | No | Specific shared results. | No | Yes |
| `expiresAt` | datetime | No | Optional expiration time. | No | Yes |
| `allowDownload` | boolean | Yes | Whether clients can download shared outputs. | No | Yes |
| `isActive` | boolean | Yes | Enables or disables access. | No | Yes |
| `createdAt` | datetime | Yes | Link creation time. | No | Yes |
| `lastAccessedAt` | datetime | No | Review activity tracking. | No | Yes |

## BillingUsage

Represents metered usage for billing and quota reporting.

| Field | Type | Required | Purpose | MVP Needed | Commercial Needed |
| --- | --- | --- | --- | --- | --- |
| `id` | string | Yes | Stable usage record identifier. | No | Yes |
| `workspaceId` | string | Yes | Workspace charged for usage. | No | Yes |
| `userId` | string | No | User who triggered usage. | No | Yes |
| `projectId` | string | No | Related project. | No | Yes |
| `generationJobId` | string | No | Related generation job. | No | Yes |
| `usageType` | `generation` \| `storage` \| `export` \| `share` | Yes | Metered activity type. | No | Yes |
| `quantity` | number | Yes | Amount consumed. | No | Yes |
| `unit` | `credit` \| `byte` \| `request` | Yes | Billing unit. | No | Yes |
| `provider` | string | No | Provider used for generation-related usage. | No | Yes |
| `costCents` | number | No | Internal or billable cost. | No | Yes |
| `recordedAt` | datetime | Yes | Usage event time. | No | Yes |

## CreditTransaction

Represents credit purchases, grants, usage deductions, refunds, and adjustments.

| Field | Type | Required | Purpose | MVP Needed | Commercial Needed |
| --- | --- | --- | --- | --- | --- |
| `id` | string | Yes | Stable transaction identifier. | No | Yes |
| `workspaceId` | string | Yes | Workspace whose balance changes. | No | Yes |
| `userId` | string | No | User responsible for the transaction. | No | Yes |
| `billingUsageId` | string | No | Usage record that caused a deduction. | No | Yes |
| `type` | `purchase` \| `grant` \| `deduction` \| `refund` \| `adjustment` | Yes | Transaction category. | No | Yes |
| `amount` | number | Yes | Positive or negative credit delta. | No | Yes |
| `balanceAfter` | number | Yes | Workspace credit balance after transaction. | No | Yes |
| `description` | string | No | Human-readable transaction note. | No | Yes |
| `externalPaymentId` | string | No | Payment processor reference. | No | Yes |
| `createdAt` | datetime | Yes | Transaction time. | No | Yes |

## AuditLog

Records security, billing, sharing, project, and generation events.

| Field | Type | Required | Purpose | MVP Needed | Commercial Needed |
| --- | --- | --- | --- | --- | --- |
| `id` | string | Yes | Stable audit event identifier. | No | Yes |
| `workspaceId` | string | No | Workspace where the event occurred. | No | Yes |
| `actorUserId` | string | No | User who performed the action. | No | Yes |
| `action` | string | Yes | Machine-readable event name. | No | Yes |
| `entityType` | string | Yes | Target model type. | No | Yes |
| `entityId` | string | No | Target model identifier. | No | Yes |
| `metadata` | object | No | Additional structured event data. | No | Yes |
| `ipAddress` | string | No | Security context. | No | Yes |
| `userAgent` | string | No | Client context. | No | Yes |
| `createdAt` | datetime | Yes | Event time. | No | Yes |
