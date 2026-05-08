# ArchAI API Contract

This document reflects the current Express API. All AI/model calls go through the backend; provider keys and Supabase service-role keys must never be exposed to frontend code.

## Conventions

- Base path: `/api`
- Request format: JSON unless the endpoint explicitly uses `multipart/form-data`.
- Response envelope: successful API responses use `{ "ok": true, "data": ... }`; errors use `{ "ok": false, "error": { "message": "...", "code": "..." } }`.
- Auth: most APIs require an authenticated user. Local development uses `AUTH_MODE=dev`; Supabase deployments use Bearer JWTs with `AUTH_MODE=supabase`.
- Storage: metadata can use `DATA_BACKEND=json` or `DATA_BACKEND=supabase`; files can use `FILE_STORAGE=local` or `FILE_STORAGE=supabase`.
- IDs are opaque strings. Timestamps are ISO 8601 strings.

## Health And Auth

### `GET /api/health`

Public. Returns backend version and selected provider.

```json
{
  "ok": true,
  "version": "0.1.0",
  "provider": "mock"
}
```

### `GET /api/auth/me`

Requires login. In `AUTH_MODE=dev`, the backend injects the development user. In `AUTH_MODE=supabase`, the request must include a valid Supabase JWT.

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

The API returns metadata and the storage URL. It does not provide a separate `/file` endpoint; local files are served from `/uploads/...`, and Supabase Storage returns public bucket URLs.

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
      "finishedAt": null
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
| `GET` | `/api/billing/credits` | Return current user's credit balance. |
| `GET` | `/api/billing/transactions` | Return current user's credit transaction history. |

Generation jobs debit credits on creation. Failed jobs and cancelled queued/running jobs refund the debit once using the job id as the refund reference.

```json
{
  "ok": true,
  "data": {
    "balance": {
      "userId": "user_123",
      "balance": 990,
      "updatedAt": "2026-05-02T12:00:00.000Z"
    }
  }
}
```

There is no payment checkout or subscription system in the current MVP.

## Admin

Admin APIs require an authenticated user with `role: "admin"`.

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/admin/dashboard` | Return aggregate counts, recent jobs, and recent error jobs. |
| `POST` | `/api/admin/credits/grant` | Grant credits to a user. |

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

For Grsai Banana2 / Nano Banana, configure the backend with:

```bash
AI_PROVIDER=grsai-banana2
GRSAI_API_KEY=your_backend_only_key
GRSAI_BASE_URL=https://grsai.dakka.com.cn
GRSAI_MODEL=nano-banana-2
GRSAI_IMAGE_SIZE=1K
GRSAI_ASPECT_RATIO=auto
```

The legacy `AI_PROVIDER=grsai-nano-banana` alias is still accepted. Grsai keys must stay backend-only. The frontend continues to use `/api/generation-jobs`; it must not call Grsai directly. Grsai result URLs are temporary, so the backend downloads them and saves generated assets through the configured storage adapter.

## Not Implemented

- Password registration/login endpoints; Supabase Auth handles production login.
- Payment checkout, billing webhooks, subscriptions, and packs.
- Audit logs and provider-status admin endpoints.
- Real Revit plugin APIs.
