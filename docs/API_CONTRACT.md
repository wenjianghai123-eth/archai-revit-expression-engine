# ArchAI API Contract

This document reflects the current Express API. All AI/model calls go through the backend; provider keys and Supabase service-role keys must never be exposed to frontend code.

## Conventions

- Base path: `/api`
- Request format: JSON unless the endpoint explicitly uses `multipart/form-data`.
- Response envelope: successful API responses use `{ "ok": true, "data": ... }`; errors use `{ "ok": false, "error": { "message": "...", "code": "..." } }`.
- Auth: most APIs require an authenticated user. Local development uses `AUTH_MODE=dev`; Supabase deployments use Express-signed Bearer JWTs returned by `POST /api/auth/login` when `AUTH_MODE=supabase`.
- Storage: metadata can use `DATA_BACKEND=json` or `DATA_BACKEND=supabase`; files can use `FILE_STORAGE=local` or `FILE_STORAGE=supabase`.
- IDs are opaque strings. Timestamps are ISO 8601 strings.

## Health And Auth

### `GET /api/health`

Public. Returns backend health status. This endpoint does not require login and is suitable for Render health checks.

```json
{
  "ok": true,
  "status": "healthy",
  "version": "0.1.0",
  "provider": "mock"
}
```

### `POST /api/auth/login`

Public. Verifies email/password through the Express backend. In Supabase production mode, Express verifies the password with Supabase Auth server-side, checks `public.profiles` by `id = auth.users.id` with an email fallback, auto-creates a missing `member/active` profile, then returns an Express access token.

```json
{
  "ok": true,
  "data": {
    "user": {
      "id": "00000000-0000-4000-8000-000000000001",
      "email": "dev@archai.local",
      "name": "ArchAI Dev",
      "role": "admin",
      "status": "active",
      "createdAt": "2026-05-02T12:00:00.000Z"
    },
    "accessToken": "jwt",
    "tokenType": "Bearer"
  }
}
```

Compatibility route: `POST /api/login` uses the same handler.

### `GET /api/me`

Requires login. In `AUTH_MODE=dev`, the backend injects the development user. In `AUTH_MODE=supabase`, the request must include the Express JWT returned by `/api/auth/login` as `Authorization: Bearer ...`.

```json
{
  "ok": true,
  "data": {
    "user": {
      "id": "00000000-0000-4000-8000-000000000001",
      "email": "dev@archai.local",
      "name": "ArchAI Dev",
      "role": "admin"
    }
  }
}
```

Compatibility route: `GET /api/auth/me` uses the same handler.

Unknown API routes return `404` with code `API_ROUTE_NOT_FOUND`. This is a route/deployment problem, not a login-expired error.

## Projects

All project endpoints require login and are scoped to the current user.

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/projects` | List current user's non-deleted projects. |
| `POST` | `/api/projects` | Create a project. |
| `GET` | `/api/projects/:id` | Read one owned project. |
| `PATCH` | `/api/projects/:id` | Update `name`, `description`, `status`, or `coverImageUrl`. |
| `DELETE` | `/api/projects/:id` | Soft-delete one owned project. |

Create request:

```json
{
  "name": "Office Lobby Concept",
  "description": "Warm material exploration",
  "status": "active",
  "coverImageUrl": null
}
```

Project response shape:

```json
{
  "ok": true,
  "data": {
    "project": {
      "id": "project_123",
      "userId": "user_123",
      "name": "Office Lobby Concept",
      "description": "Warm material exploration",
      "status": "active",
      "coverImageUrl": null,
      "createdAt": "2026-05-02T12:00:00.000Z",
      "updatedAt": "2026-05-02T12:00:00.000Z"
    }
  }
}
```

Valid project statuses are `active` and `archived`.

## Assets

Image and model asset APIs require login. They only return assets owned by the current user.

### `POST /api/assets/images`

Uploads an image asset. Request is `multipart/form-data` with one `file` field. Supported image content is PNG, JPEG/JPG, and WEBP. The backend validates size, MIME type, extension-derived storage name, and image magic bytes.

```json
{
  "ok": true,
  "data": {
    "asset": {
      "id": "image_123",
      "userId": "user_123",
      "url": "/uploads/1710000000000-id.png",
      "publicUrl": "/uploads/1710000000000-id.png",
      "path": "1710000000000-id.png",
      "storageProvider": "local",
      "filename": "1710000000000-id.png",
      "mimeType": "image/png",
      "size": 102400,
      "createdAt": "2026-05-02T12:00:00.000Z"
    }
  }
}
```

Common errors: `UPLOAD_CONTENT_TYPE_INVALID`, `UPLOAD_BOUNDARY_MISSING`, `UPLOAD_FILE_MISSING`, `UPLOAD_FILE_TOO_LARGE`, `UPLOAD_IMAGE_TYPE_INVALID`, `UPLOAD_MULTIPART_INVALID`.

### Image Reads

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/assets/images/:id` | Return one owned image asset record. |

