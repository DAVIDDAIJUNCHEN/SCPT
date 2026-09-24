/*
Copyright (C) 2023-2026 QuantumNous
Copyright (C) 2026 川邮·星语 · AlloMax（二次开发：/docs 多页文档站布局）

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  ChevronRight,
  Copy,
  Gauge,
  KeyRound,
  Sparkles,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from '@tanstack/react-router'
import { toast } from 'sonner'

import { PublicLayout } from '@/components/layout'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Markdown } from '@/components/ui/markdown'
import { resolveServerAddress } from '@/lib/server-address'

import {
  DOC_FLATLIST,
  DOC_GROUPS,
  DOC_MAP,
  rewriteInternalLinks,
  type DocEntry,
} from './content/registry'

const BASE_URL = `${resolveServerAddress()}/v1`

// ---------- 工具 ----------

/** 渲染前改写 md 内链 → /docs/<slug> */
function prepareMarkdown(raw: string): string {
  return rewriteInternalLinks(raw)
}

/** 渲染 md；站内 /docs 链接点击时走前端路由跳转 */
function DocsMarkdown({ entry }: { entry: DocEntry }) {
  const navigate = useNavigate()
  const prepared = useMemo(() => prepareMarkdown(entry.raw), [entry.raw])
  const containerId = useMemo(() => `docs-content-${entry.slug}`, [entry.slug])

  useEffect(() => {
    const container = document.querySelector(`#${containerId}`) as HTMLElement | null

    if (!container) {
      return
    }

    const onClick = (event: MouseEvent) => {
      const anchor = (event.target as HTMLElement).closest?.('a')

      if (!anchor) {
        return
      }

      const href = anchor.getAttribute('href') ?? ''
      const target = anchor.getAttribute('target')

      if (target === '_blank' || event.metaKey || event.ctrlKey || event.shiftKey) {
        return
      }

      // 同页 #锚点：浏览器原生处理
      if (href.startsWith('#')) {
        return
      }

      // 站内文档链接：接管为前端路由跳转（hash 单独拆出，导航后滚动定位）
      if (href.startsWith('/docs/')) {
        event.preventDefault()

        const hashIndex = href.indexOf('#')
        const path = hashIndex >= 0 ? href.slice(0, hashIndex) : href
        const hash = hashIndex >= 0 ? decodeURIComponent(href.slice(hashIndex + 1)) : ''

        if (hash && path === location.pathname) {
          // 同页锚点（经改写后的 /docs/xx#yy 格式）：直接滚动
          document.getElementById(hash)?.scrollIntoView({ behavior: 'smooth' })
        } else {
          navigate({ to: path })

          if (hash) {
            // 等内容渲染后滚动到目标标题
            setTimeout(() => {
              document.getElementById(hash)?.scrollIntoView({ behavior: 'smooth' })
            }, 120)
          }
        }
      }
    }

    container.addEventListener('click', onClick)

    return () => container.removeEventListener('click', onClick)
  }, [containerId, navigate, prepared])

  return (
    <div id={containerId}>
      <Markdown>{prepared}</Markdown>
    </div>
  )
}

// ---------- 侧边栏 ----------

