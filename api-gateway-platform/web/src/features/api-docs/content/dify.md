# T8-03 · Dify 接入手册

> 读者：要用 Dify 搭建课程 Agent / 工作流应用、并让 Agent 调用星语大模型的教师。
> 读完你可以：在 Dify 里把星语配成模型供应商，并跑通第一个课程 Agent。
> 核对日期：2026-09-24（Dify 配置流程以官方文档 + 社区实测为准；Dify 版本迭代快，菜单位置以你实际版本为准）。

---

## 一、Dify 和星语的关系

```
你的课程 Agent（Dify 搭建）
        │ 调用
        ▼
星语平台（https://ai-platform.sptc.edu.cn/v1）── 鉴权令牌 ──> 模型池（DS-V4.1-Flash 等）
```

Dify 负责**应用编排**（提示词、知识库、工作流），星语负责**模型推理**。两者通过 OpenAI 兼容 API 对接——Dify 把星语当成一个"自定义模型供应商"。

**适合谁**：要给学生搭固定流程练习（如"英文邮件润色助手"、"代码纠错 Bot"）的课程教师。只想对话不需要编排的，用星语 Chat 网页版即可。

## 二、前置条件

1. Dify 已部署可用（自建或学校统一实例），版本 **1.x 插件架构**（0.x 老版本菜单结构不同，本手册以 1.x 为准）。
2. Dify 服务器在**校园网内**能访问 `ai-platform.sptc.edu.cn`。
3. 星语令牌一枚（获取方式见[00 快速上手](T8-00-快速上手一页纸.md)，形如 `sk-xxxxxxxx`）。

## 三、配置全流程（五步）

### 第 1 步：安装 OpenAI-API-compatible 插件

Dify 右上角头像 → **设置 → 模型供应商** → 在"安装模型供应商"区域搜索 **OpenAI-API-compatible**（langgenius 官方认证插件）→ 安装。

### 第 2 步：配置供应商凭据

点该插件卡片 → **设置**（或"去授权"），填：

| 配置项 | 填写值 |
|---|---|
| API Key | 你的星语令牌 `sk-xxxxxxxx` |
| API endpoint URL | `https://ai-platform.sptc.edu.cn/v1`（**必须以 /v1 结尾**） |

点保存时 Dify 会立即验证凭据。**如果这里报 SSL / certificate 错误，先别怀疑令牌**——跳到第四节处理自签证书问题（这是 Dify 接星语的第一大坑），处理完再回来。

### 第 3 步：添加模型

凭据验证通过后，在插件里**添加模型**（可自动发现或手动添加）。推荐先配主力款：

| 配置项 | 填写值 |
|---|---|
| 模型类型 | LLM |
| 模型名称 | `DeepSeek-V4.1-Flash`（需与星语模型名完全一致，区分大小写） |
| 上下文长度 | 1048576 |
| 最大输出 | 32768 |
| 功能开关 | 支持工具调用 ✅ / 支持视觉 ✅（该模型支持，见 [02-1 模型与价格](T8-02-1-模型与价格.md)） |

按需重复添加其他模型（GLM-5.3-Flash / Qwen3.8-Flash-Next / DeepSeek-V4-Flash-0731；GLM-5.3 为 vip 专享，普通令牌不可用）。

> 🔴 **命名红线**：模型名必须逐字符一致（如 `DeepSeek-V4.1-Flash` 不能写成 `deepseek-v4.1-flash`），写错调用时报 503 `model_not_found`。

### 第 4 步：自签证书处理（🔴 Dify 特有，必读）

**背景**：星语用学校自签证书；Dify 的模型请求由**插件容器（plugin-daemon）内的 Python（requests/certifi）**发出，它不认系统证书，也没有官方"跳过校验"勾选项【社区 issue #27789 实锤，官方未提供开关】。不做处理的话，第 2 步凭据验证必失败，报 `certificate verify failed`。

**两种解法，任选其一**：

**方案 A（推荐：证书进容器，一次配置长期有效）**：

