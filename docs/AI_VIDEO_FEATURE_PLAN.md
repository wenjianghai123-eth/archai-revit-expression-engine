# AI Video Feature Plan

This document proposes the architecture for the ArchAI image-to-video feature. It is a design plan only; this stage does not implement feature code.

## Scope

The first AI video feature is **architectural image-to-video**:

- Users upload an architectural, interior, or landscape render image.
- Users select camera motion and video parameters.
- The backend creates an asynchronous video job.
- The job consumes credits, runs through a video provider, stores the generated MP4/WEBM output, and records project history.
- The frontend polls job status, previews the completed video, supports download, and shows the result in project history.

This stage explicitly does **not** implement Revit integration, BIM parsing, IFC/RVT support, 3D walkthrough generation, browser 3D route planning, or true model-based camera paths. The feature only converts an existing image asset into a short generated video.

## Architecture Fit

The implementation should extend the current generation architecture instead of creating a separate product stack.

Must reuse:

- Existing auth middleware and current-user resolution.
- Project ownership checks through `getProject(projectId, userId)`.
- `ImageAsset` as the required input image.
- Existing credit balance and credit transaction model.
- Existing `fileStorageProvider` approach for local and Supabase-backed storage.
- Existing asynchronous job status style: `queued`, `running`, `succeeded`, `failed`, `cancelled`.
- Existing frontend polling style used by generation jobs.
- Mock provider development fallback behavior.

Recommended new modules:

- `VideoJob`
- `VideoAsset`
- `VideoProvider`
- `server/videoService.ts`
- `server/providers/video/*`
- `src/components/AiVideoWorkspace.tsx`
- `src/api/video.ts` or typed extensions in `src/lib/api.ts`

## 1. Data Model

### VideoAsset

Video outputs should be stored separately from `ImageAsset` because MIME types, file sizes, duration, thumbnails, and playback handling differ from images.

| Field | Type | Notes |
| --- | --- | --- |
| `id` | string | Opaque id, for example `video_...`. |
| `userId` | string | Owner. |
| `url` | string | Local `/uploads/videos/...` or Supabase Storage public URL. |
| `filename` | string | Stored filename/key. |
| `mimeType` | `video/mp4` \| `video/webm` | MVP supported video formats. |
| `size` | number | Stored byte size. |
| `durationSeconds` | number \| null | Optional provider-reported duration. |
| `thumbnailImageAssetId` | string \| null | Optional generated thumbnail saved as `ImageAsset`. |
| `createdAt` | ISO string | Creation time. |

### VideoJob

`VideoJob` mirrors the existing `GenerationJob` lifecycle but uses a video-specific provider contract and output asset.

| Field | Type | Notes |
| --- | --- | --- |
| `id` | string | Opaque id, for example `video_job_...`. |
| `userId` | string | Owner. |
| `projectId` | string | Owned project id. |
| `mode` | `image-to-video` | MVP supports only this mode. |
| `prompt` | string | Camera and scene motion prompt. |
| `config` | object | Video parameters and provider options. |
| `inputImageAssetId` | string | Required owned `ImageAsset`. |
| `status` | `queued` \| `running` \| `succeeded` \| `failed` \| `cancelled` | Same style as image jobs. |
| `progress` | number | 0-100. |
| `provider` | string | `mock` or a real video provider name. |
| `outputVideoAssetId` | string \| null | Stored generated video. |
| `thumbnailImageAssetId` | string \| null | Optional thumbnail. |
| `errorMessage` | string \| null | Failure reason. |
| `createdAt` | ISO string | Creation time. |
| `updatedAt` | ISO string | Last update time. |
| `startedAt` | ISO string \| null | Worker start time. |
| `finishedAt` | ISO string \| null | Terminal time. |

Recommended `config` fields:

