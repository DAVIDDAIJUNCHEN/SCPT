# 02-0 首次调用 API

> 川邮·星语 API 开发者手册 · 信息核实日期 2026-09-23
> 星语 API 与 **OpenAI API 格式完全兼容**，使用 OpenAI SDK 或任何兼容 OpenAI 的软件即可直接访问。

| 参数 | 取值 |
|---|---|
| base_url | `https://ai-platform.sptc.edu.cn/v1` |
| api_key | 星语控制台创建的令牌（见第一步） |
| model（新手推荐） | `DeepSeek-V4.1-Flash` |

---

## 第一步：获取令牌

1. 浏览器打开 **https://ai-platform.sptc.edu.cn**（校园网内访问）
2. 首次访问会提示「您的连接不是私密连接」——点 **高级 → 继续前往**（校园自签证书，属正常现象，不是被攻击）
3. 注册 / 登录 → 左侧「**令牌**」页 → 新建令牌 → 复制 `sk-` 开头的字符串

> 令牌等同于账号密码，请勿提交到公开代码仓库。
>
> **有效期与额度**：新建令牌时可选填「过期时间」（不填则**永不过期**；也提供 1 天 / 1 个月快捷选项，适合课程实验等短期场景），并可设置额度上限；过期或额度耗尽后调用会返回 401 / 402，到「令牌」页重新创建即可。

## 第二步：处理校园自签证书（星语特有，最重要的一步）

平台使用校园自签 HTTPS 证书。**代码和命令行工具默认会校验证书并失败**，表现为 SSL 错误或 502。按所用环境挂证书：

| 环境 | 挂法 |
|---|---|
| curl | 命令里加 `-k` 参数（正式项目可用 `--cacert 证书文件`） |
| Python（openai SDK） | 传入 `http_client=httpx.Client(verify=False)` |
| Node.js | 启动前设置环境变量 `NODE_EXTRA_CA_CERTS=证书文件路径`（临时测试可用 `NODE_TLS_REJECT_UNAUTHORIZED=0`，勿用于生产） |
| 浏览器 | 首次访问点「继续前往」，之后不再提示 |

> 证书下载：**[点此下载 scpt-gateway.crt](/scpt-gateway.crt)**（右键另存为；有效期至 2028-12）。遇到证书或接入问题，联系智算中心。

## 第三步：发出第一个请求

三语言任选其一（均已实测通过，2026-09-23）：

### curl

```bash
curl -k https://ai-platform.sptc.edu.cn/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${你的令牌}" \
  -d '{
        "model": "DeepSeek-V4.1-Flash",
        "messages": [
          {"role": "user", "content": "你好，请用一句话介绍你自己"}
        ]
      }'
```

### Python

```python
# pip install openai httpx
import httpx
from openai import OpenAI

client = OpenAI(
    base_url="https://ai-platform.sptc.edu.cn/v1",
    api_key="sk-你的令牌",
    http_client=httpx.Client(verify=False),  # 校园自签证书
)

resp = client.chat.completions.create(
    model="DeepSeek-V4.1-Flash",
    messages=[{"role": "user", "content": "你好，请用一句话介绍你自己"}],
)
print(resp.choices[0].message.content)
```

### Node.js

```js
// npm install openai
// 启动前: export NODE_EXTRA_CA_CERTS=/path/to/scpt-gateway.crt
import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "https://ai-platform.sptc.edu.cn/v1",
  apiKey: "sk-你的令牌",
});

const resp = await client.chat.completions.create({
  model: "DeepSeek-V4.1-Flash",
  messages: [{ role: "user", content: "你好，请用一句话介绍你自己" }],
});
console.log(resp.choices[0].message.content);
```

**流式输出**：在请求中加 `"stream": true` 即可（Python SDK 传 `stream=True`），逐字返回。详细用法见 [02-4 流式输出](02-4-流式输出.md)。

---

## 注意事项

- **网络边界**：平台仅校园网内可访问【实测 2026-09-23】；校外访问暂未开放，开放后将在此页更新。
- **模型名**：必须使用官方名（见 [02-1 模型与价格](02-1-模型与价格.md)）。旧小写别名（如 `glm-5.3-flash`）已于 2026-09-23 退役，继续调用会返回「无可用渠道」。
- **遇到报错**：查 [02-2 错误码](02-2-错误码.md)——502/SSL 错误先查证书挂法，503 看「排队满」还是「无可用渠道」；仍未解决可联系智算中心（请附上报错信息与 request id）。

## 下一步

- [02-1 模型与价格](02-1-模型与价格.md) —— 选哪款模型、花多少额度
- [02-2 错误码](02-2-错误码.md) —— 报错原因与解决方法
- [02-3 限流与容量](02-3-限流与容量.md) —— 并发上限与重试建议

---

*川邮·星语平台 · 智算中心维护 · 2026-09-23*