The API returns metadata and the storage URL. It does not provide a separate `/file` endpoint; local files are served from `/uploads/...`, and Supabase Storage returns public bucket URLs. Image records include `url`, `publicUrl`, `path`, and `storageProvider`; when `FILE_STORAGE=supabase`, `url` and `publicUrl` should be the Supabase public object URL.

### Model Assets

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/assets/models` | List owned model assets. |
| `POST` | `/api/assets/models` | Upload a model asset with `multipart/form-data` field `file`. |
| `GET` | `/api/assets/models/:id` | Return one owned model asset. |
| `DELETE` | `/api/assets/models/:id` | Soft-delete one owned model asset and remove the stored file when possible. |

Supported model extensions are `glb`, `gltf`, and `obj`. The backend validates size, extension, MIME type, and basic file content sniffing.

```json
{
  "ok": true,
  "data": {
    "asset": {
      "id": "model_123",
      "userId": "user_123",
      "url": "/uploads/models/1710000000000-id.glb",
      "filename": "models/1710000000000-id.glb",
      "originalFilename": "concept.glb",
      "fileType": "glb",
      "mimeType": "model/gltf-binary",
      "size": 2048000,
      "createdAt": "2026-05-02T12:00:00.000Z"
    }
  }
}
```

## Generation Jobs

`/api/generation-jobs` is the main generation path. It requires auth, verifies project ownership, verifies all input image assets and mask assets belong to the current user, debits credits, queues async work, stores generated output assets, writes generation results, and creates project generation history.

### `POST /api/generation-jobs`

Clients should send an `Idempotency-Key` header (maximum 128 characters). Repeating
the same authenticated request with the same key returns the existing job without
creating another debit transaction.

```json
{
  "projectId": "project_123",
  "mode": "inpaint",
  "prompt": "Replace the sofa with a wood bench.",
  "config": {
    "style": "modern",
    "lighting": "soft daylight",
    "materialStrength": 0.8,
    "batchCount": 2,
    "maskMode": "asset-mask",
    "maskAssetId": "image_mask_123"
  },
  "inputAssetIds": ["image_input_123"]
}
```

Rules:

- `projectId` must belong to the current user.
- Every `inputAssetIds` item must be an existing image asset owned by the current user.
- `inputAssetIds[0]` is the primary input image. Additional image assets are passed to providers as reference images, including style references and material texture references.
- `mode` is one of `floorplan`, `style-render`, or `inpaint`.
- `config.batchCount` can be `1`, `2`, or `4`; omitted means `1`.
- For `inpaint`, `config.maskMode` is required:
  - `full-image`: no `maskAssetId`; backend generates an explicit full-image mask for the provider.
  - `asset-mask`: `maskAssetId` is required and must be an owned image asset.
- For non-inpaint jobs, `maskMode` and `maskAssetId` are ignored/removed.
- Insufficient credits returns `402` with `CREDITS_INSUFFICIENT`.

Response:

```json
{
  "ok": true,
  "data": {
    "job": {
      "id": "job_123",
      "userId": "user_123",
      "projectId": "project_123",
      "mode": "inpaint",
      "prompt": "Replace the sofa with a wood bench.",
      "config": {
        "style": "modern",
        "maskMode": "asset-mask",
        "maskAssetId": "image_mask_123"
      },
      "inputAssetIds": ["image_input_123"],
      "status": "queued",
      "progress": 0,
      "provider": "mock",
      "outputAssetId": null,
      "outputAssetIds": [],
      "errorMessage": null,
      "createdAt": "2026-05-02T12:00:00.000Z",
      "updatedAt": "2026-05-02T12:00:00.000Z",
      "startedAt": null,
      "finishedAt": null,
      "attemptCount": 0,
      "maxAttempts": 3,
      "nextAttemptAt": null,
      "leaseExpiresAt": null,
      "providerDurationMs": null,
      "lastErrorCode": null,
      "lastErrorCategory": null,
      "lastErrorRetryable": null
    }
  }
}
```

### Job Reads And Cancellation

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/generation-jobs/:id` | Return one owned job with `results`. |
| `POST` | `/api/generation-jobs/:id/cancel` | Cancel a queued/running owned job and refund its debit once. |
| `PATCH` | `/api/generation-results/:id` | Update `isSelected` or `isFavorite` on an owned result. |

