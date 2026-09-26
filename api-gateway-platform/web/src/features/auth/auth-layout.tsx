/*
Copyright (C) 2026 川邮星语 · AlloMax

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { ChevronLeft } from 'lucide-react'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'

import { Skeleton } from '@/components/ui/skeleton'
import { useSystemConfig } from '@/hooks/use-system-config'
import { buildLanguageAwareUrl } from '@/lib/portal-language-bridge'
import {
  isPortalCapableHost,
  requestPortalExit,
  resolvePortalHomeUrl,
} from '@/lib/sign-out-exit'

import { CosmicBackground } from './components/cosmic-background'
import { LoginLanguageToggle } from './components/login-language-toggle'

// #191：品牌文案改走 i18n（en 态显示英文），中文仍为 key 原文
const BRAND_NAME = '川邮·星语'
const TAGLINE_KEY = '使用川邮·星语 API 构建你的应用'
const SUBTAGLINE_KEY = '人类的梦想是星辰大海'
const HIGHLIGHT_KEYS = [
  '主流大模型全覆盖 · DeepSeek-V4.1 / Qwen3.8 / GLM-5.3',
  '多模态能力 · 语音识别 / 语音合成 / 图像生成 / 视频生成',
  '自营智算 25.7 PFLOPS · 7.5TB 显存 · 数据不出校',
  '注册即送 ¥10 · 按量计费 · 余额实时可见',
]

type AuthLayoutProps = {
  children: React.ReactNode
}

export function AuthLayout({ children }: AuthLayoutProps) {
  const { t, i18n } = useTranslation()
  const { logo, loading } = useSystemConfig()
  // 川邮·星语：登录页是否提供「返回主页」（回 Portal）入口
  const canReturnToPortal = isPortalCapableHost()
  // 川邮·星语：回 Portal 时带上当前语言，使 Portal 与登录页语言一致
  const portalHomeUrl = buildLanguageAwareUrl(
    resolvePortalHomeUrl(),
    i18n.resolvedLanguage ?? i18n.language
  )

  // 登录页背景是深空星空（深色画布），强制给本页挂 dark 主题类，
  // 保证浅色默认设置下登录页的表单/文字仍是深空配色（离开页面时还原）。
  useEffect(() => {
    const root = document.documentElement
    const hadDark = root.classList.contains('dark')
    const hadLight = root.classList.contains('light')
    root.classList.remove('light')
    root.classList.add('dark')
    return () => {
      root.classList.remove('dark')
      if (hadLight) root.classList.add('light')
      if (hadDark) root.classList.add('dark')
    }
  }, [])

  return (
    <div className='dark relative grid min-h-svh w-full overflow-hidden bg-[#0e1538] text-foreground'>
      <CosmicBackground />

      {/* 顶部导航：校徽在左，API 文档按钮在右 */}
      <header className='relative z-10 flex items-center justify-between px-6 py-5 sm:px-10'>
        {/* 川邮·星语：logo 尺寸对齐 Portal（.brand .logo 规则）——
            桌面 height:114px / 移动 72px，width:auto 保持 233x159 原始宽高比 */}
        <div className='relative flex h-[72px] w-auto flex-none sm:h-[114px] sm:w-auto'>
          {loading ? (
            <Skeleton className='absolute inset-0 rounded-2xl' />
          ) : (
            <img
              src={logo}
              alt={BRAND_NAME}
              className='h-[72px] w-auto max-w-none object-contain sm:h-[114px] sm:w-auto'
              style={{ filter: 'drop-shadow(0 0 14px rgba(140,160,255,0.5))' }}
            />
          )}
        </div>
        {/* 右侧：返回主页（回 Portal）+ 语言切换 */}
        {/* 川邮·星语：语言切换放在返回主页右边，API 开发文档入口已移除（用户 #200） */}
        <div className='flex items-center gap-2.5'>
          {canReturnToPortal && (
            <a
              href={portalHomeUrl}
              onClick={() => requestPortalExit()}
              className='inline-flex items-center gap-1.5 rounded-md border border-white/15 bg-[#1B2A4E]/40 px-4 py-2 text-sm text-foreground/90 shadow-sm backdrop-blur-sm transition-colors hover:border-[#378ADD]/70 hover:bg-[#1B2A4E]/70'
            >
              <ChevronLeft className='size-4' />
              {t('返回主页')}
            </a>
          )}
          {/* 川邮·星语：登录页语言切换（中/英），与 Portal 语言联动 */}
          <LoginLanguageToggle />
        </div>
      </header>

      {/* 主体：左 hero 右登录卡片 */}
      <main className='relative z-10 mx-auto flex w-full max-w-6xl flex-1 items-center px-4 py-6 sm:px-6 sm:py-10 lg:pl-9'>
        <div className='grid w-full items-center gap-8 lg:grid-cols-[minmax(0,1fr)_440px]'>
          {/* 左：品牌 hero（文字从校徽左侧垂直下方开始，即靠最左对齐） */}
          <div className='hidden lg:block'>
            <h2 className='max-w-md text-3xl font-medium leading-tight tracking-tight text-foreground xl:text-4xl'>
              {t(TAGLINE_KEY)}
            </h2>
            <p className='mt-3 max-w-md text-base italic text-muted-foreground'>{t(SUBTAGLINE_KEY)}</p>
            <ul className='mt-8 max-w-md space-y-3'>
              {HIGHLIGHT_KEYS.map((item, i) => (
                <li key={i} className='flex items-center gap-2.5 text-sm text-foreground/90'>
                  <span
                    className='h-1.5 w-1.5 shrink-0 rounded-full'
                    style={{
                      background: ['#378ADD', '#7F77DD', '#EF9F27'][i % 3],
                    }}
                  />
                  {t(item)}
                </li>
              ))}
            </ul>
          </div>

          {/* 右：登录卡片（精致 440px） */}
          <div className='mx-auto w-full max-w-[440px]'>
            <div className='rounded-3xl border border-white/10 bg-[#1B2A4E]/55 p-6 shadow-[0_0_28px_rgba(55,138,221,0.2)] backdrop-blur-xl sm:p-7'>
              {children}
            </div>
          </div>
        </div>
      </main>

      {/* 底部版权 */}
      <footer className='relative z-10 px-6 pb-5 sm:px-10'>
        <div className='flex flex-col items-center justify-between gap-1 text-xs text-muted-foreground/70 sm:flex-row'>
          {/* #12：品牌名走 i18n，en 态显示 StarWhisper（对齐 Portal） */}
          <span>{t(BRAND_NAME)}</span>
          <span>{t('四川邮电职业技术学院 版权所有')}</span>
        </div>
      </footer>
    </div>
  )
}