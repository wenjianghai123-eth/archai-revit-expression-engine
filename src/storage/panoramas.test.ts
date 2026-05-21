import { beforeEach, describe, expect, it } from 'vitest';
import { listPanoramaRecords, savePanoramaRecord } from './panoramas';

describe('panorama record storage', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('saves panorama records with camera state and share id', () => {
    savePanoramaRecord({
      id: 'panorama-1',
      projectId: 'project-1',
      modelUrl: '/uploads/model.glb',
      cameraState: { position: [1, 2, 3], rotation: [0, 0, 0], fov: 75 },
      panoramaUrl: '/uploads/panorama.png',
      thumbnailUrl: '/uploads/panorama.png',
      shareId: 'share-1',
      createdAt: '2026-05-20T00:00:00.000Z',
    });

    expect(listPanoramaRecords('project-1')[0]).toMatchObject({
      id: 'panorama-1',
      projectId: 'project-1',
      modelUrl: '/uploads/model.glb',
      panoramaUrl: '/uploads/panorama.png',
      shareId: 'share-1',
    });
  });
});
