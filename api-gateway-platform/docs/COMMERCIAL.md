# AlloMax API Gateway Platform

基于 [QuantumNous/new-api](https://github.com/QuantumNous/new-api)（上游 commit `0ed497f`，AGPLv3）的二次开发，用于 AlloMax 模型平台的 API 纳管、计费与能力管控。

## 分支与版本

- `main`：产品开发主线（本仓库自此为干净单根历史，便于维护与推送）
- 上游同步：`git fetch upstream` 后按需 cherry-pick

## 二次开发功能

- M1 手机号注册/登录 + 短信验证码（Mock → 阿里云/腾讯云）
- M2 模型能力管控（per-token RPM/TPM/并发/预算熔断，对标 litellm）
- 部署：见 `deploy/`（容器化构建 + docker-compose 生产模板）

> License 遵循上游 AGPLv3（本仓库保留 LICENSE/NOTICE/THIRD-PARTY-LICENSES.md）。
