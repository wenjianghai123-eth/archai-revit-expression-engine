# 首页案例资源

首页、登录后的工作台、演示项目、最近生成与资源缩略图统一按以下顺序加载图片：

1. 本目录中的真实、已授权案例图片；
2. ArchAI 改版前 UI 已经使用的演示图片；
3. 项目既有配置中语义匹配的建筑、室内或图纸演示图片；
4. 本目录内随项目部署的 `fallback-*.jpg` 最终兜底图。

组件内部还保留一个不会发起网络请求的建筑线稿图形作为极端故障保护，因此图片区域不会显示浏览器破图、纯色空框或大面积“案例素材待补充”。第 2–4 级会显示低干扰的“功能示例”或“演示素材”标签，不会被描述为真实客户项目或当前系统实时生成结果。

后续只需将真实案例放入本目录，并更新 `src/constants/demoImageFallbacks.ts` 对应项的 `localSrc`，页面便会自动优先展示真实素材；组件无需再次修改。

## 应补充的首页真实案例

建议使用 JPG、PNG 或 WebP。功能卡推荐 16:9、长边 1200–1600 px；Hero 与对比图推荐长边 1600–2400 px。

- `home-hero.jpg`：有视觉冲击力的现代建筑或商业室内主视觉
- `free-reference-image-result.jpg`：原空间结合参考图形成的高品质结果
- `material-replace-result.jpg`：墙面、地面、家具或材质变化清晰的结果
- `object-insert-result.jpg`：包含家具、绿植、人物或装饰元素的空间结果
- `scheme-variant-result.jpg`：同一空间的明确设计方案之一
- `image-polish-result.jpg`：完成写实和清晰度提升的效果图
- `panorama-render-result.jpg`：室内大堂或商业空间全景，推荐 2:1
- `project-cover.jpg`：可选的首页项目封面
- `template-library.jpg`：可选的模板库通用封面

以下功能继续复用成对案例中的结果图：

- `floor-plan-report-result.jpg`：彩色平面图或轴测平面图
- `white-model-render-result.jpg`：白模材质化后的建筑或室内效果图

## 必须成对提供的前后案例

下列文件只有在属于同一项目、视角和画幅一致时才应成对补充：

- `client-iteration-source.jpg`
- `client-iteration-result.jpg`
- `floor-plan-report-source.jpg`
- `floor-plan-report-result.jpg`
- `white-model-render-source.jpg`
- `white-model-render-result.jpg`

建议同组使用 4:3 或 16:9 且尺寸一致。平面图可使用 PNG 保持线条清晰。缺少成对素材时，页面会使用旧版中已经成对的演示图，或退化为单图功能展示，不会用无关图片拼成“生成前 / 生成后”。

## 随项目部署的最终兜底

以下文件是旧版 UI 素材的本地缓存，仅用于远程图片真实加载失败后的最后视觉保障，不应替代未来的真实案例：

- `fallback-comparison-source.jpg` / `fallback-comparison-result.jpg`
- `fallback-floor-plan.jpg`
- `fallback-free-reference.jpg`
- `fallback-interior.jpg`
- `fallback-object-insert.jpg`
- `fallback-scheme-variant.jpg`
- `fallback-image-polish.jpg`
- `fallback-model-render.jpg`
- `fallback-panorama.jpg`

统一配置位于 `src/constants/demoImageFallbacks.ts`，统一加载组件位于 `src/components/common/CaseImage.tsx`。不要在页面组件中重复硬编码远程图片地址。
