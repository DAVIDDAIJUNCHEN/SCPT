# Stage 1 · Portal 主页开发总结（StarWhisper 星语门户）

> **阶段周期**：2026-09-16 ~ 2026-09-17（2 天，24+ 轮迭代）
> **交付状态**：✅ 已收工，综合评估 **8.9 / 10**（四轮评估：7.3 → 8.5 → 8.7 → 8.9）
> **交付物**：`portal/index.html`（自包含单文件 92KB）+ `portal/assets/`（5 张品牌资产）+ `portal/nginx-ip.conf`

---

## 1. 阶段目标与定位

星语双入口战略的「门面」：对标 DeepSeek 官网首页，为校内师生提供**一眼即懂的 AI 服务入口**——

- 左上：品牌区（校徽 + 川邮·星语 / SCPT AI 垂直排版）
- 中央：slogan「智汇星语，算启未来」+ 消息输入框（回车直达 Chat，支持深度思考/联网搜索两个 pill 开关）
- 双按钮：「和星语对话」（→ OWUI Chat）+「使用星语 API 平台」（→ 星语控制台）
- 右上：DS 同款语言切换器（中 / EN，真 i18n）
- 底部：版权 + 校园网限定 + 服务说明

## 2. 技术架构决策

| 决策 | 选择 | 理由 |
|---|---|---|
| 文件形态 | **自包含单 HTML**（零外部请求） | 校园网环境零依赖、首屏极快（DOM 就绪 58ms）、部署只需 nginx 一个 root |
| 视觉主题 | 深空星空（canvas 星空 + 星云光晕 body::before） | 与「星语」品牌语义契合；#0e1538 统一底色 |
| i18n | 自研轻量方案：data-i18n 标记 + JS 词典 + localStorage | 无框架依赖；18 处标记 / 18 键 zh:en 完全对齐 |
| 品牌译名 | **StarWhisper** | 参考中国电信星辰大模型 TeleChat 的「语义流」命名，弃拼音直译 Xingyu |
| 校徽资产 | **双版本策略**：导航带文字 logo.png / favicon 无文字圆徽 | PIL 按行统计 alpha 定位圆徽主体（y=0-90）与文字（y=120-156）分界后精准裁剪 |
| 跳转目标 | CHAT_URL 动态 `location.origin + '/chat'` | 生产相对路径；file:// 本地预览回退 FALLBACK_ORIGIN 常量 |

## 3. 迭代时间线（24+ 轮）

### 第一轮：地基（v1 → v5）
1. 初版深空主题首页（slogan + 输入框 + 双按钮 + footer）
2. 公告条（fetch /api/notice，失败静默降级）
3. 消息输入框带深度思考 / 联网搜索两个 pill 开关
4. 星空 canvas 背景（rAF 动画，密度 1/4200，dpr 封顶 2）
5. nginx-ip.conf 初版（443 反代星语 + Portal 静态托管）

### 第二轮：品牌打磨（v6 → v9）
6. 校徽接入（原版带文字白校徽 base64 内联）
7. favicon 蓝底圆徽版（白底蓝圆徽 cover 撑满模拟 180 蓝像素）
8. **校徽去文字**（tab 用无文字圆徽）—— PIL alpha 按行分析定位分界
9. **导航恢复带文字版**（左上角保留完整校徽，tab 维持圆徽）
10. **SCPT AI 垂直排版**：移到川邮·星语下方，图标下移，文字与图标中线对齐
11. **AI 右移对齐**：translateX 16px → 用户反馈过头 → 8px，落在「星语」中部
12. **AI 去斜体**：`<i>` 默认斜体 → font-style:normal

### 第三轮：国际化与评估（v9 → v9.1）
13. **语言切换器**：1:1 复刻 DS 官网 .ds-locale-toggle（32px 胶囊分段 + active 白底浮起）
14. **英文译名拍板 StarWhisper**（对比 TeleChat 语义流 / 拼音 / StarTalk 三流派）
15. 品牌名纳入 i18n（en 模式主行变 StarWhisper，JS 移除 AI 偏移避免错位）
16. **第一轮专业评估：7.3 分** —— 揪出 P0（URL 硬编码、公告无降级）+ P1 一批
17. **P0+P1 全清**：CHAT_URL 动态 origin、公告 console.warn 降级、prefers-reduced-motion、resize 防抖 150ms、:focus-visible 焦点环、maxlength=2000、移动端 640px 断点
18. **背景统一 #0e1538**：body 三段渐变改纯色；星云光晕 inset:0 全屏，透明度 .16/.13/.08 → .20/.18/.12 补偿
19. **第二轮复评：8.5 分**（新发现 P1：isComposing 缺失、空输入无校验、硬编码 IP ×3）
20. **P1 清零（v9.1）**：keydown 加 `!e.isComposing`（中文输入法选词回车不误跳页）；goChat() 空输入聚焦+轻抖提示（.nudge，reduced-motion 停用）；3 处 IP 收敛为 FALLBACK_ORIGIN 单常量

### 第四轮：精修收尾（v9.1 → v9.2，8.7 → 8.9）
21. **第三轮评估：8.7 分**（浏览器实测取证）—— 发现 3 个新缺陷
22. **v9.2 三项修复**：移动端语言切换器复活（display:none → 缩小保留 28px）；service-note opacity .7→.8（3.78→4.97:1 达 AA）；主色 #4d6bfe→#4562f0（白字 4.33→4.93:1 达 AA，6 处 rgba 同步）
23. **第四轮评估：8.9 分收工** —— 性能实测（DOM 58ms / 60fps 帧率 30.4 / 星数 308）+ 新发现 P2（rAF 无 visibilitychange）+ P3（skip-link/noscript/aria-live）
24. **阶段总结与 Chat 开发计划**（本文档体系起点）

