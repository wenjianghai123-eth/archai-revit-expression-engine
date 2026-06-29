import { describe, expect, it } from 'vitest';
import { formatAdminCreateSuccessMessage, isValidAdminEmail } from './AdminPage';

describe('AdminPage', () => {
  it('formats a clear create-user success message without the password', () => {
    const message = formatAdminCreateSuccessMessage('new-user@example.com', 120);

    expect(message).toContain('new-user@example.com');
    expect(message).toContain('创建成功');
    expect(message).toContain('120 算力点');
    expect(message).toContain('安全渠道');
    expect(message).not.toContain('strong-password-1');
  });

  it('validates admin profile edit email values', () => {
    expect(isValidAdminEmail('edited-user@example.com')).toBe(true);
    expect(isValidAdminEmail(' edited-user@example.com ')).toBe(true);
    expect(isValidAdminEmail('edited-user')).toBe(false);
    expect(isValidAdminEmail('edited-user@example')).toBe(false);
  });
});