| Field | Type | Notes |
| --- | --- | --- |
| `cameraMotion` | string | Preset such as `slow-push-in`, `pan-left`, `orbit-soft`, `tilt-up`, `dolly-forward`. |
| `durationSeconds` | `4` \| `6` \| `8` | Keep short for MVP cost and latency control. |
| `aspectRatio` | `16:9` \| `9:16` \| `1:1` | Provider permitting. |
| `resolution` | `720p` \| `1080p` | Start with `720p` default. |
| `fps` | `24` \| `30` | Start with `24` default. |
| `seed` | number \| null | Optional reproducibility. |
| `negativePrompt` | string \| null | Optional artifact avoidance. |
| `preserveArchitecture` | boolean | Bias provider prompt toward structural consistency. |

### VideoGenerationRecord

For project history, either add a dedicated video record or extend existing `generation_records` to support media type. To minimize risk to current image history, the recommended MVP approach is a dedicated table.

| Field | Type | Notes |
| --- | --- | --- |
| `id` | string | Opaque id, for example `video_generation_...`. |
| `userId` | string | Owner. |
| `projectId` | string | Parent project. |
| `jobId` | string \| null | Linked `VideoJob`. |
| `mode` | `image-to-video` | MVP only. |
| `prompt` | string | User prompt. |
| `inputImageUrl` | string \| null | Input `ImageAsset.url`. |
| `outputVideoUrl` | string \| null | Stored video URL. |
| `thumbnailImageUrl` | string \| null | Optional thumbnail URL. |
| `provider` | string | Provider used. |
| `status` | `succeeded` \| `failed` | Record status. |
| `createdAt` | ISO string | Creation time. |
| `updatedAt` | ISO string | Last update time. |

## 2. API Contract

All APIs live under `/api`, require auth unless explicitly noted, and use the existing `{ ok, data }` / `{ ok, error }` envelope.

### `POST /api/video-jobs`

Creates an async image-to-video job. The backend must validate project ownership and input image ownership before creating the job.

Request:

```json
{
  "projectId": "project_123",
  "mode": "image-to-video",
  "prompt": "A slow cinematic push-in through the modern lobby, preserving geometry.",
  "config": {
    "cameraMotion": "slow-push-in",
    "durationSeconds": 6,
    "aspectRatio": "16:9",
    "resolution": "720p",
    "fps": 24,
    "preserveArchitecture": true
  },
  "inputImageAssetId": "image_123"
}
```

Response:

```json
{
  "ok": true,
  "data": {
    "job": {
      "id": "video_job_123",
      "userId": "user_123",
      "projectId": "project_123",
      "mode": "image-to-video",
      "prompt": "A slow cinematic push-in through the modern lobby, preserving geometry.",
      "config": {
        "cameraMotion": "slow-push-in",
        "durationSeconds": 6,
        "aspectRatio": "16:9",
        "resolution": "720p",
        "fps": 24,
        "preserveArchitecture": true
      },
      "inputImageAssetId": "image_123",
      "status": "queued",
      "progress": 0,
      "provider": "mock",
      "outputVideoAssetId": null,
      "thumbnailImageAssetId": null,
      "errorMessage": null,
      "createdAt": "2026-05-11T00:00:00.000Z",
      "updatedAt": "2026-05-11T00:00:00.000Z",
      "startedAt": null,
      "finishedAt": null
    }
  }
}
```

Validation rules:

- `projectId` must belong to the current user.
- `mode` must be `image-to-video`.
- `inputImageAssetId` must be an existing owned `ImageAsset`.
- `prompt` must be a string; it may be empty only if `cameraMotion` is present.
- `durationSeconds` must be one of the supported values.
- `resolution`, `aspectRatio`, and `fps` must be restricted to supported values.
- Insufficient credits returns `402` with `CREDITS_INSUFFICIENT`.

### `GET /api/video-jobs/:id`

Returns one owned video job and its output asset metadata when available.

```json
{
  "ok": true,
  "data": {
    "job": {
      "id": "video_job_123",
      "status": "succeeded",
      "progress": 100,
      "outputVideoAssetId": "video_123",
      "thumbnailImageAssetId": "image_thumb_123"
    },
    "videoAsset": {
      "id": "video_123",
      "url": "/uploads/videos/result.mp4",
      "mimeType": "video/mp4",
      "durationSeconds": 6
    }
  }
}
```

