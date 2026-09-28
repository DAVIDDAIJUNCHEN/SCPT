---
name: jiaoan
description: 必须用于编写或评审教案、课程设计、课时计划、课件大纲（PPT 大纲）、课程标准对齐分析等教学准备文档。覆盖教学目标三维拆解（知识/能力/素养）、教学环节设计、重难点定位与职业院校理实一体化课型适配。Must use for lesson plans, course designs, teaching slide outlines, and curriculum standard alignment.
metadata:
  octop:
    emoji: "📚"
    label:
      zh: "教案与课件"
      en: "Lesson Plan"
    summary:
      zh: "教案、课时计划、课件大纲、课标对齐分析。"
      en: "Lesson plans, slide outlines, and curriculum alignment."
---

# 教案与课件大纲

面向职业院校（高职）教学场景，产出可直接使用的教案与课件大纲。**所有文档必须对齐用户提供的课程标准或教学大纲；未提供时先索要，不可凭空杜撰课程标准条目。**

## 工作流程

1. **收集输入**（缺一不可，缺失时先问）：
   - 课程名称、授课对象（专业/年级/学情特点）
   - 本次课的章/节/知识点范围
   - 学时数（理论+实践配比）与课型（理实一体/纯理论/实训）
   - 课程标准或教学大纲文件（若用户没有，明确说明将按通用高职课程标准框架编写，并提示用户复核）
2. **读参考文档**：
   - 教案结构模板：`{{OCTOP_BUILTIN_SKILLS}}/jiaoan/references/jiaoan-template.md`
   - 课标对齐方法：`{{OCTOP_BUILTIN_SKILLS}}/jiaoan/references/kebiao-alignment.md`
   - 职业教育相关要求（如用户提及）：`{{OCTOP_BUILTIN_SKILLS}}/jiaoan/references/vocational-notes.md`
3. **产出教案**，按模板结构输出 Markdown：
   - 教学目标必须三维拆解：知识目标 / 能力目标 / 素养目标（思政元素自然融入，不贴标签）
   - 每个教学环节标注**时长**、**教师活动**、**学生活动**、**设计意图**
   - 重难点要写「定位依据」（为什么是重点/难点），不能只罗列
   - 理实一体课型必须含实操环节：任务描述、分组方式、评价标准
4. **产出课件大纲**（用户要求时）：按「封面→学习目标→导入→知识点分节→实操演示→小结→作业→结尾」出逐页大纲，每页一句核心内容 + 讲解要点提示，不写逐字稿。

## 质量红线

- 教学目标用可观测动词（能说出/能操作/能设计），禁「了解」「掌握」等模糊词单独出现
- 环节时长总和必须等于学时数 × 45 分钟，输出前自查
- 高职课必须有职业场景衔接（岗位任务/1+X 证书/技能竞赛可挂钩）
- 课件大纲页数与学时匹配：1 学时约 15-25 页
