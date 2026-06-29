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

  it.each([
    ['UPPER.JPG', ''],
    ['photo.jpeg', 'image/pjpeg'],
    ['legacy.jfif', ''],
    ['plan.PNG', 'image/x-png'],
    ['material.WEBP', 'application/octet-stream'],
  ])('accepts supported aliases and extension fallback for %s', (name, type) => {
    const file = new File(['image-bytes'], name, { type });
    expect(validateImageFile(file)).toBeNull();
  });

  it('returns a Chinese message for unsupported HEIC files', () => {
    const file = new File(['image-bytes'], 'photo.heic', { type: '' });
    expect(validateImageFile(file)).toContain('仅支持 PNG、JPG、JPEG、WEBP');
  });
});

