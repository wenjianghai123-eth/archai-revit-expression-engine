# AI Providers

## API易 Nano Banana 2 图片编辑

API易作为可选图片编辑 provider 接入现有 generation job、算力扣费与退款、结果资产保存和历史记录流程，不替换默认的 Grsai Banana2。

后端 `.env` 配置：

```env
APIYI_API_KEY=sk-xxx
APIYI_API_BASE_URL=https://api.apiyi.com
APIYI_IMAGE_MODEL=gemini-3.1-flash-image-preview
APIYI_IMAGE_TIMEOUT_MS=300000
APIYI_IMAGE_PROVIDER_ENABLED=true
```

`APIYI_API_KEY` 只能配置在服务端环境变量中，不要添加 `VITE_` 前缀。

前端使用方式：

```text
AI 接口 → API易 Nano Banana 2 图片编辑
```

请求发送到：

```text
POST {APIYI_API_BASE_URL}/v1beta/models/{APIYI_IMAGE_MODEL}:generateContent
```

请求使用 JSON。`contents[0].parts[0]` 是文本提示词，后续每个 part 只包含一张图片的 `inlineData`。图片数据是无 data URL 前缀的纯 base64。WebP 等格式会在服务端转换为 PNG。

API易响应中的 `candidates[].content.parts[].inlineData.data` 会解码为原始图片 Buffer，并沿用项目现有 generated image asset 存储流程保存，不进行额外缩放或压缩。

元素植入的 `object_insert_preview_fusion` 模式只发送两张图片：

1. 原始场景图
2. placement preview

自由参考生图发送原图和零到多张参考图。