### `POST /api/video-jobs/:id/cancel`

Cancels a queued/running owned video job and refunds its debit once, following the existing image generation cancellation pattern.

### `GET /api/projects/:id/video-generations`

Lists video generation records for project history. The endpoint should mirror `GET /api/projects/:id/generations` but return video-specific fields.

### Optional Asset Read

`GET /api/assets/videos/:id` may return owned video asset metadata. The actual video file is served from the storage URL, the same way image asset URLs are used today.

## 3. Provider Contract

Create a video-specific provider interface rather than overloading `ImageGenerationProvider`.

```ts
export type VideoMode = 'image-to-video';
export type VideoProviderName = 'mock' | 'grsai-video' | 'replicate-video' | 'runway' | 'kling';

export interface GenerateVideoInput {
  mode: VideoMode;
  inputImageDataUrl: string;
  prompt: string;
  config: Record<string, unknown>;
}

export interface GenerateVideoOutput {
  id: string;
  provider: VideoProviderName;
  createdAt: string;
  warnings: string[];
  videoDataUrl?: string;
  remoteVideoUrl?: string;
  mimeType: 'video/mp4' | 'video/webm';
  durationSeconds?: number;
  thumbnailDataUrl?: string;
  metadata?: Record<string, unknown>;
}

export interface VideoGenerationProvider {
  name: VideoProviderName;
  generateVideo(input: GenerateVideoInput): Promise<GenerateVideoOutput>;
}
```

Normalization rules:

- Provider output must include either `videoDataUrl` or `remoteVideoUrl`.
- If a real provider returns a temporary `remoteVideoUrl`, the backend downloads it and stores it through `fileStorageProvider`.
- The backend must never persist temporary remote provider URLs as the final video asset.
- `mimeType` must be `video/mp4` or `video/webm`.
- If `thumbnailDataUrl` is provided, save it as an `ImageAsset`.
- Warnings must be normalized to `string[]`.

## 4. Mock Provider Behavior

The mock provider is required for local development and CI-friendly testing.

Recommended behavior:

- Accept any valid owned input image.
- Return a tiny deterministic `video/webm` or `video/mp4` fixture from `server/providers/video/mockProvider`.
- Include a clear warning such as `Mock video provider output; not a real AI generation.`
- Reflect key config fields in metadata: `cameraMotion`, `durationSeconds`, `aspectRatio`, `resolution`.
- Keep output file small enough for tests and local storage.

Fallback behavior:

- In local development, when fallback is enabled and the real provider fails for non-secret/non-auth reasons, return mock output with warnings.
- In production, default to no mock fallback unless explicitly enabled.
- If a real provider key is missing, fail clearly instead of silently generating mock output for production-like providers.

## 5. Real Provider Integration Points

Provider selection should follow the current image provider style:

- Read `VIDEO_GENERATION_PROVIDER` first.
- Fall back to `mock` when unset.
- Read provider secrets only from backend environment variables.
- Never expose provider keys in frontend code or Vite variables.

Suggested environment variables:

```bash
VIDEO_GENERATION_PROVIDER=mock
VIDEO_PROVIDER_API_KEY=backend_only_key
VIDEO_PROVIDER_BASE_URL=https://provider.example.com
VIDEO_PROVIDER_MODEL=image-to-video-model
VIDEO_DEFAULT_DURATION_SECONDS=6
VIDEO_DEFAULT_RESOLUTION=720p
ENABLE_VIDEO_PROVIDER_FALLBACK=false
```

Suggested files:

```text
server/providers/video/types.ts
server/providers/video/mockProvider.ts
server/providers/video/providerConfig.ts
server/providers/video/grsaiVideoProvider.ts
```

`server/videoService.ts` should own:

- Provider selection.
- Queue restore for pending video jobs.
- Credit calculation.
- Job processing.
- Input `ImageAsset` loading as data URL.
- Provider output normalization.
- Video download for remote provider URLs.
- Saving `VideoAsset` and optional thumbnail `ImageAsset`.
- Writing video generation history.
- Failure handling and credit refund.

