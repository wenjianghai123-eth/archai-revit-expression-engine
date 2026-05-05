# ArchAI API Contract

This document defines the backend API contract for ArchAI as it grows from the current MVP into a mature commercial product. All AI/model calls must go through backend APIs. API keys must never be exposed to frontend code.

## Conventions

- Base path: `/api`
- Request format: JSON unless the endpoint explicitly uses `multipart/form-data`.
- Response format: JSON.
- Authentication: commercial APIs use bearer session tokens or secure cookies. MVP APIs may run without authentication.
- Timestamps: ISO 8601 strings.
- IDs: opaque strings.

Standard error response:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Readable error message.",
    "details": {}
  }
}
```

## MVP Priority Interfaces

### List Projects

| Field | Value |
| --- | --- |
| Method | `GET` |
| Path | `/api/projects` |
| Requires Login | No for MVP, Yes later |
| MVP Implemented | Planned |

Request body: none.

Response body:

```json
{
  "projects": [
    {
      "id": "project_123",
      "name": "Office Lobby Concept",
      "description": "Warm material exploration",
      "status": "active",
      "coverImageUrl": null,
      "createdAt": "2026-05-02T12:00:00.000Z",
      "updatedAt": "2026-05-02T12:00:00.000Z"
    }
  ]
}
```

Error response:

```json
{
  "error": {
    "code": "PROJECT_LIST_FAILED",
    "message": "Unable to load projects.",
    "details": {}
  }
}
```

### Create Project

| Field | Value |
| --- | --- |
| Method | `POST` |
| Path | `/api/projects` |
| Requires Login | No for MVP, Yes later |
| MVP Implemented | Planned |

Request body:

```json
{
  "name": "Office Lobby Concept",
  "description": "Warm material exploration",
  "clientName": "Example Client"
}
```

Response body:

```json
{
  "project": {
    "id": "project_123",
    "name": "Office Lobby Concept",
    "description": "Warm material exploration",
    "clientName": "Example Client",
    "status": "active",
    "createdAt": "2026-05-02T12:00:00.000Z",
    "updatedAt": "2026-05-02T12:00:00.000Z"
  }
}
```

Error response:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Project name is required.",
    "details": {
      "field": "name"
    }
  }
}
```

### Get Project

| Field | Value |
| --- | --- |
| Method | `GET` |
| Path | `/api/projects/:id` |
| Requires Login | No for MVP, Yes later |
| MVP Implemented | Planned |

Request body: none.

Response body:

```json
{
  "project": {
    "id": "project_123",
    "name": "Office Lobby Concept",
    "description": "Warm material exploration",
    "clientName": "Example Client",
    "status": "active",
    "createdAt": "2026-05-02T12:00:00.000Z",
    "updatedAt": "2026-05-02T12:00:00.000Z"
  }
}
```

Error response:

```json
{
  "error": {
    "code": "PROJECT_NOT_FOUND",
    "message": "Project not found.",
    "details": {
      "id": "project_123"
    }
  }
}
```

### Update Project

| Field | Value |
| --- | --- |
| Method | `PATCH` |
| Path | `/api/projects/:id` |
| Requires Login | No for MVP, Yes later |
| MVP Implemented | Planned |

Request body:

```json
{
  "name": "Office Lobby Concept V2",
  "description": "Updated direction",
  "status": "review"
}
```

Response body:

```json
{
  "project": {
    "id": "project_123",
    "name": "Office Lobby Concept V2",
    "description": "Updated direction",
    "status": "review",
    "updatedAt": "2026-05-02T13:00:00.000Z"
  }
}
```

Error response:

```json
{
  "error": {
    "code": "PROJECT_UPDATE_FAILED",
    "message": "Unable to update project.",
    "details": {}
  }
}
```

### Delete Project

| Field | Value |
| --- | --- |
| Method | `DELETE` |
| Path | `/api/projects/:id` |
| Requires Login | No for MVP, Yes later |
| MVP Implemented | Planned |

Request body: none.

Response body:

```json
{
  "deleted": true,
  "id": "project_123"
}
```

Error response:

```json
{
  "error": {
    "code": "PROJECT_DELETE_FAILED",
    "message": "Unable to delete project.",
    "details": {}
  }
}
```

### Create Generation Job

| Field | Value |
| --- | --- |
| Method | `POST` |
| Path | `/api/generation-jobs` |
| Requires Login | No for MVP, Yes later |
| MVP Implemented | Planned |

Request body:

