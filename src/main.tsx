import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import './index.css';
import './styles/workspace-theme.css';
import {installImageFallback} from './utils/imageFallback';
import { FullscreenImageViewerProvider } from './components/common/FullscreenImageViewer';

installImageFallback();

const root = document.getElementById('root');

if (!root) {
  renderBootstrapError('页面根节点不存在，请检查 index.html。');
} else {
  createRoot(root).render(
    <StrictMode>
      <ErrorBoundary>
        <FullscreenImageViewerProvider>
          <App />
        </FullscreenImageViewerProvider>
      </ErrorBoundary>
    </StrictMode>,
  );
}

function renderBootstrapError(message: string) {
  document.body.innerHTML = `
    <main style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f1f5f9;color:#0f172a;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;padding:24px;">
      <section style="max-width:560px;width:100%;background:white;border:1px solid #e2e8f0;border-radius:8px;padding:24px;box-shadow:0 12px 30px rgba(15,23,42,.08);">
        <p style="margin:0 0 12px;color:#dc2626;font-size:12px;font-weight:800;">页面初始化失败</p>
        <h1 style="margin:0;font-size:24px;line-height:1.3;">页面暂时无法正常加载</h1>
        <p style="margin:14px 0 0;color:#475569;font-size:14px;line-height:1.7;">${escapeHtml(message)} 请刷新页面，或检查 Netlify 构建配置和部署环境变量。</p>
      </section>
    </main>
  `;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/gu, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character] || character);
}
