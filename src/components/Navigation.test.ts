import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Sidebar } from './Navigation';

const currentUser = {
  id: 'user_1',
  email: 'member@example.com',
  name: 'Member User',
  role: 'member' as const,
  status: 'active' as const,
  createdAt: '2026-01-01T00:00:00.000Z',
};

describe('Sidebar account panel', () => {
  it('shows current user identity, credits, and sign out action', () => {
    const html = renderToStaticMarkup(React.createElement(Sidebar, {
      activeTab: 'home',
      onTabChange: () => undefined,
      onSettingsOpen: () => undefined,
      currentUser,
      creditBalance: { userId: currentUser.id, balance: 88, updatedAt: '2026-01-01T00:00:00.000Z' },
      onSignOut: () => undefined,
    }));

    expect(html).toContain('member@example.com');
    expect(html).toContain('role: member');
    expect(html).toContain('status: active');
    expect(html).toContain('剩余算力点：88');
    expect(html).toContain('退出登录');
  });

  it('shows a friendly credit error without hiding sign out', () => {
    const html = renderToStaticMarkup(React.createElement(Sidebar, {
      activeTab: 'home',
      onTabChange: () => undefined,
      onSettingsOpen: () => undefined,
      currentUser,
      creditError: 'HTTP 500',
      onSignOut: () => undefined,
    }));

    expect(html).toContain('额度读取失败，可继续退出登录');
    expect(html).toContain('退出登录');
    expect(html).not.toContain('HTTP 500');
  });
});
