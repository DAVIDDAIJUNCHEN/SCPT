// 1.9 方案B验证：docx 库生成 GB/T 9704-2012 版式公文
// 版式要点：版心 156mm x 225mm（上37 下35 左28 右26），标题二号小标宋，正文三号仿宋，首行缩进2字符
const mmToTwip = (mm) => Math.round(mm * 56.6929);
const { resolveLib } = require(require("path").join(__dirname, "resolve-libs.js"));
const {
  Document, Packer, Paragraph, TextRun, AlignmentType, PageNumber,
  Footer, Header, LineRuleType, TabStopType, convertMillimetersToTwip,
} = require(resolveLib("docx"));

const FANGSONG = "仿宋_GB2312"; // 三号仿宋（正文）
const XBS = "方正小标宋简体";   // 二号小标宋（标题）
const KT = "楷体_GB2312";       // 附件说明等

function bodyPara(text, opts = {}) {
  return new Paragraph({
    children: [new TextRun({ text, font: { ascii: "Times New Roman", eastAsia: FANGSONG }, size: 32 })], // 三号=16pt=32半磅
    spacing: { line: 560, lineRule: LineRuleType.EXACT }, // 28磅行距（三号字标准）
    indent: opts.noIndent ? undefined : { firstLine: 640 }, // 首行缩进2字符（三号字约320twip/字）
    alignment: opts.align || AlignmentType.JUSTIFIED,
    ...opts.para,
  });
}

const doc = new Document({
  creator: "星语Agent",
  title: "关于开展2026年秋季实验室安全专项检查的通知",
  sections: [{
    properties: {
      page: {
        size: { width: mmToTwip(210), height: mmToTwip(297) }, // A4
        margin: { top: mmToTwip(37), bottom: mmToTwip(35), left: mmToTwip(28), right: mmToTwip(26) },
      },
    },
    children: [
      // ===== 版头：份号/密级/发文机关标志（红头占位）=====
      new Paragraph({ children: [new TextRun({ text: "四川邮电职业技术学院文件", font: { eastAsia: XBS }, size: 60, color: "FF0000" })], alignment: AlignmentType.CENTER, spacing: { after: 240, line: 700, lineRule: LineRuleType.EXACT } }),
      // 发文字号（居中，三号仿宋）
      new Paragraph({ children: [new TextRun({ text: "川邮院发〔2026〕12号", font: { eastAsia: FANGSONG }, size: 32 })], alignment: AlignmentType.CENTER, spacing: { after: 120 } }),
      // 红色分隔线
      new Paragraph({ children: [new TextRun({ text: "", size: 2 })], border: { bottom: { style: "single", size: 12, color: "FF0000", space: 1 } }, spacing: { after: 240 } }),
      // ===== 标题：二号小标宋，居中 =====
      new Paragraph({
        children: [new TextRun({ text: "关于开展2026年秋季实验室安全专项检查的通知", font: { eastAsia: XBS }, size: 44 })], // 二号=22pt=44半磅
        alignment: AlignmentType.CENTER,
        spacing: { before: 480, after: 360, line: 620, lineRule: LineRuleType.EXACT },
      }),
      // ===== 主送机关：三号仿宋，顶格 =====
      bodyPara("各二级学院、各部门：", { noIndent: true }),
      // ===== 正文：三号仿宋，首行缩进2字符 =====
      bodyPara("为深入贯彻落实上级关于安全生产工作的决策部署，切实加强实验室安全管理，经研究，决定开展2026年秋季实验室安全专项检查。现将有关事项通知如下。"),
      bodyPara("一、检查范围", { noIndent: true, para: { spacing: { before: 120, line: 560, lineRule: LineRuleType.EXACT } } }),
      bodyPara("全校各类教学实验室、科研实验室及实训场所，重点检查危险化学品存储、用电安全、消防设施配备等情况。"),
      bodyPara("二、时间安排", { noIndent: true }),
      bodyPara("（一）自查阶段（10月10日至10月17日）：各单位对照检查标准开展全面自查。"),
      bodyPara("（二）集中检查阶段（10月20日至10月31日）：学校组织检查组实地核查。"),
      // ===== 附件说明 =====
      bodyPara("附件：1.实验室安全专项检查标准", { noIndent: true, para: { spacing: { before: 240 } } }),
      bodyPara("      2.自查情况统计表"),
      // ===== 发文机关署名 + 成文日期（右空2字）=====
      new Paragraph({ children: [new TextRun({ text: "四川邮电职业技术学院", font: { eastAsia: FANGSONG }, size: 32 })], alignment: AlignmentType.RIGHT, indent: { right: 640 }, spacing: { before: 480, line: 560, lineRule: LineRuleType.EXACT } }),
      new Paragraph({ children: [new TextRun({ text: "2026年9月29日", font: { eastAsia: FANGSONG }, size: 32 })], alignment: AlignmentType.RIGHT, indent: { right: 800 }, spacing: { line: 560, lineRule: LineRuleType.EXACT } }),
      // ===== 版记：抄送 + 印发机关 =====
      new Paragraph({ children: [new TextRun({ text: "抄送：院领导，安全保卫处。", font: { eastAsia: FANGSONG }, size: 28 })], border: { top: { style: "single", size: 4, color: "000000", space: 2 } }, spacing: { before: 720 } }),
      new Paragraph({ children: [new TextRun({ text: "四川邮电职业技术学院办公室          2026年9月29日印发", font: { eastAsia: FANGSONG }, size: 28 })], border: { bottom: { style: "single", size: 4, color: "000000", space: 2 } } }),
      // 页码（页脚，四号半角宋体数字，单页右空1字——此处简化居中）
      new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ children: ["— ", PageNumber.CURRENT, " —"], font: { eastAsia: "宋体" }, size: 28 })] })] }),
    ],
  }],
});

const OUT = process.argv[2] || "通知-GB9704.docx"; // 输出路径：优先命令行参数，默认当前目录
Packer.toBuffer(doc).then((buf) => {
  require("fs").writeFileSync(OUT, buf);
  console.log("DOCX written:", OUT, buf.length, "bytes");
});