```json
{
  "projectId": "project_123",
  "mode": "floorplan",
  "prompt": "Create a warm modern architectural presentation plan.",
  "config": {
    "style": "modern",
    "lighting": "golden hour",
    "materialStrength": 0.8
  },
  "inputImageAssetIds": ["image_123"],
  "maskImageAssetId": null,
  "modelAssetId": null,
  "promptTemplateId": null
}
```

Response body:

```json
{
  "job": {
    "id": "job_123",
    "projectId": "project_123",
    "mode": "floorplan",
    "provider": "mock",
    "status": "queued",
    "prompt": "Create a warm modern architectural presentation plan.",
    "config": {
      "style": "modern",
      "lighting": "golden hour",
      "materialStrength": 0.8
    },
    "warnings": [],
    "createdAt": "2026-05-02T12:00:00.000Z"
  }
}
```

Error response:

```json
{
  "error": {
    "code": "GENERATION_JOB_INVALID",
    "message": "At least one input image is required.",
    "details": {
      "field": "inputImageAssetIds"
    }
  }
}
```

### Get Generation Job

| Field | Value |
| --- | --- |
| Method | `GET` |
| Path | `/api/generation-jobs/:id` |
| Requires Login | No for MVP, Yes later |
| MVP Implemented | Planned |

Request body: none.

Response body:

```json
{
  "job": {
    "id": "job_123",
    "projectId": "project_123",
    "mode": "floorplan",
    "provider": "mock",
    "status": "succeeded",
    "prompt": "Create a warm modern architectural presentation plan.",
    "config": {
      "style": "modern"
    },
    "warnings": [],
    "createdAt": "2026-05-02T12:00:00.000Z",
    "completedAt": "2026-05-02T12:01:00.000Z"
  },
  "results": [
    {
      "id": "result_123",
      "jobId": "job_123",
      "imageAssetId": "image_result_123",
      "imageUrl": "/api/assets/images/image_result_123/file",
      "createdAt": "2026-05-02T12:01:00.000Z"
    }
  ]
}
```

Error response:

```json
{
  "error": {
    "code": "GENERATION_JOB_NOT_FOUND",
    "message": "Generation job not found.",
    "details": {
      "id": "job_123"
    }
  }
}
```

### List Project Generations

| Field | Value |
| --- | --- |
| Method | `GET` |
| Path | `/api/projects/:id/generations` |
| Requires Login | No for MVP, Yes later |
| MVP Implemented | Planned |

Request body: none.

Response body:

```json
{
  "generations": [
    {
      "job": {
        "id": "job_123",
        "projectId": "project_123",
        "mode": "floorplan",
        "provider": "mock",
        "status": "succeeded",
        "prompt": "Create a warm modern architectural presentation plan.",
        "createdAt": "2026-05-02T12:00:00.000Z"
      },
      "results": [
        {
          "id": "result_123",
          "imageAssetId": "image_result_123",
          "imageUrl": "/api/assets/images/image_result_123/file",
          "createdAt": "2026-05-02T12:01:00.000Z"
        }
      ]
    }
  ]
}
```

Error response:

```json
{
  "error": {
    "code": "PROJECT_NOT_FOUND",
    "message": "Project not found.",
    "details": {
      "id": "project_123"
    }
  }
}
```

### Upload Image Asset

| Field | Value |
| --- | --- |
| Method | `POST` |
| Path | `/api/assets/images` |
| Requires Login | No for MVP, Yes later |
| MVP Implemented | Planned |

Request body: `multipart/form-data`

| Field | Type | Required |
| --- | --- | --- |
| `file` | file | Yes |
| `projectId` | string | No for MVP, Yes later |
| `source` | `upload` \| `mask` | No |

Response body:

```json
{
  "asset": {
    "id": "image_123",
    "projectId": "project_123",
    "source": "upload",
    "name": "floorplan.png",
    "mimeType": "image/png",
    "sizeBytes": 102400,
    "width": 1600,
    "height": 1000,
    "url": "/api/assets/images/image_123/file",
    "createdAt": "2026-05-02T12:00:00.000Z"
  }
}
```

Error response:

```json
{
  "error": {
    "code": "IMAGE_ASSET_INVALID",
    "message": "Only PNG, JPG, and WEBP images are supported.",
    "details": {
      "allowedTypes": ["image/png", "image/jpeg", "image/webp"]
    }
  }
}
```

### Upload Model Asset

| Field | Value |
| --- | --- |
| Method | `POST` |
| Path | `/api/assets/models` |
| Requires Login | No for MVP, Yes later |
| MVP Implemented | Planned |

