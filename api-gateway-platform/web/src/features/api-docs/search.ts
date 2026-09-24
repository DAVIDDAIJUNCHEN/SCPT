/*
Copyright (C) 2023-2026 QuantumNous
Copyright (C) 2026 川邮·星语 · AlloMax（二次开发：/docs 全文搜索）

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
// .md 原文已随 bundle 打进客户端（DOC_FLATLIST[].raw），
// 搜索为纯客户端检索：构建期零额外产物、零后端依赖、中文子串匹配。
import { slugifyHeading } from '@/components/ui/markdown'

import type { DocEntry } from './content/registry'

export interface SearchHit {
  /** 命中所在分册 slug */
  slug: string
  /** 分册标题 */
  docTitle: string
  /** 命中段落标题（用于锚点跳转） */
  sectionTitle: string
  /** 命中段落标题的锚点 id（与渲染 id 同源） */
  sectionAnchor: string
  /** 摘要片段（围绕首个命中位置截取） */
  snippet: string
  /** 命中关键词在摘要中的起始下标（高亮用） */
  matchStart: number
  /** 命中关键词在摘要中的长度（高亮用） */
  matchLength: number
  /** 相关度得分：标题命中 > 正文命中；命中次数多者优先 */
  score: number
}

interface Section {
  slug: string
  docTitle: string
  title: string
  anchor: string
  /** 检索用正文：剥除 md 标记后的纯文本 */
  text: string
}

/** 剥除 Markdown 标记，保留可读文本（表格保留 | 分隔，代码块原样保留） */
function stripMarkdown(md: string): string {
  return md
    .replaceAll(/```[\s\S]*?```/g, (block) => block.replaceAll('\n', ' '))
    .replaceAll(/`([^`]+)`/g, '$1')
    .replaceAll(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replaceAll(/^#{1,6}\s+/gm, '')
    .replaceAll(/\*\*([^*]+)\*\*/g, '$1')
    .replaceAll(/\*([^*]+)\*/g, '$1')
    .replaceAll(/^>\s?/gm, '')
    .replaceAll(/^\|[-\s|:]+\|$/gm, '')
    .replaceAll(/\n{2,}/g, '\n')
    .trim()
}

/** 单行摘要最大长度（中文按字符算） */
const SNIPPET_WIDTH = 76
/** 摘要上下文（命中位置前留白） */
const SNIPPET_CONTEXT = 18

/** 按标题把一册 md 切成 section 索引 */
function buildSections(entry: DocEntry): Section[] {
  const headingRe = /^#{1,6}\s+(.+?)\s*$/gm
  const sections: Section[] = []
  let lastHeading: { title: string; anchor: string; start: number } | null = null
  let m: RegExpExecArray | null

  while ((m = headingRe.exec(entry.raw)) !== null) {
    if (lastHeading) {
      sections.push(toSection(entry, lastHeading, entry.raw.slice(lastHeading.start, m.index)))
    }
    lastHeading = { title: m[1], anchor: slugifyHeading(m[1]), start: m.index }
  }
  if (lastHeading) {
    sections.push(toSection(entry, lastHeading, entry.raw.slice(lastHeading.start)))
  }
  return sections
}

function toSection(
  entry: DocEntry,
  heading: { title: string; anchor: string; start: number },
  chunk: string
): Section {
  return {
    slug: entry.slug,
    docTitle: entry.title,
    title: heading.title,
    anchor: heading.anchor,
    text: stripMarkdown(chunk),
  }
}

/** 全部 section（模块级缓存：bundle 加载时构建一次） */
let cachedSections: Section[] | null = null

function getSections(entries: DocEntry[]): Section[] {
  if (!cachedSections || cachedSections.length === 0) {
    cachedSections = entries.flatMap(buildSections)
  }
  return cachedSections
}

/**
 * 全文检索：大小写不敏感的子串匹配（中文友好）。
 * - 标题命中（分册名/段落标题）权重最高
 * - 正文命中按命中次数累加
 * - 空白分隔的多关键词为 OR 语义，单个关键词至少 2 个字符
 */
export function searchDocs(
  query: string,
  entries: DocEntry[],
  limit = 12
): SearchHit[] {
  const keywords = query
    .toLowerCase()
    .split(/\s+/)
    .filter((k) => k.length >= 2)

  if (keywords.length === 0) {
    return []
  }

  const sections = getSections(entries)
  const hits: SearchHit[] = []

  for (const section of sections) {
    const lowerTitle = section.title.toLowerCase()
    const lowerText = section.text.toLowerCase()
    let score = 0
    let firstIndex = -1
    let matchLen = 0
    let occurrences = 0

    for (const kw of keywords) {
      if (lowerTitle.includes(kw)) {
        score += 10
      }
      let from = 0
      for (;;) {
        const idx = lowerText.indexOf(kw, from)
        if (idx === -1) {
          break
        }
        occurrences++
        if (firstIndex === -1 || idx < firstIndex) {
          firstIndex = idx
          matchLen = kw.length
        }
        from = idx + kw.length
      }
    }

    if (score === 0 && occurrences === 0) {
      continue
    }

    score += Math.min(occurrences, 10)

    const { snippet, matchStart } = makeSnippet(section.text, firstIndex)
    hits.push({
      slug: section.slug,
      docTitle: section.docTitle,
      sectionTitle: section.title,
      sectionAnchor: section.anchor,
      snippet,
      matchStart,
      matchLength: matchLen,
      score,
    })
  }

  hits.sort((a, b) => b.score - a.score)
  return hits.slice(0, limit)
}

/** 围绕命中位置截取单行摘要，并返回关键词在摘要中的新下标 */
function makeSnippet(
  text: string,
  matchIndex: number
): { snippet: string; matchStart: number } {
  if (matchIndex === -1) {
    // 纯标题命中：取正文开头
    return { snippet: text.slice(0, SNIPPET_WIDTH).replaceAll('\n', ' '), matchStart: 0 }
  }
  // 找到命中所在的行
  const lineStart = text.lastIndexOf('\n', matchIndex) + 1
  const line = text.slice(lineStart).split('\n')[0] ?? ''
  const inLine = matchIndex - lineStart
  let start = Math.max(0, inLine - SNIPPET_CONTEXT)
  let snippet = ''
  if (start > 0) {
    snippet = '…'
    start -= 1 // '…' 占一个字符位
  }
  snippet += line.slice(start, start + SNIPPET_WIDTH)
  if (start + SNIPPET_WIDTH < line.length) {
    snippet += '…'
  }
  return { snippet: snippet.replaceAll('\n', ' '), matchStart: inLine - start }
}
