# ArchAI Expression Engine MVP QA Checklist

Use this checklist before handing off an MVP build.

## Install

- [ ] Run `npm install`.
- [ ] Confirm `node_modules/` is present locally and ignored by git.
- [ ] Confirm `dist/` is ignored by git after builds.

## Env Setup

- [ ] Copy `.env.example` to `.env` for local backend runs.
- [ ] Keep `AI_PROVIDER=mock` for default MVP verification.
- [ ] For real provider testing only, set `AI_PROVIDER=gemini` and `GEMINI_API_KEY` in backend `.env`.
- [ ] Confirm no model API key is referenced from `src/` frontend code.

## Run Client And Server

- [ ] Start backend: `npm run dev:server`.
- [ ] Start frontend: `npm run dev:client`.
- [ ] Open the Vite URL, normally `http://localhost:3000`.
- [ ] Open Settings and confirm backend health reports online when server is running.
- [ ] Stop backend and confirm generation shows a readable connection error.

## Floorplan Upload

- [ ] Upload PNG floorplan and confirm preview appears.
- [ ] Upload JPG floorplan and confirm preview appears.
- [ ] Upload WEBP floorplan and confirm preview appears.
- [ ] Upload unsupported file and confirm it is rejected with readable error copy.
- [ ] Upload image larger than 10MB and confirm it is rejected.
- [ ] Remove uploaded floorplan and confirm preview clears.
- [ ] Re-upload the same file after removal and confirm it triggers preview again.

## Generation

- [ ] Confirm Generate is disabled or explains missing input when no image is present.
- [ ] Upload a floorplan and click Generate.
- [ ] Confirm system log moves through ready, uploading, generating, success.
- [ ] Confirm generated result appears without clearing previous result on later errors.
- [ ] Confirm Share shows `MVP 暂未支持分享`.
- [ ] Confirm Compare mode is not exposed as a non-working control.

## Inpainting Mask

- [ ] Move to Local Inpainting.
- [ ] Upload a base image.
- [ ] Draw a rectangular mask and confirm overlay appears.
- [ ] Clear selection and confirm mask is removed.
- [ ] Use full image and confirm generation is enabled.
- [ ] Generate and confirm the backend receives mask data or full-image selection.

## Download

- [ ] Generate a result.
- [ ] Click image download and confirm an image file is downloaded.
- [ ] Click project export and confirm JSON includes prompt, config, provider, timestamps, input names, and result metadata.

## History

- [ ] Generate a result and confirm it appears in History.
- [ ] Refresh the page and confirm recent history still appears.
- [ ] Open a history item and confirm result/config is restored.
- [ ] Delete one record and confirm it is removed.
- [ ] Clear history and confirm empty state appears.
- [ ] Confirm very large results store metadata only with a warning.

## Asset Upload

- [ ] Upload a `.glb` file and confirm it appears in AssetBank.
- [ ] Select the uploaded GLB and confirm real 3D preview renders.
- [ ] Upload `.gltf` and confirm preview renders when resources are embedded or reachable.
- [ ] Upload `.obj` and confirm it is stored as metadata-only with unsupported preview copy.
- [ ] Upload unsupported asset type and confirm readable validation error.
- [ ] Upload asset larger than the MVP limit and confirm it is rejected.
- [ ] Delete uploaded asset and confirm it disappears from the list.
- [ ] Refresh and confirm uploaded model files are not persisted to localStorage.

## Build

- [ ] Run `npm run lint`.
- [ ] Run `npm run build`.
- [ ] Review build output for errors.
- [ ] Large chunk warnings from Three.js/drei are acceptable for MVP if build succeeds.
