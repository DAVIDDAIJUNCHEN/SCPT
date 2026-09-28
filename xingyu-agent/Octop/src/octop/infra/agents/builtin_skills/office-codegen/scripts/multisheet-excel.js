// 1.9 方案B验证：exceljs 生成多 sheet 带公式 Excel（成绩分析表）
const { resolveLib } = require(require("path").join(__dirname, "resolve-libs.js"));
const ExcelJS = require(resolveLib("exceljs"));
const wb = new ExcelJS.Workbook();
wb.creator = "星语Agent";

// ===== Sheet1: 原始成绩 =====
const ws1 = wb.addWorksheet("原始成绩", { properties: { defaultRowHeight: 18 } });
ws1.columns = [
  { header: "学号", key: "sid", width: 14 },
  { header: "姓名", key: "name", width: 10 },
  { header: "平时成绩", key: "ps", width: 10 },
  { header: "期中成绩", key: "qz", width: 10 },
  { header: "期末成绩", key: "qm", width: 10 },
  { header: "总评", key: "zp", width: 10 },
];
const students = [
  ["20261001", "张三", 92, 85, 88], ["20261002", "李四", 78, 82, 75],
  ["20261003", "王五", 85, 90, 92], ["20261004", "赵六", 66, 71, 69],
  ["20261005", "钱七", 90, 95, 94],
];
students.forEach(function (s) {
  const row = ws1.addRow({ sid: s[0], name: s[1], ps: s[2], qz: s[3], qm: s[4] });
  // 总评公式：平时30% + 期中30% + 期末40%（引用同 sheet 单元格）
  row.getCell("zp").value = { formula: "ROUND(C" + row.number + "*0.3+D" + row.number + "*0.3+E" + row.number + "*0.4,1)" };
});
ws1.getRow(1).font = { bold: true };
ws1.views = [{ state: "frozen", ySplit: 1 }];

// ===== Sheet2: 统计分析（跨 sheet 公式）=====
const ws2 = wb.addWorksheet("统计分析");
ws2.columns = [
  { header: "统计项", key: "item", width: 16 },
  { header: "数值", key: "val", width: 14 },
];
const n = students.length + 1;
const stats = [
  ["最高总评", "MAX(原始成绩!F2:F" + n + ")"],
  ["最低总评", "MIN(原始成绩!F2:F" + n + ")"],
  ["平均总评", "ROUND(AVERAGE(原始成绩!F2:F" + n + "),2)"],
  ["及格人数(≥60)", "COUNTIF(原始成绩!F2:F" + n + ",\">=60\")"],
  ["优秀人数(≥90)", "COUNTIF(原始成绩!F2:F" + n + ",\">=90\")"],
];
stats.forEach(function (s) {
  ws2.addRow({ item: s[0], val: { formula: s[1] } });
});
ws2.getRow(1).font = { bold: true };

const OUT = process.argv[2] || "成绩分析-多sheet公式.xlsx"; // 输出路径：优先命令行参数，默认当前目录
wb.xlsx.writeFile(OUT).then(function () {
  console.log("XLSX written:", OUT);
}).catch(function (e) { console.error(e.message); process.exit(1); });