Generation result shape:

```json
{
  "id": "result_123",
  "userId": "user_123",
  "projectId": "project_123",
  "jobId": "job_123",
  "assetId": "image_output_123",
  "imageUrl": "/uploads/generated/result.png",
  "isSelected": true,
  "isFavorite": false,
  "createdAt": "2026-05-02T12:01:00.000Z",
  "updatedAt": "2026-05-02T12:01:00.000Z"
}
```

### Legacy Generation Endpoints

| Method | Path |
| --- | --- |
| `POST` | `/api/generate/floorplan` |
| `POST` | `/api/generate/style-render` |
| `POST` | `/api/generate/inpaint` |

These endpoints are legacy development helpers for direct generation responses:

```json
{
  "id": "generation_123",
  "provider": "mock",
  "imageDataUrl": "data:image/svg+xml,...",
  "createdAt": "2026-05-02T12:00:00.000Z",
  "warnings": []
}
```

They do not create generation jobs, do not debit credits, and do not persist job results. They are disabled by default in production via `ENABLE_LEGACY_GENERATION_ENDPOINTS=false` behavior and should only be enabled for explicit local dev/mock debugging.

## Project Generation Records

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/projects/:id/generations` | List generation records for an owned project. |
| `POST` | `/api/projects/:id/generations` | Create a manual/legacy generation record for an owned project. |

Current generation record shape:

```json
{
  "id": "generation_123",
  "userId": "user_123",
  "projectId": "project_123",
  "jobId": "job_123",
  "mode": "style-render",
  "prompt": "A bright interior rendering.",
  "inputImageUrl": "/uploads/input.png",
  "inputImageDataPreview": null,
  "outputImageUrl": "/uploads/generated/output.png",
  "outputImageDataPreview": null,
  "provider": "mock",
  "status": "succeeded",
  "createdAt": "2026-05-02T12:00:00.000Z",
  "updatedAt": "2026-05-02T12:00:00.000Z",
  "results": []
}
```

## Billing And Credits

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/credits` | Return current user's credit balance. |
| `GET` | `/api/billing/credits` | Return current user's credit balance. |
| `GET` | `/api/billing/transactions` | Return current user's credit transaction history. |

Generation jobs debit credits on creation. Failed jobs and cancelled queued/running jobs refund the debit once using the job id as the refund reference.

In Supabase mode the final refund is performed by `refund_generation_job_once`,
which locks the job and credit balance in one database transaction. Retryable
provider failures remain queued and are not refunded until the job reaches a final
failed, timeout, or cancelled status.

```json
{
  "ok": true,
  "data": {
    "balance": 990,
    "creditBalance": {
      "userId": "user_123",
      "balance": 990,
      "updatedAt": "2026-05-02T12:00:00.000Z"
    }
  },
  "balance": 990
}
```

There is no payment checkout or subscription system in the current MVP.

## Admin

