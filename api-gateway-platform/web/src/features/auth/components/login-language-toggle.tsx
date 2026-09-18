/*
Copyright (C) 2026 川邮星语 · AlloMax

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { useTranslation } from 'react-i18next'

import { syncLanguageToPortal } from '@/lib/portal-language-bridge'
import { cn } from '@/lib/utils'

/**
 * 登录页的极简语言切换（中 / EN）。
 *
 * 为什么不用通用 <LanguageSwitcher>：它是下拉菜单，未登录场景要调用
 * `/api/user/self` 持久化（登录页没有 user），且视觉比登录页顶部导航的
 * 其它按钮重。这里只做中英二选一（Portal 也只支持这两种），与 Portal
 * 的 `.locale-toggle-item` 形态保持一致。
 */
export function LoginLanguageToggle({ className }: { className?: string }) {
  const { i18n } = useTranslation()
  const current = (i18n.resolvedLanguage ?? i18n.language ?? 'zhCN')
    .toLowerCase()
    .startsWith('zh')
    ? 'zh'
    : 'en'

  const options = [
    { code: 'zhCN', portal: 'zh', label: '中文' },
    { code: 'en', portal: 'en', label: 'EN' },
  ] as const

  return (
    <div
      className={cn(
        'inline-flex items-center rounded-md border border-white/15 bg-[#1B2A4E]/40 p-0.5 backdrop-blur-sm',
        className
      )}
      role='group'
      aria-label='Language'
    >
      {options.map((opt) => {
        const active = current === opt.portal
        return (
          <button
            key={opt.code}
            type='button'
            aria-pressed={active}
            onClick={async () => {
              if (active) return
              await i18n.changeLanguage(opt.code)
              // 同步给 Portal，保持两边语言一致
              syncLanguageToPortal(opt.code)
            }}
            className={cn(
              'rounded px-2.5 py-1.5 text-xs transition-colors',
              active
                ? 'bg-[#378ADD]/25 font-medium text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}