```bash
# 在 Dify 宿主机上执行；容器名按实际 docker ps 确认
# ① 拿到星语网关证书
scp root@10.255.12.210:/data/nginx/cert/xy.crt ./scpt-gateway.crt

# ② 追加进 plugin-daemon 容器的 certifi 信任链，然后重启容器
docker cp ./scpt-gateway.crt <plugin-daemon容器>:/usr/local/share/ca-certificates/
docker exec <plugin-daemon容器> bash -c \
  "cat /usr/local/share/ca-certificates/scpt-gateway.crt >> \$(python3 -c 'import certifi;print(certifi.where())')"
docker restart <plugin-daemon容器>
```

**方案 B（应急：改插件源码跳过校验，升级插件后失效需重做）**：

```bash
# 定位插件文件（路径含版本号，按实际 ls 确认）
docker exec <plugin-daemon容器> ls /app/cwd/langgenius/
# 对 openai_api_compatible 插件的 llm.py 追加 verify=False
docker exec <plugin-daemon容器> bash -c "sed -i 's/requests\.post(endpoint_url, headers=headers, json=data, timeout=(10, 300)/requests.post(endpoint_url, headers=headers, json=data, timeout=(10, 300), verify=False)/g' <插件路径>/llm.py"
docker restart <plugin-daemon容器>
```

> 安全提示：方案 B 全局关闭了该插件的证书校验（理论上可被中间人攻击），校园内网风险可控，但**推荐优先方案 A**。

### 第 5 步：跑通第一个课程 Agent（最小样例）

1. Dify 首页 → **创建空白应用** → 选"聊天助手"→ 命名如《Python 疑难解答助手》。
2. 编排页：模型选刚添加的 `DeepSeek-V4.1-Flash`。
3. 提示词（可直接抄）：

```
你是《Python 程序设计》课程的助教。学生会粘贴报错信息或代码片段，请你：
1. 先用一句话指出错误类型；
2. 给出修改后的代码（只给必要的最小改动）；
3. 用一句话解释为什么。
回答用中文，代码块用 python 标注。
```

4. 右侧预览窗发一条 `print(你好)` 测试 → 正常回复即接入成功。
5. **发布** → 生成访问链接 → 嵌入课程页面或发给学生。

## 四、故障对照表

| 现象 | 原因 | 解决 |
|---|---|---|
| 凭据验证报 `certificate verify failed` | 🔴 自签证书未处理（最高频） | 第四节方案 A |
| 调用报 503 `model_not_found` | 模型名写错（大小写/版本号）或用了未授权模型（GLM-5.3） | 核对模型名逐字符一致；vip 模型找管理员 |
| 调用报 503 `no available channel` | 高峰排队满 | 等 1~2 分钟；Dify 工作流里加重试节点 |
| 凭据验证报 401 | 令牌错误/被禁用 | 控制台核对令牌 |
| Dify 容器 curl 不通 ai-platform 域名 | Dify 服务器不在校园网 / DNS 解析不到 | 先在 Dify 容器内 `curl https://ai-platform.sptc.edu.cn/v1/models` 验证网络，再谈配置 |
| 插件升级后又 certificate 报错 | 方案 B 的修改被升级覆盖 | 重做方案 B 或改用方案 A |

## 五、进阶提示

- **知识库（RAG）搭配**：课程资料上传 Dify 知识库时，检索用的 Embedding 模型也可指向星语 `bge-m3`（配置方法同上，模型类型选"文本嵌入"，见 [02-8 Embedding 与 RAG](T8-02-8-Embedding与RAG.md)）。
- **计费**：Dify 应用产生的用量计入你的星语令牌，学生用得多额度消耗快，留意控制台用量统计（计费口径见[附录](T8-附录-模型计费与FAQ.md)）。
- **给学生用时**：发布的应用链接由 Dify 托管，学生无需星语令牌——令牌只在你配置供应商时用一次，不要泄露。

---

相关文档：[00 快速上手](T8-00-快速上手一页纸.md) · [01 WorkBuddy 接入](T8-01-WorkBuddy接入手册.md) · [02-0 首次调用 API](T8-02-0-首次调用API.md) · [附录 计费与 FAQ](T8-附录-模型计费与FAQ.md)