Request body: `multipart/form-data`

| Field | Type | Required |
| --- | --- | --- |
| `file` | file | Yes |
| `projectId` | string | No for MVP, Yes later |

Response body:

```json
{
  "asset": {
    "id": "model_123",
    "projectId": "project_123",
    "name": "concept.glb",
    "format": "glb",
    "mimeType": "model/gltf-binary",
    "sizeBytes": 2048000,
    "isPreviewSupported": true,
    "metadata": {
      "source": "upload"
    },
    "createdAt": "2026-05-02T12:00:00.000Z"
  }
}
```

Error response:

```json
{
  "error": {
    "code": "MODEL_ASSET_INVALID",
    "message": "Only GLB, GLTF, and OBJ model files are supported in MVP.",
    "details": {
      "allowedExtensions": ["glb", "gltf", "obj"]
    }
  }
}
```

## Auth API

| Method | Path | Request Body | Response Body | Error Response | Requires Login | MVP Implemented |
| --- | --- | --- | --- | --- | --- | --- |
| `POST` | `/api/auth/register` | `{ "email": "user@example.com", "password": "secret", "name": "Designer" }` | `{ "user": {}, "workspace": {}, "token": "..." }` | `AUTH_REGISTER_FAILED` | No | No |
| `POST` | `/api/auth/login` | `{ "email": "user@example.com", "password": "secret" }` | `{ "user": {}, "token": "..." }` | `AUTH_INVALID_CREDENTIALS` | No | No |
| `POST` | `/api/auth/logout` | none | `{ "ok": true }` | `AUTH_LOGOUT_FAILED` | Yes | No |
| `GET` | `/api/auth/me` | none | `{ "user": {}, "workspaces": [] }` | `AUTH_REQUIRED` | Yes | No |
| `POST` | `/api/auth/invitations/accept` | `{ "token": "invite_token" }` | `{ "user": {}, "workspace": {} }` | `INVITATION_INVALID` | No | No |

## Project API

| Method | Path | Request Body | Response Body | Error Response | Requires Login | MVP Implemented |
| --- | --- | --- | --- | --- | --- | --- |
| `GET` | `/api/projects` | none | `{ "projects": [] }` | `PROJECT_LIST_FAILED` | No for MVP, Yes later | Planned |
| `POST` | `/api/projects` | `{ "name": "...", "description": "...", "clientName": "..." }` | `{ "project": {} }` | `VALIDATION_ERROR` | No for MVP, Yes later | Planned |
| `GET` | `/api/projects/:id` | none | `{ "project": {} }` | `PROJECT_NOT_FOUND` | No for MVP, Yes later | Planned |
| `PATCH` | `/api/projects/:id` | `{ "name": "...", "description": "...", "status": "review" }` | `{ "project": {} }` | `PROJECT_UPDATE_FAILED` | No for MVP, Yes later | Planned |
| `DELETE` | `/api/projects/:id` | none | `{ "deleted": true, "id": "..." }` | `PROJECT_DELETE_FAILED` | No for MVP, Yes later | Planned |
| `GET` | `/api/projects/:id/generations` | none | `{ "generations": [] }` | `PROJECT_NOT_FOUND` | No for MVP, Yes later | Planned |

## Generation Job API

| Method | Path | Request Body | Response Body | Error Response | Requires Login | MVP Implemented |
| --- | --- | --- | --- | --- | --- | --- |
| `POST` | `/api/generation-jobs` | `{ "projectId": "...", "mode": "floorplan", "prompt": "...", "config": {}, "inputImageAssetIds": [] }` | `{ "job": {} }` | `GENERATION_JOB_INVALID` | No for MVP, Yes later | Planned |
| `GET` | `/api/generation-jobs/:id` | none | `{ "job": {}, "results": [] }` | `GENERATION_JOB_NOT_FOUND` | No for MVP, Yes later | Planned |
| `POST` | `/api/generation-jobs/:id/cancel` | none | `{ "job": {} }` | `GENERATION_JOB_CANCEL_FAILED` | Yes | No |
| `POST` | `/api/generate/floorplan` | `{ "inputImageDataUrl": "...", "materialImageDataUrl": "...", "prompt": "...", "config": {} }` | `{ "id": "...", "provider": "mock", "imageDataUrl": "...", "warnings": [] }` | `{ "error": "..." }` | No | Yes |
| `POST` | `/api/generate/style-render` | `{ "inputImageDataUrl": "...", "prompt": "...", "config": {} }` | `{ "id": "...", "provider": "mock", "imageDataUrl": "...", "warnings": [] }` | `{ "error": "..." }` | No | Yes |
| `POST` | `/api/generate/inpaint` | `{ "inputImageDataUrl": "...", "maskImageDataUrl": "...", "prompt": "...", "config": {} }` | `{ "id": "...", "provider": "mock", "imageDataUrl": "...", "warnings": [] }` | `{ "error": "..." }` | No | Yes |

