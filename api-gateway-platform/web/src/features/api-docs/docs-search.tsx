/*
Copyright (C) 2023-2026 QuantumNous
Copyright (C) 2026 川邮·星语 · AlloMax（二次开发：/docs 全文搜索 UI）

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { Search, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { Input } from '@/components/ui/input'

import { getDocFlatListByLang, toDocLang } from './content/registry'
import { searchDocs, type SearchHit } from './search'

/** 摘要高亮：按 [matchStart, matchStart+matchLength) 加 mark */
function Highlight({ hit }: { hit: SearchHit }) {
  const { snippet, matchStart, matchLength } = hit
  const start = Math.max(0, Math.min(matchStart, snippet.length))
  const end = Math.max(start, Math.min(start + matchLength, snippet.length))
  return (
    <>
      {snippet.slice(0, start)}
      <mark className='rounded bg-primary/20 px-0.5 text-foreground'>{snippet.slice(start, end)}</mark>
      {snippet.slice(end)}
    </>
  )
}

/**
 * 文档全文搜索框：输入即时检索（150ms 防抖），
 * 结果下拉支持 ↑/↓ 选择、Enter 跳转、Esc 关闭，点击外部自动收起。
 */
export function DocsSearchBox({ autoFocus = false }: { autoFocus?: boolean }) {
  const { t, i18n } = useTranslation()
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()
  const lang = toDocLang(i18n.language)
  const entries = useMemo(() => getDocFlatListByLang(lang), [lang])

  // 防抖
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 150)
    return () => clearTimeout(timer)
  }, [query])

  const hits = useMemo(
    () => (debouncedQuery.trim() ? searchDocs(debouncedQuery, entries, lang) : []),
    [debouncedQuery, entries, lang]
  )

  const close = useCallback(() => {
    setOpen(false)
    setActiveIndex(0)
  }, [])

  // 输入变化时重置选中项
  useEffect(() => {
    setActiveIndex(0)
  }, [debouncedQuery])

  // 点击外部收起
  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        close()
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [close])

  // 全局 ⌘K / Ctrl+K 聚焦（多实例时只有可见的会命中焦点）
  useEffect(() => {
    const onKeydown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        const target = event.target as HTMLElement
        if (target.closest('input, textarea, [contenteditable]')) {
          return
        }
        event.preventDefault()
        inputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKeydown)
    return () => window.removeEventListener('keydown', onKeydown)
  }, [])

  const go = useCallback(
    (hit: SearchHit) => {
      close()
      setQuery('')
      navigate({ to: '/docs/$slug', params: { slug: hit.slug }, hash: hit.sectionAnchor })
    },
    [close, navigate]
  )

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      if (open) {
        event.preventDefault()
        close()
      }
      return
    }
    if (!open || hits.length === 0) {
      return
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex((i) => (i + 1) % hits.length)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((i) => (i - 1 + hits.length) % hits.length)
    } else if (event.key === 'Enter') {
      event.preventDefault()
      const hit = hits[activeIndex]
      if (hit) {
        go(hit)
      }
    }
  }

  return (
    <div ref={rootRef} className='relative'>
      <div className='relative'>
        <Search className='pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground' />
        <Input
          ref={inputRef}
          autoFocus={autoFocus}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder={t('搜索文档…（⌘K）')}
          className='h-9 pl-8 pr-8 text-sm'
          aria-label={t('搜索文档')}
        />
        {query && (
          <button
            type='button'
            aria-label={t('清空')}
            className='absolute right-2 top-1/2 -translate-y-1/2 rounded-sm text-muted-foreground hover:text-foreground'
            onClick={() => {
              setQuery('')
              inputRef.current?.focus()
            }}
          >
            <X className='h-3.5 w-3.5' />
          </button>
        )}
      </div>

      {open && debouncedQuery.trim() && (
        <div className='absolute left-0 right-0 z-50 mt-1.5 overflow-hidden rounded-lg border bg-popover shadow-lg'>
          {hits.length === 0 ? (
            <div className='px-3 py-6 text-center text-sm text-muted-foreground'>
              {t('没有找到相关内容')}
            </div>
          ) : (
            <ul className='max-h-[60vh] overflow-y-auto py-1' role='listbox'>
              {hits.map((hit, i) => (
                <li key={`${hit.slug}-${hit.sectionAnchor}-${i}`} role='option' aria-selected={i === activeIndex}>
                  <button
                    type='button'
                    className={`block w-full px-3 py-2 text-left text-sm transition-colors ${
                      i === activeIndex ? 'bg-primary/10' : 'hover:bg-muted/60'
                    }`}
                    onMouseEnter={() => setActiveIndex(i)}
                    onClick={() => go(hit)}
                  >
                    <span className='flex items-baseline gap-2'>
                      <span className='shrink-0 font-medium text-foreground'>
                        {hit.sectionTitle}
                      </span>
                      <span className='truncate text-xs text-muted-foreground'>
                        {hit.docTitle}
                      </span>
                    </span>
                    {hit.matchLength > 0 && (
                      <span className='mt-0.5 block truncate text-xs text-muted-foreground'>
                        <Highlight hit={hit} />
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
