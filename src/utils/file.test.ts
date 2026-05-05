import { describe, expect, it } from 'vitest';

import { validateImageFile } from './file';

describe('validateImageFile', () => {
  it('accepts supported image files within the size limit', () => {
    const file = new File(['image-bytes'], 'floorplan.png', { type: 'image/png' });

    expect(validateImageFile(file)).toBeNull();
  });

  it('rejects unsupported image types', () => {
    const file = new File(['text'], 'notes.txt', { type: 'text/plain' });

    expect(validateImageFile(file)).toEqual(expect.any(String));
  });
});

