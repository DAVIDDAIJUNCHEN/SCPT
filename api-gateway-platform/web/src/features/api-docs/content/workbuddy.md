# T8-01 · WorkBuddy 客户端接入手册

> 读者：需要在桌面客户端（而非网页）使用星语大模型的用户。
> 读完你可以：在 WorkBuddy 里直接对话星语 5 款模型，包括 100 万字长文档处理。
> 数据与界面核对日期：2026-09-24（Windows 零证书方案与 Mac 全流程均实测验证）。

---

## 快速入口（按你的电脑选）

| 你的电脑 | 跳转 | 配置量 | 耗时 |
|---|---|---|---|
| 🪟 **Windows** | → [第三节 Windows 配置](#三windows-版零证书三步约-5-分钟) | **零证书**，3 步 | 约 5 分钟 |
| 🍎 **macOS** | → [第四节 macOS 配置](#四macos-配置全流程四步约-10-分钟) | 需一次性证书配置，4 步 | 约 10 分钟 |

> 两平台配出来的能力完全一致；区别只在网络接入方式（Windows 走明文 3080 端口免证书，Mac 走 HTTPS 需装一次证书）。

## 一、WorkBuddy 是什么、和网页版的区别

| | 星语 Chat 网页版（ai-chat.sptc.edu.cn） | WorkBuddy 客户端 |
|---|---|---|
| 门槛 | 浏览器直接用，零配置 | 需装客户端；Win 零配置，Mac 需一次性证书配置（约 10 分钟） |
| 模型能力 | 平台开放的全部模型 | 同样全部模型 |
| 特色 | 简单、开箱即用 | **本地工作区文件直接引用**、长任务、代码/文档工程化操作 |
| 适合 | 偶尔问答、手机/公共电脑 | 每天深度使用、要处理本地文档的用户 |

**结论**：偶尔用 → 网页版即可（见[快速上手一页纸](T8-00-快速上手一页纸.md)）；天天用、要喂本地文件 → 值得配一次 WorkBuddy。

## 二、前置条件（缺一不可）

1. **校园网环境**：WorkBuddy 走 `ai-platform.sptc.edu.cn`，当前仅校园网内可达（校外访问暂未开放，开放后另行通知）。
2. **WorkBuddy 已安装**：Windows 与 macOS 双平台流程均覆盖（版本界面以实际为准）。
3. **星语账号 + API 令牌**：登录 `https://ai-platform.sptc.edu.cn` → 控制台 →「API 令牌」→ 创建令牌，**复制保存**（形如 `sk-xxxxxxxx`，只显示一次）。

## 三、Windows 版（✅ 零证书，三步约 5 分钟）

> **Windows 不需要装证书**。平台已为 API 单独开放明文端口 3080，全程零证书配置——这是与 Mac 方案的最大区别。

### 第 1 步：拿令牌

按第二节第 3 条操作：登录 `https://ai-platform.sptc.edu.cn` → 控制台 →「API 令牌」→ 创建令牌并保存。

### 第 2 步：配模型（地址走 3080 明文端口）

在 WorkBuddy **设置 → 模型配置**（自定义模型）中添加，或直接编辑 `%USERPROFILE%\.workbuddy\models.json` 后重启客户端。

**直接抄模板**（把 `sk-xxxxxxxx` 全部替换为你的令牌，保存为 `%USERPROFILE%\.workbuddy\models.json`）：

```json
[
  {
    "id": "DeepSeek-V4.1-Flash",
    "name": "DeepSeek-V4.1-Flash",
    "vendor": "Custom",
    "url": "http://ai-platform.sptc.edu.cn:3080/v1/chat/completions",
    "apiKey": "sk-xxxxxxxx",
    "supportsToolCall": true,
    "supportsImages": true,
    "supportsReasoning": true,
    "useCustomProtocol": false,
    "maxInputTokens": 1048576,
    "maxOutputTokens": 32768
  },
  {
    "id": "GLM-5.3-Flash",
    "name": "GLM-5.3-Flash",
    "vendor": "Custom",
    "url": "http://ai-platform.sptc.edu.cn:3080/v1/chat/completions",
    "apiKey": "sk-xxxxxxxx",
    "supportsToolCall": true,
    "supportsImages": true,
    "supportsReasoning": true,
    "useCustomProtocol": false,
    "onlyReasoning": false,
    "maxInputTokens": 1048576,
    "maxOutputTokens": 32768,
    "reasoning": {
      "defaultEffort": "low",
      "supportedEfforts": ["low", "medium", "high"],
      "canDisableThinking": true
    }
  },
  {
    "id": "Qwen3.8-Flash-Next",
    "name": "Qwen3.8-Flash-Next",
    "vendor": "Custom",
    "url": "http://ai-platform.sptc.edu.cn:3080/v1/chat/completions",
    "apiKey": "sk-xxxxxxxx",
    "supportsToolCall": true,
    "supportsImages": true,
    "supportsReasoning": true,
    "useCustomProtocol": false,
    "onlyReasoning": false,
    "maxInputTokens": 1048576,
    "maxOutputTokens": 65536,
    "reasoning": {
      "defaultEffort": "low",
      "supportedEfforts": ["low", "medium", "high"],
      "canDisableThinking": true
    }
  },
  {
    "id": "DeepSeek-V4-Flash-0731",
    "name": "DeepSeek-V4-Flash-0731",
    "vendor": "Custom",
    "url": "http://ai-platform.sptc.edu.cn:3080/v1/chat/completions",
    "apiKey": "sk-xxxxxxxx",
    "supportsToolCall": true,
    "supportsImages": false,
    "supportsReasoning": false,
    "useCustomProtocol": false,
    "maxInputTokens": 1048576,
    "maxOutputTokens": 32768
  },
  {
    "id": "GLM-5.3",
    "name": "GLM-5.3",
    "vendor": "Custom",
    "url": "http://ai-platform.sptc.edu.cn:3080/v1/chat/completions",
    "apiKey": "sk-xxxxxxxx",
    "supportsToolCall": true,
    "supportsImages": false,
    "supportsReasoning": true,
    "useCustomProtocol": false,
    "onlyReasoning": false,
    "maxInputTokens": 131072,
    "maxOutputTokens": 32768,
    "reasoning": {
      "defaultEffort": "high",
      "supportedEfforts": ["low", "high", "max"],
      "canDisableThinking": false
    }
  }
]
```

**模板说明（2026-09-24 真机配置核对）**：

| 模型 | 上下文 | 特点 | 可见分组 |
|---|---|---|---|
| DeepSeek-V4.1-Flash | 1M | 默认主力，快、综合能力最强 | default（注册默认） |
| GLM-5.3-Flash | 1M | 轻量快速，当前**半价优惠** | default（注册默认） |
| Qwen3.8-Flash-Next | 1M | 长文备选，输出上限最大（64K） | default（注册默认） |
| DeepSeek-V4-Flash-0731 | 1M | DeepSeek 上一代，备用 | default（注册默认） |
| GLM-5.3 | 128K | **深度思考专用**（vip 专享，default 令牌调用会返回 503） | 需 vip 分组 |

**GLM-5.3 注意**：账号注册默认属 **default 分组**，无该模型权限，配置了也调不通（报 503，这是分组策略不是故障）；确需深度思考场景，联系**智算中心**申请 **vip 分组**。

### 第 3 步：重启 WorkBuddy 并验证

彻底退出再打开 → 新建对话 → 选 DeepSeek-V4.1-Flash → 发"你好" → 正常回复即成功。

### 为什么 Windows 不用装证书（原理一句话）

WorkBuddy 的网络内核不读 Windows 证书商店，HTTPS 自签证书在 Win 上配起来比 Mac 还绕（路径随版本变、升级即失效）。平台的做法是给 API 单独开一个明文端口 3080——浏览器网页仍走加密的 443，API 调用走 3080，客户端零配置。

### Windows 常见问题

| 现象 | 原因 | 解决 |
|---|---|---|
| 连不上 / 超时 | 不在校园网，或 URL 误写成 `https://` | 确认校园网；核对 URL 是 `http://...:3080/...` |
| 401 | 令牌错误 | 控制台核对令牌 |
| 503 | 模型排队满或未授权（如 GLM-5.3） | 见第三节 GLM-5.3 注意 |
| 访问 `http://...:3080/` 根路径 404 | 正常——3080 只开 API，不承载网页 | 用 `/v1` 路径调 API |

## 四、macOS 配置全流程（四步，约 10 分钟）

> 原理一句话：星语使用学校自签证书，macOS 浏览器信任它≠WorkBuddy 信任它——WorkBuddy 的网络内核不读系统钥匙串，必须把证书放进它自己的目录。**只配一次，之后一直有效**（客户端升级后需重做第 2 步，一条命令的事）。

### 第 1 步：下载网关证书

证书文件 `scpt-gateway.crt`：**[点此下载](/scpt-gateway.crt)**（右键另存为，有效期至 2028 年 12 月），下载后放到如 `~/Downloads/`。

先核对证书有效（可选，建议做）：

```bash
openssl x509 -in ~/Downloads/scpt-gateway.crt -noout -subject -enddate
# 应看到 subject=CN=ai.sptc.edu.cn，有效期至 2028 年 12 月
```

### 第 2 步：把证书装进 WorkBuddy（决定性一步）

打开「终端」(Terminal)，粘贴执行：

```bash
cp ~/Downloads/scpt-gateway.crt \
   "/Applications/WorkBuddy.app/Contents/Resources/app.asar.unpacked/cli/ca.pem"
```

（如 WorkBuddy 装在别处，把 `/Applications/` 换成实际路径。）

### 第 3 步：配置自定义模型（5 款）

模型模板与**第三节 Windows 第 2 步完全相同**（5 款模型逐项照抄），**唯一区别**是所有 URL 字段换成 HTTPS 加密入口（不带 3080 端口）：

```json
"url": "https://ai-platform.sptc.edu.cn/v1/chat/completions"
```

即把 Windows 模板中的 `http://ai-platform.sptc.edu.cn:3080/v1/...` 换成 `https://ai-platform.sptc.edu.cn/v1/...`，5 款全部替换。模型说明与 GLM-5.3 的 vip 分组注意事项同样见第三节模板说明表。

配置方式：客户端 **设置 → 模型配置**（自定义模型）逐个添加，或直接编辑 `~/.workbuddy/models.json` 后重启客户端。

### 第 4 步：重启 WorkBuddy 并验证

**必须彻底退出再打开**（证书配置在启动时读取，改文件不重启无效）。验证：新建对话 → 选 DeepSeek-V4.1-Flash → 发一句"你好" → 正常回复即成功。

## 五、故障对照表（按命中率排序）

| 现象 | 原因 | 解决 |
|---|---|---|
| **502 / "安全连接建立失败"**（仅 Mac） | 证书没装好——**最高频问题**。注意：curl/浏览器能通、客户端不通，恰恰说明是证书信任层问题（客户端不读系统钥匙串） | 重做第四节第 2 步 cp 命令 → 彻底重启客户端；**Windows 用户直接用第三节 3080 零证书方案，无此问题** |
| **升级 WorkBuddy 后又 502 了**（仅 Mac） | 升级会清掉 ca.pem | 重跑第四节第 2 步那条 cp 命令（固定动作，10 秒） |
| **503（报文含 `no available channel` / `model_not_found`）** | ① 该模型排队满，稍后再试；② 用了未授权模型（如 default 令牌调 GLM-5.3） | ① 等 1~2 分钟换模型重试；② vip 模型联系智算中心开通分组 |
| **429** | 请求过于频繁（如脚本循环调用） | 降低调用频率，加退避重试 |
| **401 / 403** | 令牌错误或被禁用 | 控制台核对令牌状态，必要时重新创建 |
| 网页能用、WorkBuddy 连不上 | Mac：证书信任层问题（同 502）；Win：URL 写错（多写了 s 或漏了 :3080） | Mac 见 502 行；Win 核对第三节 URL |
| 换了台电脑就不通 | 新机器没做对应平台的配置 | Win 重走第三节；Mac 重走第四节 |

**三步自诊断**（技术型用户可用）：

```bash
# ① 域名本身通不通（走系统信任链）
curl -s -o /dev/null -w "HTTP %{http_code}\n" https://ai-platform.sptc.edu.cn/v1/models
# ② 看客户端真实报错（GUI 不显示，只在日志里）
grep -a "ACP Agent" ~/.workbuddy/logs/$(date +%F)/*.log | tail -5
# ③ 证书文件在不在（仅 Mac）
ls -la "/Applications/WorkBuddy.app/Contents/Resources/app.asar.unpacked/cli/ca.pem"
```

① 200 + ② 日志里 `self signed certificate` + ③ 文件缺失 = 典型证书未配置，重做第四节第 2 步。

仍未解决？带上 ② 中的日志片段联系**智算中心**。

## 六、进阶用法提示

- **喂本地长文档**：把文件放进工作区，直接要求"读这份文件并总结"——1M 上下文模型可整本教材直接喂（等待时间参考：8 万字约 10 秒开始回答、百万字约 6.5 分钟，见[02-4 1M 长上下文](T8-02-4-1M长上下文.md)）。
- **深度 vs 长度**：要"想得深"选 GLM-5.3（128K、强制思考，需 vip 分组）；要"读得长"选 1M 模型。两者互补，不要混用期望。
- 令牌泄露风险：models.json 是明文，**不要分享整个文件**；分享对话截图时注意遮盖令牌。

---

相关文档：[00 快速上手](T8-00-快速上手一页纸.md) · [02-0 首次调用 API](T8-02-0-首次调用API.md) · [02-2 错误码](T8-02-2-错误码.md) · [附录 计费与 FAQ](T8-附录-模型计费与FAQ.md)
