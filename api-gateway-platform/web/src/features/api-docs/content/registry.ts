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
// 英文分册（2026-09 双语化：中文原文 + 英文译本同 slug 双路由）
import audioEn from './en/audio.md'
import difyEn from './en/dify.md'
import embeddingEn from './en/embedding.md'
import errorsEn from './en/errors.md'
import faqEn from './en/faq.md'
import firstCallEn from './en/first-call.md'
import longContextEn from './en/long-context.md'
import modelsEn from './en/models.md'
import quickstartEn from './en/quickstart.md'
import rateLimitsEn from './en/rate-limits.md'
import streamingEn from './en/streaming.md'
import visionEn from './en/vision.md'
import workbuddyEn from './en/workbuddy.md'

/** 文档语言：中文原文 or 英文译本 */
export type DocLang = 'zh' | 'en'

/**
 * 把 i18n 语言码归一化为文档语言。
 * i18n.language 形如 zhCN / zh-TW / en / fr / ru / ja / vi …
 * zh 系（简繁）读中文分册，其余语言读英文分册（文档只维护 zh/en 两版）。
 */
export function toDocLang(i18nLanguage: string): DocLang {
  return i18nLanguage?.toLowerCase().startsWith('zh') ? 'zh' : 'en'
}

/** 单语言的分册数据（侧栏/正文/搜索消费的扁平形态） */
export interface DocEntry {
  /** URL slug（/docs/<slug>，zh/en 共用同一路由） */
  slug: string
  /** 侧边栏显示的短标题 */
  title: string
  /** 分组 key */
  group: string
  /** 页面描述（落地页卡片 / SEO 用） */
  description: string
  /** Markdown 原文（asset/source 导入） */
  raw: string
}

/** 单分册的双语数据（内部注册形态） */
interface BilingualEntry {
  slug: string
  group: string
  zh: { title: string; description: string; raw: string }
  en: { title: string; description: string; raw: string }
}

export interface DocGroup {
  key: string
  label: string
  entries: DocEntry[]
}

/**
 * 13 页文档注册表（T8 分册体系 · 中英双语）
 * 分组顺序即侧边栏顺序；entries 顺序即组内顺序 + 上一页/下一页顺序。
 */
const BILINGUAL_ENTRIES: BilingualEntry[] = [
  {
    slug: 'quickstart',
    group: 'quickstart',
    zh: {
      title: '快速上手',
      description: '3 步拿到 Key 发出第一个请求，一页纸总览全平台。',
      raw: quickstart,
    },
    en: {
      title: 'Quickstart',
      description: 'Get a key and send your first request in 3 steps — a one-page overview of the platform.',
      raw: quickstartEn,
    },
  },
  {
    slug: 'first-call',
    group: 'quickstart',
    zh: {
      title: '首次调用 API',
      description: 'Base URL / 认证头 / 校园自签证书处理，第一次调用的完整路径。',
      raw: firstCall,
    },
    en: {
      title: 'First API Call',
      description: 'Base URL, auth headers, and the campus self-signed certificate — the complete path for your first call.',
      raw: firstCallEn,
    },
  },
  {
    slug: 'models',
    group: 'dev',
    zh: {
      title: '模型与价格',
      description: 'default / vip 分组模型与价格双口径总表。',
      raw: models,
    },
    en: {
      title: 'Models & Pricing',
      description: 'The default / vip group model and pricing reference tables.',
      raw: modelsEn,
    },
  },
  {
    slug: 'errors',
    group: 'dev',
    zh: {
      title: '错误码',
      description: '全量错误码 + 502/503 网关双态排查手册。',
      raw: errors,
    },
    en: {
      title: 'Error Codes',
      description: 'Full error-code reference plus 502/503 gateway triage.',
      raw: errorsEn,
    },
  },
  {
    slug: 'rate-limits',
    group: 'dev',
    zh: {
      title: '限流与容量',
      description: '各档并发上限、排队机制与 200 并发压测结论。',
      raw: rateLimits,
    },
    en: {
      title: 'Rate Limits & Capacity',
      description: 'Per-model concurrency limits, queueing, and 200-way load-test conclusions.',
      raw: rateLimitsEn,
    },
  },
  {
    slug: 'long-context',
    group: 'dev',
    zh: {
      title: '1M 长上下文',
      description: '两款 1M 模型的适用场景与并发容量账。',
      raw: longContext,
    },
    en: {
      title: '1M Long Context',
      description: 'Use cases and the concurrency budget of the 1M-context models.',
      raw: longContextEn,
    },
  },
  {
    slug: 'streaming',
    group: 'dev',
    zh: {
      title: '流式输出',
      description: 'SSE 流式调用方式与实测报文样例。',
      raw: streaming,
    },
    en: {
      title: 'Streaming',
      description: 'SSE streaming usage with tested message samples.',
      raw: streamingEn,
    },
  },
  {
    slug: 'vision',
    group: 'dev',
    zh: {
      title: '视觉与图像生成',
      description: 'Qwen3-VL 图片理解 + FLUX.2 文生图调用样例。',
      raw: vision,
    },
    en: {
      title: 'Vision & Image Generation',
      description: 'Qwen3-VL image understanding + FLUX.2 text-to-image samples.',
      raw: visionEn,
    },
  },
  {
    slug: 'audio',
    group: 'dev',
    zh: {
      title: '语音能力',
      description: 'TTS 语音合成 / ASR 语音识别 / 音频理解。',
      raw: audio,
    },
    en: {
      title: 'Audio',
      description: 'TTS synthesis / ASR recognition / audio understanding.',
      raw: audioEn,
    },
  },
  {
    slug: 'embedding',
    group: 'dev',
    zh: {
      title: 'Embedding 与 RAG',
      description: 'bge-m3 向量化接口与 RAG 接入要点。',
      raw: embedding,
    },
    en: {
      title: 'Embedding & RAG',
      description: 'The bge-m3 embedding API and RAG integration essentials.',
      raw: embeddingEn,
    },
  },
  {
    slug: 'workbuddy',
    group: 'clients',
    zh: {
      title: 'WorkBuddy 接入',
      description: 'Windows 零证书优先 / Mac 证书配置的客户端接入手册。',
      raw: workbuddy,
    },
    en: {
      title: 'WorkBuddy Integration',
      description: 'Windows zero-certificate first / macOS certificate setup — the client integration guide.',
      raw: workbuddyEn,
    },
  },
  {
    slug: 'dify',
    group: 'clients',
    zh: {
      title: 'Dify 接入',
      description: 'Dify 平台五步接入 + 自签证书双方案。',
      raw: dify,
    },
    en: {
      title: 'Dify Integration',
      description: 'Five-step Dify setup + two self-signed certificate solutions.',
      raw: difyEn,
    },
  },
  {
    slug: 'faq',
    group: 'appendix',
    zh: {
      title: '计费与 FAQ',
      description: '模型速查总表、计费三句话版与常见问题。',
      raw: faq,
    },
    en: {
      title: 'Billing & FAQ',
      description: 'Model quick-reference table, billing in three sentences, and FAQs.',
      raw: faqEn,
    },
  },
]

