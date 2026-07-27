# AI Providers

图片生成任务固定由后端调用 API易 / `nano-banana2`。前端不提供 provider、模型、接口地址或 Key 选择，也不得在创建任务请求中传递这些字段。

后端 `.env` 只需要配置：

```env
APIYI_API_KEY=sk-xxx
APIYI_API_BASE_URL=https://api.apiyi.com
APIYI_IMAGE_TIMEOUT_MS=300000
APIYI_IMAGE_PROVIDER_ENABLED=true
```

`APIYI_API_KEY` 只能存在于后端环境变量中，不要添加 `VITE_` 前缀，不要写入前端代码、浏览器请求或 localStorage。

模型固定为：

```text
nano-banana2
```

请求发送到：

```text
POST {APIYI_API_BASE_URL}/v1beta/models/nano-banana2:generateContent
```

请求使用 JSON。`contents[0].parts[0]` 是文本提示词，后续每个 part 只包含一张图片的 `inlineData`。图片数据是无 data URL 前缀的纯 base64；WebP 等格式会在服务端转换为 PNG。

API易响应中的 `candidates[].content.parts[].inlineData.data` 会解码为原始图片 Buffer，并沿用项目现有 generated image asset 存储流程保存。
