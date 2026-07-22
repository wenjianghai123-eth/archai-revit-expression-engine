import { describe, expect, it } from 'vitest';

import { createTarArchive } from './projectReportArchive';

describe('project report archive', () => {
  it('creates a tar package containing the JSON manifest and image files', async () => {
    const archive = createTarArchive([
      { name: 'project-report.json', data: new TextEncoder().encode('{"schemaVersion":"v1"}') },
      { name: 'images/001-main.png', data: new Uint8Array([1, 2, 3, 4]) },
    ]);
    const bytes = new Uint8Array(await archive.arrayBuffer());
    const text = new TextDecoder().decode(bytes);

    expect(archive.type).toBe('application/x-tar');
    expect(bytes.length % 512).toBe(0);
    expect(text).toContain('project-report.json');
    expect(text).toContain('images/001-main.png');
    expect(text).toContain('schemaVersion');
  });
});
