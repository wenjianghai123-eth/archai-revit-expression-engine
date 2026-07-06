import React from 'react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = {
    error: null,
  };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    if (import.meta.env.DEV) {
      console.error('[ErrorBoundary] React render failed', error, errorInfo);
    }
  }

  render() {
    if (!this.state.error) {
      return this.props.children;
    }

    const summary = sanitizeErrorSummary(this.state.error);

    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100 px-6 py-10 text-slate-900">
        <section className="w-full max-w-xl rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wide text-red-500">页面初始化失败</p>
          <h1 className="mt-3 text-2xl font-black text-slate-950">页面暂时无法正常加载</h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            请刷新页面重试；如果问题持续存在，请检查 Netlify 构建配置、前端环境变量和后端服务地址。
          </p>
          <div className="mt-5 rounded-lg border border-red-100 bg-red-50 p-4">
            <p className="text-xs font-bold text-red-700">错误摘要</p>
            <p className="mt-2 break-words text-sm font-semibold text-red-900">{summary}</p>
          </div>
          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-bold text-white"
            >
              刷新页面
            </button>
            <button
              type="button"
              onClick={() => {
                try {
                  window.localStorage.clear();
                } catch {
                  // Continue with refresh even if storage is blocked.
                }
                window.location.reload();
              }}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700"
            >
              清理本地缓存并刷新
            </button>
          </div>
        </section>
      </main>
    );
  }
}

function sanitizeErrorSummary(error: Error): string {
  const message = error.message || error.name || '未知错误';
  if (import.meta.env.DEV) {
    return message;
  }

  return message
    .replace(/(api[_-]?key|token|secret|password|authorization)=?[^&\s]*/giu, '$1=***')
    .replace(/[A-Za-z0-9_-]{32,}/gu, '***')
    .slice(0, 240);
}
