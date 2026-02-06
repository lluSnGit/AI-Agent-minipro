# Dify 智能客服后端接口部署说明

## 一、安装依赖

```bash
pip install -r requirements.txt
```

## 二、配置环境变量

创建 `.env` 文件（在 Django 项目根目录）：

```env
DIFY_API_KEY=app-your-api-key
DIFY_BASE_URL=https://api.dify.ai/v1
DIFY_APP_ID=your-app-id
```

### 获取 Dify API Key

1. 登录 Dify 工作台（https://cloud.dify.ai 或您的自部署地址）
2. 进入「设置」->「API 密钥」
3. 创建新的 API 密钥，格式为 `app-xxxxx`
4. 将 API 密钥配置到环境变量 `DIFY_API_KEY`

### 获取 Dify 应用 ID（可选）

1. 在 Dify 工作台创建或选择一个智能客服应用
2. 在应用设置中查看应用 ID
3. 如果使用固定应用，可以配置 `DIFY_APP_ID`

### Dify API 地址

- 云端版本：`https://api.dify.ai/v1`
- 自部署版本：`http://your-dify-host/v1`（根据您的部署情况修改）

## 三、集成到 Django 项目

### 方法1：直接复制代码

1. 将 `dify_views.py` 中的代码复制到您项目的 `views.py` 文件中
2. 在 `urls.py` 中添加路由：

```python
from django.urls import path
from . import views

urlpatterns = [
    # ... 您现有的路由 ...
    
    # Dify 智能客服接口
    path('api/dify/chat', views.dify_chat, name='dify-chat'),
]
```

### 方法2：作为独立应用

1. 将 `dify_views.py` 放到您的 Django 应用中
2. 在应用的路由文件中添加路由
3. 在主 `urls.py` 中包含应用路由

## 四、测试接口

### 使用 curl 测试：

```bash
curl -X POST http://localhost:8000/api/dify/chat \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-access-token" \
  -d '{
    "query": "你好，我想了解一下产品信息",
    "response_mode": "blocking",
    "user": "wechat-miniapp-user"
  }'
```

### 使用 Python requests 测试：

```python
import requests

url = "http://localhost:8000/api/dify/chat"
headers = {
    "Content-Type": "application/json",
    "Authorization": "Bearer your-access-token"
}
data = {
    "query": "你好，我想了解一下产品信息",
    "response_mode": "blocking",
    "user": "wechat-miniapp-user"
}

response = requests.post(url, json=data, headers=headers)
print(response.json())
```

## 五、请求格式说明

### 请求参数

- `query`（必填）：用户问题
- `response_mode`（可选）：响应模式，`blocking`（阻塞）或 `streaming`（流式），默认 `blocking`
- `conversation_id`（可选）：对话 ID，用于继续已有对话
- `inputs`（可选）：工作流输入变量，JSON 对象格式
- `user`（可选）：用户标识，默认 `wechat-miniapp-user`

### 响应格式

成功响应（200）：
```json
{
  "answer": "AI 回复内容",
  "conversation_id": "对话ID",
  "id": "消息ID",
  "status": "success",
  "usage": {
    "prompt_tokens": 100,
    "completion_tokens": 200,
    "total_tokens": 300
  }
}
```

错误响应：
```json
{
  "error": "错误描述",
  "detail": "详细错误信息"
}
```

## 六、注意事项

1. **安全配置**：
   - 生产环境必须使用环境变量存储 Dify API Key
   - 配置 CORS 允许小程序域名访问
   - 考虑添加请求频率限制

2. **Dify 服务**：
   - 确保已配置 Dify API Key
   - 确保后端服务器可以访问 Dify API 地址
   - 如果使用自部署的 Dify，请修改 `DIFY_BASE_URL` 为您的 Dify 服务地址

3. **错误处理**：
   - 根据实际需求调整错误响应格式
   - 添加日志记录以便调试

4. **CORS 配置**（如果需要）：

安装 `django-cors-headers`：
```bash
pip install django-cors-headers
```

在 `settings.py` 中配置：
```python
INSTALLED_APPS = [
    # ...
    'corsheaders',
    # ...
]

MIDDLEWARE = [
    # ...
    'corsheaders.middleware.CorsMiddleware',
    # ...
]

# 允许小程序域名
CORS_ALLOWED_ORIGINS = [
    "https://servicewechat.com",  # 微信小程序域名
]
```

## 七、小程序端配置

确保小程序端的 `API_BASE` 配置正确指向您的后端地址：

```typescript
// miniprogram/utils/api.ts
export const API_BASE = 'https://your-domain.com/api'
```

配置完成后，重启 Django 服务，小程序就可以正常使用 Dify 智能客服功能了！

