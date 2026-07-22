import type { ReactNode } from 'react';

export function ObjectInsertAdvancedSettings({ children }: { children: ReactNode }) {
  return <div className="space-y-3"><div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-5 text-amber-800">高级设置保留对象保真、遮挡、接触阴影、位置约束和安全调试能力。</div>{children}</div>;
}