## 6. Frontend Page Structure

Add `src/components/AiVideoWorkspace.tsx` as a focused workspace rather than mixing video controls into `MainWorkspace.tsx`.

Recommended layout:

- Left panel: input image upload/select, camera motion presets, prompt, duration, aspect ratio, resolution, fps.
- Center preview: input image before generation; video player after success.
- Right panel: status, credits, progress, provider, warnings, download, export metadata.

Required behavior:

- Use existing image upload flow so the input becomes an `ImageAsset`.
- Require an active project before creating a video job.
- Call `createVideoJob`, then poll `getVideoJob` every 2 seconds.
- Use the same Chinese UI tone as current generation workspace.
- Show `queued/running/succeeded/failed/cancelled` status in the same style as image generation.
- After success, render a native `<video controls>` preview for MP4/WEBM.
- Provide download from stored `VideoAsset.url`.
- Save/show video history at project level.

Camera motion presets for MVP:

- `slow-push-in`: 缓慢推进
- `pan-left`: 横向左移
- `pan-right`: 横向右移
- `tilt-up`: 仰拍上移
- `orbit-soft`: 轻微环绕
- `dolly-forward`: 镜头前移

Frontend API placement:

- Either add `src/api/video.ts` for feature-specific helpers, or extend `src/lib/api.ts` with typed functions:
  - `createVideoJob`
  - `getVideoJob`
  - `cancelVideoJob`
  - `getVideoAsset`
  - `listProjectVideoGenerations`

## 7. Credit Rules

Use existing credit balance and credit transaction tables. Do not add billing or payment.

Recommended MVP formula:

```text
base cost = 20 credits
duration multiplier:
  4 seconds = 1.0
  6 seconds = 1.5
  8 seconds = 2.0
resolution multiplier:
  720p = 1.0
  1080p = 1.5
final cost = ceil(base * duration multiplier * resolution multiplier)
```

Examples:

- 4s 720p: 20 credits.
- 6s 720p: 30 credits.
- 8s 1080p: 60 credits.

Rules:

- Debit credits when the job is created.
- Use `referenceType: 'video_job'` if extending the transaction enum, or reuse `generation_job` only if the codebase intentionally keeps one generic reference type.
- Refund once when a queued/running job is cancelled.
- Refund once when processing fails.
- Do not refund succeeded jobs.
- Insufficient balance returns `402 CREDITS_INSUFFICIENT`.

## 8. Supabase SQL Changes

Add tables without changing existing image generation tables.

```sql
create table if not exists public.video_assets (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  url text not null,
  filename text not null,
  mime_type text not null check (mime_type in ('video/mp4', 'video/webm')),
  size integer not null,
  duration_seconds numeric,
  thumbnail_image_asset_id text references public.image_assets(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.video_jobs (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id text not null references public.projects(id) on delete cascade,
  mode text not null check (mode in ('image-to-video')),
  prompt text not null,
  config jsonb not null default '{}'::jsonb,
  input_image_asset_id text not null references public.image_assets(id) on delete restrict,
  status text not null default 'queued' check (status in ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
  progress integer not null default 0,
  provider text not null,
  output_video_asset_id text references public.video_assets(id) on delete set null,
  thumbnail_image_asset_id text references public.image_assets(id) on delete set null,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);

create table if not exists public.video_generation_records (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id text not null references public.projects(id) on delete cascade,
  job_id text references public.video_jobs(id) on delete set null,
  mode text not null check (mode in ('image-to-video')),
  prompt text not null,
  input_image_url text,
  output_video_url text,
  thumbnail_image_url text,
  provider text not null,
  status text not null default 'succeeded' check (status in ('succeeded', 'failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

Indexes:

```sql
create index if not exists video_assets_user_id_created_at_idx
  on public.video_assets (user_id, created_at desc);

create index if not exists video_jobs_status_created_at_idx
  on public.video_jobs (status, created_at asc);