const GROUP_LABELS: Record<string, Record<DocLang, string>> = {
  quickstart: { zh: '快速上手', en: 'Quick Start' },
  dev: { zh: '开发者手册', en: 'Developer Guide' },
  clients: { zh: '客户端接入', en: 'Client Integration' },
  appendix: { zh: '附录', en: 'Appendix' },
}

const GROUP_ORDER = ['quickstart', 'dev', 'clients', 'appendix']

/** 取某语言的分册扁平数据 */
export function getEntryByLang(entry: BilingualEntry, lang: DocLang): DocEntry {
  const locale = entry[lang]
  return {
    slug: entry.slug,
    group: entry.group,
    title: locale.title,
    description: locale.description,
    raw: locale.raw,
  }
}

/** 按分组组织的目录树（侧边栏 / 落地页渲染用，按语言取） */
export function getDocGroupsByLang(lang: DocLang): DocGroup[] {
  return GROUP_ORDER.map((key) => ({
    key,
    label: GROUP_LABELS[key]?.[lang] ?? key,
    entries: BILINGUAL_ENTRIES.filter((entry) => entry.group === key).map((entry) =>
      getEntryByLang(entry, lang)
    ),
  }))
}

/** slug → 条目（按语言取） */
export function getDocMapByLang(lang: DocLang): Record<string, DocEntry> {
  return Object.fromEntries(
    BILINGUAL_ENTRIES.map((entry) => [entry.slug, getEntryByLang(entry, lang)])
  )
}

/** 线性目录（上一页/下一页导航 / 搜索索引用，按语言取） */
export function getDocFlatListByLang(lang: DocLang): DocEntry[] {
  return BILINGUAL_ENTRIES.map((entry) => getEntryByLang(entry, lang))
}

/** slug 是否存在（路由 beforeLoad 校验用，与语言无关） */
export const DOC_SLUGS: Set<string> = new Set(BILINGUAL_ENTRIES.map((entry) => entry.slug))

/**
 * T8 源文件名 → 站内 slug 的映射表。
 * 用于把 md 内互链（两种前缀写法 + 可选 #锚点）改写为 /docs/<slug> 路由。
 * 英文分册内直接写 /docs/<slug>，不命中此表，原样保留。
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
 * 不匹配的链接（外链 / 英文分册直写的 /docs/<slug>）原样保留。
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
