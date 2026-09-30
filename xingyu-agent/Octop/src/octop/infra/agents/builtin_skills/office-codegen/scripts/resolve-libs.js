// 库路径解析：依次尝试 常见部署位置 + NODE_PATH + 当前目录
const path = require("path");
const fs = require("fs");
const CANDIDATES = [
  "/opt/office-libs/node_modules",                          // 镜像内置（迁移 3，Dockerfile office 层）
  process.env.OFFICE_LIBS_PATH || "",                       // 环境变量覆盖
  "/data/xingyu-agent/office-libs/node_modules",           // 星语 Agent 生产/PoC 宿主卷
  path.join(process.cwd(), "node_modules"),                 // 工作区就地安装
  path.join(__dirname, "..", "node_modules"),               // skill 目录自带
  process.env.NODE_PATH || "",                              // 环境变量
].filter(Boolean);
function resolveLib(name) {
  for (const base of CANDIDATES) {
    const p = path.join(base, name);
    if (fs.existsSync(path.join(p, "package.json"))) return p;
  }
  return name; // 兜底：交给 node 默认解析
}
module.exports = { resolveLib, CANDIDATES };
