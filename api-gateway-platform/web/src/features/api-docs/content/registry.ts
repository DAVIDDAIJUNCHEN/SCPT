/*
Copyright (C) 2023-2026 QuantumNous
Copyright (C) 2026 川邮·星语 · AlloMax（二次开发：/docs 多页文档站内容注册表）

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
// .md 经 rsbuild asset/source 规则以原文字符串导入（见 rsbuild.config.ts）
import audio from './audio.md'
import dify from './dify.md'
import embedding from './embedding.md'
import errors from './errors.md'
import faq from './faq.md'
import firstCall from './first-call.md'
import longContext from './long-context.md'
import models from './models.md'
import quickstart from './quickstart.md'
import rateLimits from './rate-limits.md'
import streaming from './streaming.md'
import vision from './vision.md'
import workbuddy from './workbuddy.md'

export interface DocEntry {
  /** URL slug（/docs/<slug>） */
  slug: string
  /** 侧边栏显示的短标题 */
  title: string
  /** 分组 key */
  group: string
  /** 页面描述（落地页卡片 / SEO 用） */
  description: string
  /** Markdown 原文（?raw 导入） */
  raw: string
}

export interface DocGroup {
  key: string
  label: string
  entries: DocEntry[]
}

/**
 * 13 页文档注册表（T8 分册体系）
 * 分组顺序即侧边栏顺序；entries 顺序即组内顺序 + 上一页/下一页顺序。
 */
const ENTRIES: DocEntry[] = [
  {
    slug: 'quickstart',
    title: '快速上手',
    group: 'quickstart',
    description: '3 步拿到 Key 发出第一个请求，一页纸总览全平台。',
    raw: quickstart,
  },
  {
    slug: 'first-call',
    title: '首次调用 API',
    group: 'quickstart',
    description: 'Base URL / 认证头 / 校园自签证书处理，第一次调用的完整路径。',
    raw: firstCall,
  },
  {
    slug: 'models',
    title: '模型与价格',
    group: 'dev',
    description: 'default / vip 分组模型与价格双口径总表。',
    raw: models,
  },
  {
    slug: 'errors',
    title: '错误码',
    group: 'dev',
    description: '全量错误码 + 502/503 网关双态排查手册。',
    raw: errors,
  },
  {
    slug: 'rate-limits',
    title: '限流与容量',
    group: 'dev',
    description: '各档并发上限、排队机制与 200 并发压测结论。',
    raw: rateLimits,
  },
  {
    slug: 'long-context',
    title: '1M 长上下文',
    group: 'dev',
    description: '两款 1M 模型的适用场景与并发容量账。',
    raw: longContext,
  },
  {
    slug: 'streaming',
    title: '流式输出',
    group: 'dev',
    description: 'SSE 流式调用方式与实测报文样例。',
    raw: streaming,
  },
  {
    slug: 'vision',
    title: '视觉理解（VL）',
    group: 'dev',
    description: 'Qwen3-VL 图片理解调用（base64 / URL）。',
    raw: vision,
  },
  {
    slug: 'audio',
    title: '语音能力',
    group: 'dev',
    description: 'TTS 语音合成 / ASR 语音识别 / 音频理解。',
    raw: audio,
  },
  {
    slug: 'embedding',
    title: 'Embedding 与 RAG',
    group: 'dev',
    description: 'bge-m3 向量化接口与 RAG 接入要点。',
    raw: embedding,
  },
  {
    slug: 'workbuddy',
    title: 'WorkBuddy 接入',
    group: 'clients',
    description: 'Windows 零证书优先 / Mac 证书配置的客户端接入手册。',
    raw: workbuddy,
  },
  {
    slug: 'dify',
    title: 'Dify 接入',
    group: 'clients',
    description: 'Dify 平台五步接入 + 自签证书双方案。',
    raw: dify,
  },
  {
    slug: 'faq',
    title: '计费与 FAQ',
    group: 'appendix',
    description: '模型速查总表、计费三句话版与常见问题。',
    raw: faq,
  },
]

const GROUP_LABELS: Record<string, string> = {
  quickstart: '快速上手',
  dev: '开发者手册',
  clients: '客户端接入',
  appendix: '附录',
}

const GROUP_ORDER = ['quickstart', 'dev', 'clients', 'appendix']

/** 按分组组织的目录树（侧边栏渲染用） */
export const DOC_GROUPS: DocGroup[] = GROUP_ORDER.map((key) => ({
  key,
  label: GROUP_LABELS[key] ?? key,
  entries: ENTRIES.filter((entry) => entry.group === key),
}))

/** slug → 条目 */
export const DOC_MAP: Record<string, DocEntry> = Object.fromEntries(
  ENTRIES.map((entry) => [entry.slug, entry])
)

/** 线性目录（上一页/下一页导航用） */
export const DOC_FLATLIST: DocEntry[] = ENTRIES

/**
 * T8 源文件名 → 站内 slug 的映射表。
 * 用于把 md 内互链（两种前缀写法 + 可选 #锚点）改写为 /docs/<slug> 路由。
 */
const FILENAME_TO_SLUG: Record<string, string> = {
  'T8-00-快速上手一页纸': 'quickstart',
  'T8-02-0-首次调用API': 'first-call',
  'T8-02-1-模型与价格': 'models',
  'T8-02-2-错误码': 'errors',
  'T8-02-3-限流与容量': 'rate-limits',
  'T8-02-4-1M长上下文': 'long-context',
  'T8-02-5-流式输出': 'streaming',
  'T8-02-6-多模态视觉理解': 'vision',
  'T8-02-7-语音能力': 'audio',
  'T8-02-8-Embedding与RAG': 'embedding',
  'T8-01-WorkBuddy接入手册': 'workbuddy',
  'T8-03-Dify接入手册': 'dify',
  'T8-附录-模型计费与FAQ': 'faq',
  // 02 系列互链的短前缀写法
  '02-0-首次调用API': 'first-call',
  '02-1-模型与价格': 'models',
  '02-2-错误码': 'errors',
  '02-3-限流与容量': 'rate-limits',
  '02-4-1M长上下文': 'long-context',
  '02-5-流式输出': 'streaming',
  '02-6-多模态视觉理解': 'vision',
  '02-7-语音能力': 'audio',
  '02-8-Embedding与RAG': 'embedding',
}

/**
 * 把 md 内的源文件互链改写为站内 /docs 路由。
 * 覆盖三种格式：
 *   ](02-1-模型与价格.md)         → ](/docs/models)
 *   ](T8-02-1-模型与价格.md)      → ](/docs/models)
 *   ](02-0-首次调用API.md#锚点)   → ](/docs/first-call#锚点)
 * 不匹配的链接（外链等）原样保留。
 */
export function rewriteInternalLinks(markdown: string): string {
  return markdown.replaceAll(
    /\]\(([^)#]+?)(?:\.md)?(#[^)]*)?\)/g,
    (matched, name: string, hash: string | undefined) => {
      const slug = FILENAME_TO_SLUG[name]

      if (!slug) {
        return matched
      }

      return `](/docs/${slug}${hash ?? ''})`
    }
  )
}
