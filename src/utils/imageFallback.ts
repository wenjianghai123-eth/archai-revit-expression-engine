const FALLBACK_IMAGE =
  'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22800%22 height=%22600%22 viewBox=%220 0 800 600%22%3E%3Crect width=%22800%22 height=%22600%22 fill=%22%23f1f5f9%22/%3E%3Cpath d=%22M321 256h158a32 32 0 0 1 32 32v91a32 32 0 0 1-32 32H321a32 32 0 0 1-32-32v-91a32 32 0 0 1 32-32Zm0 24a8 8 0 0 0-8 8v91a8 8 0 0 0 8 8h158a8 8 0 0 0 8-8v-91a8 8 0 0 0-8-8H321Zm47 37a24 24 0 1 1-48 0 24 24 0 0 1 48 0Zm95 54H337l41-47 27 30 20-22 38 39Z%22 fill=%22%2394a3b8%22/%3E%3Ctext x=%22400%22 y=%22455%22 text-anchor=%22middle%22 font-family=%22Microsoft YaHei, Arial, sans-serif%22 font-size=%2224%22 font-weight=%22700%22 fill=%22%2364758b%22%3E%E5%9B%BE%E7%89%87%E6%97%A0%E6%B3%95%E6%98%BE%E7%A4%BA%3C/text%3E%3C/svg%3E';

export function installImageFallback() {
  window.addEventListener(
    'error',
    (event) => {
      const target = event.target;

      if (!(target instanceof HTMLImageElement)) {
        return;
      }

      if (target.dataset.fallbackApplied === 'true') {
        return;
      }

      target.dataset.fallbackApplied = 'true';
      target.src = FALLBACK_IMAGE;
    },
    true,
  );
}