create index if not exists video_jobs_user_id_created_at_idx
  on public.video_jobs (user_id, created_at desc);

create index if not exists video_jobs_project_user_created_at_idx
  on public.video_jobs (project_id, user_id, created_at desc);

create index if not exists video_generation_records_project_user_created_at_idx
  on public.video_generation_records (project_id, user_id, created_at desc);

create index if not exists video_generation_records_job_id_idx
  on public.video_generation_records (job_id);
```

RLS baseline:

```sql
alter table public.video_assets enable row level security;
alter table public.video_jobs enable row level security;
alter table public.video_generation_records enable row level security;

create policy "Users can read own video assets"
  on public.video_assets for select
  using (auth.uid() = user_id);

create policy "Users can insert own video assets"
  on public.video_assets for insert
  with check (auth.uid() = user_id);

create policy "Users can read own video jobs"
  on public.video_jobs for select
  using (auth.uid() = user_id);

create policy "Users can insert own video jobs"
  on public.video_jobs for insert
  with check (auth.uid() = user_id);

create policy "Users can update own video jobs"
  on public.video_jobs for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can read own video generation records"
  on public.video_generation_records for select
  using (auth.uid() = user_id);

create policy "Users can insert own video generation records"
  on public.video_generation_records for insert
  with check (auth.uid() = user_id);
```

Credit SQL note:

- If `credit_transactions.reference_type` remains constrained to `generation_job` and `system`, either add `video_job` to the check constraint or deliberately reuse `generation_job` for all AI media jobs.
- The cleaner long-term model is to allow `video_job`.

Storage note:

- Extend Supabase Storage usage to store videos under `users/{userId}/videos/...`.
- Local storage should store videos under `/uploads/videos/...`.
- Keep bucket visibility consistent with current MVP preview needs, or add signed URL support before private video storage.

## 9. Test Plan

### Unit Tests

- Validate video job request body: mode, projectId, inputImageAssetId, duration, resolution, aspectRatio, fps.
- Validate credit cost calculation.
- Validate provider output normalization for `videoDataUrl`, `remoteVideoUrl`, invalid MIME types, missing output, and warnings.
- Validate local path safety for `/uploads/videos/...`.
- Validate mock provider returns deterministic, small output.

### Storage Tests

- JSON storage: create/read/update/cancel `VideoJob`.
- JSON storage: create/read `VideoAsset`.
- Supabase mapper tests for snake_case/camelCase conversion.
- Project ownership filtering for video jobs and video assets.

### API Tests

- `POST /api/video-jobs` requires auth.
- Reject unknown project.
- Reject input image not owned by current user.
- Debit credits on job create.
- Return `402 CREDITS_INSUFFICIENT` when balance is too low.
- `GET /api/video-jobs/:id` only returns owned jobs.
- Cancel refunds once.
- Failed job refunds once.

### Service Tests

- Worker changes status from `queued` to `running` to `succeeded`.
- Worker stores output video through file storage.
- Worker writes video history record.
- Worker stores optional thumbnail as `ImageAsset`.
- Real provider failure uses mock fallback only when enabled.
- Missing provider secret fails clearly.

### Frontend Tests

- Upload image and create video job from active project.
- Poll until success and render video preview.
- Show progress and status messages.
- Disable create button when credits are insufficient.
- Download link uses stored `VideoAsset.url`.
- Project history includes completed video record.

### E2E Smoke

- Create/open project.
- Upload sample architectural image.
- Generate mock image-to-video.
- Confirm video preview appears.
- Confirm project history persists after reload.

## 10. Non-Goals For This Stage

This feature plan intentionally excludes:

- Revit plugin features.
- BIM, IFC, RVT, or model parsing.
- True 3D walkthrough generation.
- Camera path editing in 3D space.
- Multi-scene video editing.
- Audio, subtitles, voiceover, or timeline editing.
- Authentication, payment, billing checkout, or subscription changes.
- Public video review portals beyond existing share-link patterns.

The MVP should stay small: one image in, one short architectural video out, saved safely through the existing backend-owned project workflow.