function SidebarNav({ activeSlug }: { activeSlug: string | null }) {
  return (
    <nav className='space-y-6'>
      <Link
        to='/docs'
        className={`flex items-center justify-between rounded-md px-3 py-1.5 text-sm transition-colors ${
          activeSlug === null
            ? 'bg-primary/10 font-medium text-primary'
            : 'text-muted-foreground hover:bg-muted hover:text-foreground'
        }`}
      >
        <span>文档首页</span>
        {activeSlug === null && <ChevronRight className='h-3.5 w-3.5' />}
      </Link>

      {DOC_GROUPS.map((group) => (
        <div key={group.key}>
          <div className='mb-2 px-3 text-xs font-semibold tracking-wider text-muted-foreground'>
            {group.label}
          </div>
          <ul className='space-y-0.5'>
            {group.entries.map((entry) => {
              const active = entry.slug === activeSlug

              return (
                <li key={entry.slug}>
                  <Link
                    to='/docs/$slug'
                    params={{ slug: entry.slug }}
                    className={`flex items-center justify-between rounded-md px-3 py-1.5 text-sm transition-colors ${
                      active
                        ? 'bg-primary/10 font-medium text-primary'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                    }`}
                  >
                    <span>{entry.title}</span>
                    {active && <ChevronRight className='h-3.5 w-3.5' />}
                  </Link>
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </nav>
  )
}

// ---------- 上一页 / 下一页 ----------

function PrevNextNav({ slug }: { slug: string }) {
  const index = DOC_FLATLIST.findIndex((entry) => entry.slug === slug)

  if (index === -1) {
    return null
  }

  const prev = index > 0 ? DOC_FLATLIST[index - 1] : null
  const next = index < DOC_FLATLIST.length - 1 ? DOC_FLATLIST[index + 1] : null

  if (!prev && !next) {
    return null
  }

  return (
    <div className='mt-10 flex flex-col gap-3 border-t pt-6 sm:flex-row sm:justify-between'>
      {prev ? (
        <Link
          to='/docs/$slug'
          params={{ slug: prev.slug }}
          className='group flex max-w-[45%] flex-1 items-center gap-3 rounded-lg border p-4 transition-colors hover:border-primary/50 hover:bg-muted/50'
        >
          <ArrowLeft className='h-4 w-4 shrink-0 text-muted-foreground group-hover:text-primary' />
          <span className='min-w-0'>
            <span className='block text-xs text-muted-foreground'>上一页</span>
            <span className='block truncate text-sm font-medium'>{prev.title}</span>
          </span>
        </Link>
      ) : (
        <div className='hidden flex-1 sm:block' />
      )}
      {next ? (
        <Link
          to='/docs/$slug'
          params={{ slug: next.slug }}
          className='group flex max-w-[45%] flex-1 items-center justify-end gap-3 rounded-lg border p-4 text-right transition-colors hover:border-primary/50 hover:bg-muted/50'
        >
          <span className='min-w-0'>
            <span className='block text-xs text-muted-foreground'>下一页</span>
            <span className='block truncate text-sm font-medium'>{next.title}</span>
          </span>
          <ArrowRight className='h-4 w-4 shrink-0 text-muted-foreground group-hover:text-primary' />
        </Link>
      ) : (
        <div className='hidden flex-1 sm:block' />
      )}
    </div>
  )
}

// ---------- Base URL 卡片 ----------

function BaseUrlCard() {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)

  return (
    <div className='mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/40 px-4 py-3'>
      <div className='flex items-center gap-2 text-sm'>
        <KeyRound className='h-4 w-4 text-[#378ADD]' />
        <span className='text-muted-foreground'>{t('Base URL')}</span>
        <code className='rounded bg-background px-2 py-0.5 font-mono text-xs'>{BASE_URL}</code>
      </div>
      <Button
        variant='outline'
        size='sm'
        className='h-7 gap-1.5 text-xs'
        onClick={() => {
          navigator.clipboard
            ?.writeText(BASE_URL)
            .then(() => {
              setCopied(true)
              toast.success(t('已复制'))
              setTimeout(() => setCopied(false), 1500)
            })
            .catch(() => toast.error(t('复制失败')))
        }}
      >
        <Copy className='h-3.5 w-3.5' />
        {copied ? t('已复制') : t('复制')}
      </Button>
    </div>
  )
}

// ---------- 落地页 ----------

const LANDING_ICONS: Record<string, typeof Sparkles> = {
  quickstart: Sparkles,
  dev: BookOpen,
  clients: Gauge,
  appendix: AlertCircle,
}

export function DocsLanding() {
  const { t } = useTranslation()

  return (
    <PublicLayout showMainContainer={false}>
      <div className='mx-auto w-full max-w-5xl px-4 py-10 sm:px-6'>
        <div className='mb-10 text-center'>
          <h1 className='text-3xl font-semibold text-foreground sm:text-4xl'>
            {t('川邮·星语 API 文档')}
          </h1>
          <p className='mx-auto mt-3 max-w-2xl text-muted-foreground'>
            OpenAI 兼容接口 · 文本 / 视觉 / 语音 / 图像 / 向量 全模态。
            从下方卡片或顶部导航进入对应分册。
          </p>
          <div className='mt-4 flex flex-wrap justify-center gap-2'>
            <Badge>OpenAI Compatible</Badge>
            <Badge className='font-mono'>Base URL: {BASE_URL}</Badge>
            <Badge variant='outline'>{t('13 分册 · 全员可见')}</Badge>
          </div>
        </div>

        <BaseUrlCard />

        <div className='grid gap-4 sm:grid-cols-2'>
          {DOC_GROUPS.map((group) => {
            const Icon = LANDING_ICONS[group.key] ?? BookOpen
            const first = group.entries[0]

            if (!first) {
              return null
            }

            return (
              <Link
                key={group.key}
                to='/docs/$slug'
                params={{ slug: first.slug }}
                className='group rounded-xl border p-5 transition-colors hover:border-primary/50 hover:bg-muted/40'
              >
                <div className='flex items-center gap-2'>
                  <Icon className='h-4 w-4 text-[#378ADD]' />
                  <h2 className='text-base font-semibold'>{group.label}</h2>
                  <span className='text-xs text-muted-foreground'>
                    {group.entries.length} 册
                  </span>
                </div>
                <p className='mt-1 text-sm text-muted-foreground'>
                  {first.description}
                </p>
                <div className='mt-3 flex flex-wrap gap-1.5'>
                  {group.entries.map((entry) => (
                    <Badge
                      key={entry.slug}
                      variant='outline'
                      className='font-normal'
                    >
                      {entry.title}
                    </Badge>
                  ))}
                </div>
              </Link>
            )
          })}
        </div>
      </div>
    </PublicLayout>
  )
}

// ---------- 文档页 ----------

export function DocsPage({ slug }: { slug: string }) {
  const entry = DOC_MAP[slug]

  if (!entry) {
    return <DocsLanding />
  }

  return (
    <PublicLayout showMainContainer={false}>
      <div className='mx-auto flex w-full max-w-[1400px] gap-8 px-4 py-8 sm:px-6'>
        {/* 左侧目录 */}
        <aside className='sticky top-20 hidden h-[calc(100vh-6rem)] w-60 shrink-0 overflow-y-auto lg:block'>
          <SidebarNav activeSlug={slug} />
        </aside>

        {/* 右侧内容 */}
        <main className='min-w-0 flex-1'>
          <BaseUrlCard />
          <DocsMarkdown entry={entry} />
          <PrevNextNav slug={slug} />
        </main>
      </div>
    </PublicLayout>
  )
}