## 4. 最终技术指标（实测）

| 维度 | 指标 | 数据 |
|---|---|---|
| 性能 | DOM 就绪 / 完全加载 | **58ms / 60ms**（零外部请求） |
| 性能 | 动画帧率 / 星数 | 30.4fps（慢速星空够用）/ 308 颗 @1440×900 |
| 性能 | 文件体积构成 | 总 92KB = base64 66.8 + CSS 7.9 + JS 9.0 + 净 HTML 20.4 |
| i18n | 键对齐 | 18 标记 / 18 唯一键 / zh:en 12:12，零孤儿零闲置 |
| 可访问性 | WCAG 对比度 | 正文 15.72:1 / 次要 7.06:1 / service-note 4.97:1 / 主按钮 4.93:1 全达 AA |
| 布局 | 双视口 | 1440×900 与 390×844 均零横向溢出 |
| 交互 | 健壮性检查 | 13 项全过（isComposing、空校验、防抖、焦点环、aria-pressed…） |

## 5. 踩坑记录（教学要点）

| # | 坑 | 现象 | 解法 |
|---|---|---|---|
| 1 | **Edit 工具 vs 超长 base64** | 单行 66KB 的 base64 无法用字符串匹配替换 | 改用 Python 脚本 + 正则按 `data:image/png;base64,` 锚定替换 |
| 2 | **`<i>` 默认斜体** | AI 字符显示为斜体 | 显式 `font-style:normal` |
| 3 | **硬编码色值散落** | 改主色时 6 处 rgba 阴影漏改 | `sed` 批量替换 + grep 验证清零；经验：色值应全走 CSS 变量 |
| 4 | **中文输入法回车误触** | 拼音候选期敲回车 = 选词，但页面当发送跳页 | keydown 加 `!e.isComposing`（国内高频坑） |
| 5 | **移动端 display:none 一刀切** | 语言切换器在手机上彻底消失 | 改为缩小保留（28px 高），保留功能入口 |
| 6 | **file:// 协议相对路径失效** | 本地预览时 /chat /console 无处可去 | JS 检测协议，file:// 回退 FALLBACK_ORIGIN 常量 |
| 7 | **WCAG 对比度踩线** | opacity 叠加后的有效色值需混合计算 | 用混合公式 blend(fg,bg,alpha) 精确算，不靠肉眼 |
| 8 | **动画后台耗电** | rAF 循环无 visibilitychange，切后台仍跑 | P2 遗留：document.hidden 时 cancelAnimationFrame |
| 9 | **死代码 CTA** | #announcement-link 带 hidden 但 JS 从不显示 | P2 遗留（大王指示暂缓），处理公告时一起弄 |
| 10 | **transform 兜高度** | logo 114px 靠 translateY 撑出 nav 溢出 | 渲染正常但属脆弱写法，改 nav 高度时需注意 |

## 6. 资产清单

```
portal/
├── index.html          # 92KB 自包含单文件（v9.2 最终版）
├── nginx-ip.conf       # 443 双入口配置（已写好，待上 VPS）
└── assets/
    ├── logo.png              # 带文字白校徽（导航用，base64 内联进 html）
    ├── logo-blue.png         # 染色 #4176e6 版
    ├── logo-round.png        # 无文字圆徽（裁剪版）
    ├── logo-blue-round.png   # 染色圆徽
    └── favicon-round.png     # 白底蓝圆徽 favicon
```

**本地预览**：`python3 -m http.server 8899`（portal/ 目录），http://localhost:8899

## 7. 遗留项（P2/P3，不挡主线）

| 优先级 | 项 | 说明 |
|---|---|---|
| P2 | rAF visibilitychange 暂停 | 切后台停星空动画省电 |
| P2 | og: 社交分享标签 + canonical | 分享到微信/飞书时无摘要卡片 |
| P2 | 公告链接死 hidden | 与公告功能一起处理 |
| P3 | skip-link / noscript / aria-live | 无障碍补全 |
| P3 | base64 外置（可省 60KB+） | 转 .webp/.svg 外链 |

> ✅ 2026-09-18 S2 期间核实更正两条过期记录：移动端语言切换器**已修**（v9.2 缩小保留 28px，见 §3 第 22 条）；星语 ServerAddress **已配**（此前「未配」为过期信息）。

## 8. 教学复盘：这个阶段教会我们什么

1. **「评估-修复-复评」闭环是质量保证的核心**：四轮评估分数 7.3→8.5→8.7→8.9，每轮都能揪出新问题——第一轮揪工程缺陷，第三轮揪功能缺陷（死 CTA），第四轮揪性能细节（后台耗电）。**不评估就发现不了问题，评估要换维度**。
2. **用数据说话，不凭印象**：WCAG 对比度用公式算、i18n 用脚本验键对齐、布局用浏览器双视口实测、性能用 performance API 测帧率。
3. **单文件自包含是校园网环境的最优解**：零外部请求 = 零单点故障，58ms 首屏。
4. **品牌细节靠打磨不靠模板**：AI 偏移 16px→8px 一格一格调，校徽双版本策略，StarWhisper 译名三流派对比——这些是「像不像 DeepSeek」的差距所在。
5. **输入法、移动端、无障碍这些「边缘」场景恰恰是国内校园的高频场景**：isComposing 和移动端语言切换器两个 P1 都是真实用户会天天撞上的。
