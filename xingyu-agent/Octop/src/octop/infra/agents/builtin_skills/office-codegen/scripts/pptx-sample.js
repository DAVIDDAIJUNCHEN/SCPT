// 1.9 方案B验证：pptxgenjs 最小演示（课件封面+目录页）
const { resolveLib } = require(require("path").join(__dirname, "resolve-libs.js"));
const PptxGenJS = require(resolveLib("pptxgenjs"));
const pptx = new PptxGenJS();
pptx.author = "星语Agent";
pptx.title = "人工智能基础 第1章";

// 封面
const cover = pptx.addSlide();
cover.addText("人工智能基础", { x: 1.5, y: 2.0, w: 7, h: 1.2, fontSize: 44, bold: true, align: "center", fontFace: "微软雅黑" });
cover.addText("第一章 走进人工智能", { x: 1.5, y: 3.4, w: 7, h: 0.8, fontSize: 24, align: "center", fontFace: "微软雅黑" });
cover.addText("四川邮电职业技术学院 信息工程学院", { x: 1.5, y: 5.6, w: 7, h: 0.5, fontSize: 14, align: "center" });

// 目录页
const toc = pptx.addSlide();
toc.addText("本章目录", { x: 0.6, y: 0.4, fontSize: 28, bold: true, fontFace: "微软雅黑" });
["1.1 什么是人工智能", "1.2 发展历程", "1.3 典型应用场景", "1.4 动手实践：第一个AI程序"].forEach(function (t, i) {
  toc.addText(t, { x: 1.2, y: 1.6 + i * 0.9, w: 7, h: 0.6, fontSize: 20, fontFace: "微软雅黑" });
});

const OUT = process.argv[2] || "课件演示.pptx"; // 输出路径：优先命令行参数，默认当前目录
pptx.writeFile({ fileName: OUT }).then(function () {
  console.log("PPTX written:", OUT);
}).catch(function (e) { console.error(e.message); process.exit(1); });