Admin APIs require an authenticated user with `role: "admin"`.

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/admin/dashboard` | Return aggregate counts, recent jobs, and recent error jobs. |
| `POST` | `/api/admin/credits/grant` | Grant credits to a user. |

The dashboard also reports queued, running, and retrying jobs; active and expired
leases; average provider duration; attempt counts; and normalized provider error
categories.

Credit grant request:

```json
{
  "userId": "user_123",
  "amount": 100,
  "reason": "Manual support adjustment"
}
```

## Share Links

Share-link creation and revocation require login and project ownership. Public share reads do not require login but only work with a valid, non-revoked, non-expired token.

| Method | Path | Description |
| --- | --- | --- |
| `POST` | `/api/projects/:id/share-links` | Create a view-only share link. |
| `DELETE` | `/api/projects/:id/share-links/:shareLinkId` | Revoke a share link. |
| `GET` | `/api/share/:token` | Read public share payload. |

Create request:

```json
{
  "expiresAt": "2026-06-01T00:00:00.000Z"
}
```

`expiresAt` is optional. If omitted, the backend creates a link valid for 14 days.

Public share response intentionally omits internal user ids and storage adapter details:

```json
{
  "ok": true,
  "data": {
    "share": {
      "link": {
        "permission": "view",
        "expiresAt": "2026-06-01T00:00:00.000Z",
        "createdAt": "2026-05-02T12:00:00.000Z"
      },
      "project": {
        "name": "Office Lobby Concept",
        "description": "Warm material exploration"
      },
      "generations": [
        {
          "id": "generation_123",
          "mode": "style-render",
          "prompt": "A bright interior rendering.",
          "inputImageUrl": "/uploads/input.png",
          "inputImageDataPreview": null,
          "outputImageUrl": "/uploads/generated/output.png",
          "outputImageDataPreview": null,
          "createdAt": "2026-05-02T12:00:00.000Z",
          "results": []
        }
      ]
    }
  }
}
```

## Provider Output Contract

Backend provider adapters normalize output before the server saves a generated asset:

```ts
{
  id: string;
  provider: 'mock' | 'gemini' | 'grsai-banana2' | 'grsai-nano-banana';
  dataUrl: string;
  createdAt: string;
  warnings: string[];
  remoteUrl?: string;
  mimeType?: string;
  metadata?: Record<string, unknown>;
}
```

`dataUrl` must be a valid image data URL. If a provider returns a remote image URL, the backend must download it and convert it first. A remote URL is never saved as if it were a data URL.

Image generation is fixed in the backend to API易 / `nano-banana2`. Configure the backend with:

```bash
APIYI_API_KEY=your_backend_only_apiyi_key
APIYI_API_BASE_URL=https://api.apiyi.com
APIYI_IMAGE_TIMEOUT_MS=300000
```

The frontend continues to use `/api/generation-jobs`; it must not send provider, model, API URL, or API key fields. `APIYI_API_KEY` must stay backend-only.

## Not Implemented

- Password registration/login endpoints; Supabase Auth handles production login.
- Payment checkout, billing webhooks, subscriptions, and packs.
- Audit logs and provider-status admin endpoints.
- Real Revit plugin APIs.

## Project Report Export

The first project-report-package implementation does not add a backend endpoint. `ProjectDetail` composes the report from existing owned project, generation, continuous-edit, asset-download, and share-link APIs.

Exports:

- browser print / Save as PDF;
- `project-report.json` using schema `archai.project-report.v1`;
- a TAR package containing the JSON manifest and formal image files under `images/`.

Image bytes are read through the authenticated `/api/assets/:assetId/download` route when an `assetId` is available. Provider keys and service-role credentials are never included in report metadata.

## Enterprise Asset Knowledge Library

The first unified enterprise asset library does not add an API endpoint or vector-search service. It composes existing material manifests/constants, prompt-template APIs, showcase case configuration, and owned model-asset APIs into the client-side `EnterpriseAsset` model.

Existing ownership rules remain unchanged:

- uploaded model assets are loaded through authenticated owned-asset APIs and appear as personal assets;
- public/curated templates, materials, styles, and showcase cases appear as administrator/enterprise shared resources;
- project associations, favorites, and recent use are browser preferences in this iteration;
- no frontend code receives service-role credentials or model-provider keys.