## Asset API

| Method | Path | Request Body | Response Body | Error Response | Requires Login | MVP Implemented |
| --- | --- | --- | --- | --- | --- | --- |
| `POST` | `/api/assets/images` | `multipart/form-data` with `file`, optional `projectId`, optional `source` | `{ "asset": {} }` | `IMAGE_ASSET_INVALID` | No for MVP, Yes later | Planned |
| `POST` | `/api/assets/models` | `multipart/form-data` with `file`, optional `projectId` | `{ "asset": {} }` | `MODEL_ASSET_INVALID` | No for MVP, Yes later | Planned |
| `GET` | `/api/assets/images/:id/file` | none | image binary | `ASSET_NOT_FOUND` | No for MVP, Yes later | Planned |
| `GET` | `/api/assets/models/:id/file` | none | model binary | `ASSET_NOT_FOUND` | No for MVP, Yes later | Planned |
| `DELETE` | `/api/assets/:id` | none | `{ "deleted": true, "id": "..." }` | `ASSET_DELETE_FAILED` | Yes | No |

## Share API

| Method | Path | Request Body | Response Body | Error Response | Requires Login | MVP Implemented |
| --- | --- | --- | --- | --- | --- | --- |
| `POST` | `/api/share-links` | `{ "projectId": "...", "scope": "project", "resultIds": [], "allowDownload": true, "expiresAt": null }` | `{ "shareLink": { "url": "..." } }` | `SHARE_LINK_CREATE_FAILED` | Yes | No |
| `GET` | `/api/share-links/:id` | none | `{ "shareLink": {} }` | `SHARE_LINK_NOT_FOUND` | Yes | No |
| `PATCH` | `/api/share-links/:id` | `{ "isActive": false, "allowDownload": false }` | `{ "shareLink": {} }` | `SHARE_LINK_UPDATE_FAILED` | Yes | No |
| `GET` | `/api/public/shares/:token` | none | `{ "project": {}, "results": [] }` | `SHARE_LINK_INVALID` | No | No |

## Billing / Credits API

| Method | Path | Request Body | Response Body | Error Response | Requires Login | MVP Implemented |
| --- | --- | --- | --- | --- | --- | --- |
| `GET` | `/api/billing/usage` | none | `{ "usage": [], "summary": {} }` | `BILLING_USAGE_FAILED` | Yes | No |
| `GET` | `/api/billing/credits` | none | `{ "creditBalance": 100, "transactions": [] }` | `CREDITS_LOAD_FAILED` | Yes | No |
| `POST` | `/api/billing/checkout` | `{ "plan": "pro", "creditPackId": "credits_100" }` | `{ "checkoutUrl": "..." }` | `CHECKOUT_CREATE_FAILED` | Yes | No |
| `POST` | `/api/billing/webhooks` | provider payload | `{ "received": true }` | `WEBHOOK_INVALID` | No, signed webhook | No |

## Admin API

| Method | Path | Request Body | Response Body | Error Response | Requires Login | MVP Implemented |
| --- | --- | --- | --- | --- | --- | --- |
| `GET` | `/api/admin/health` | none | `{ "ok": true, "version": "0.1.0", "provider": "mock" }` | `ADMIN_HEALTH_FAILED` | Admin | No |
| `GET` | `/api/admin/audit-logs` | none | `{ "auditLogs": [] }` | `AUDIT_LOG_LIST_FAILED` | Admin | No |
| `GET` | `/api/admin/provider-status` | none | `{ "providers": [] }` | `PROVIDER_STATUS_FAILED` | Admin | No |
| `PATCH` | `/api/admin/workspaces/:id` | `{ "status": "suspended", "plan": "team" }` | `{ "workspace": {} }` | `WORKSPACE_UPDATE_FAILED` | Admin | No |

Current MVP health endpoint:

| Field | Value |
| --- | --- |
| Method | `GET` |
| Path | `/api/health` |
| Request Body | none |
| Response Body | `{ "ok": true, "version": "0.1.0", "provider": "mock" }` |
| Error Response | `{ "error": "..." }` |
| Requires Login | No |
| MVP Implemented | Yes |
