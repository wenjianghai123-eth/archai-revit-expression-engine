# 构建优化记录

本文按独立迭代记录代码拆分范围、验证结果和浏览器构建产物变化。每轮只处理一个目标模块，避免把行为变更与结构调整混在同一批修改中。

## 2026-07-17：`server/index.ts` 生成任务路由拆分

### 范围

- 将生成任务 HTTP 生命周期抽到 `server/routes/generationJobs.ts`。
- 独立管理任务创建、幂等命中、项目与资产校验、扣点、入队、查询、补偿退款、取消和结果更新。
- `server/index.ts` 继续负责应用装配，以及现有生成配置归一化和资产规则校验；通过明确的路由依赖接口注入，不反向引用入口文件。
- 未修改前端、GenerationStep、API 路径、请求响应结构或 worker 行为。

### 浏览器 chunk 对比

拆分前后均执行 `npm run build`。本轮只调整 Express 服务端源码，因此所有浏览器 chunk 的文件名、原始体积和 gzip 体积均保持不变。

| Chunk | 拆分前 | 拆分后 | 变化 |
| --- | ---: | ---: | ---: |
| `index-Ck2FezHx.js` | 642.70 kB / gzip 196.42 kB | 642.70 kB / gzip 196.42 kB | 0 |
| `MainWorkspace-Dh8qjsDR.js` | 354.76 kB / gzip 92.19 kB | 354.76 kB / gzip 92.19 kB | 0 |
| `PanoramaQuickRenderPanel-B9D6HV6d.js` | 43.10 kB / gzip 12.63 kB | 43.10 kB / gzip 12.63 kB | 0 |
| `AssetBank-LXywETpm.js` | 50.24 kB / gzip 14.25 kB | 50.24 kB / gzip 14.25 kB | 0 |
| `AdminPage-Gt9Dtg0h.js` | 16.59 kB / gzip 4.80 kB | 16.59 kB / gzip 4.80 kB | 0 |
| `ModelViewer-DLPOJTr_.js` | 139.28 kB / gzip 41.26 kB | 139.28 kB / gzip 41.26 kB | 0 |
| `three.module-Bn3ISXil.js` | 732.48 kB / gzip 189.77 kB | 732.48 kB / gzip 189.77 kB | 0 |

Three.js、全景、模型资产和管理员页面继续保持独立动态 chunk。Vite 仍提示 `index` 与 Three.js chunk 超过 500 kB；它们应在后续对应前端模块的独立拆分迭代中处理。

### 验证

- `npm run typecheck`：通过。
- `npm test`：66 个测试文件、350 个测试通过。
- `npm run build`：通过。
