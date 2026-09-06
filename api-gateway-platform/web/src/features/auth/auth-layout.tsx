/*
Copyright (C) 2026 川邮星语 · AlloMax

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { Skeleton } from '@/components/ui/skeleton'
import { useSystemConfig } from '@/hooks/use-system-config'

import { CosmicBackground } from './components/cosmic-background'

const BRAND_NAME = '川邮星语'
const TAGLINE = '使用川邮星语 API 构建你的应用'
const SUBTAGLINE = '人类的梦想是星辰大海'

const HIGHLIGHTS = [
  '主流大语言模型全覆盖 · deepseek-v4-pro / qwen3.8 / glm-5.3',
  '多模态能力 · ASR / TTS / 视频生成 / 图片生成',
  '毫秒级推理 · H20 自营算力',
  '按量计费透明 · 余额实时可见',
]

type AuthLayoutProps = {
  children: React.ReactNode
}

export function AuthLayout({ children }: AuthLayoutProps) {
  const { t } = useTranslation()
  const { systemName, logo, loading } = useSystemConfig()

  return (
    <div className='dark relative grid min-h-svh w-full overflow-hidden bg-[#070D1F] text-foreground'>
      <CosmicBackground />

      {/* 顶部导航 */}
      <header className='relative z-10 flex items-center justify-between px-6 py-5 sm:px-10'>
        <div className='flex items-center gap-4'>
          <div className='relative h-36 w-36'>
            {loading ? (
              <Skeleton className='absolute inset-0 rounded-2xl' />
            ) : (
              <img
                src={logo}
                alt={BRAND_NAME}
                className='h-36 w-36 object-contain'
              />
            )}
          </div>
          <span className='text-3xl font-medium text-foreground'>{BRAND_NAME}</span>
        </div>
        <Link
          to='/'
          className='text-sm text-muted-foreground transition-colors hover:text-foreground'
        >
          {t('API 开发文档')}
        </Link>
      </header>

      {/* 主体：左右分栏 */}
      <main className='relative z-10 mx-auto flex w-full max-w-5xl flex-1 items-center px-6 py-8 sm:px-10'>
        <div className='grid w-full items-center gap-12 lg:grid-cols-[1.1fr_0.9fr]'>
          {/* 左：品牌 hero */}
          <div className='hidden lg:block'>
            <h2 className='text-3xl font-medium leading-tight tracking-tight text-foreground xl:text-4xl'>
              {TAGLINE}
            </h2>
            <p className='mt-3 text-base italic text-muted-foreground'>{SUBTAGLINE}</p>
            <ul className='mt-8 space-y-3'>
              {HIGHLIGHTS.map((item, i) => (
                <li key={i} className='flex items-center gap-2.5 text-sm text-foreground/90'>
                  <span
                    className='h-1.5 w-1.5 shrink-0 rounded-full'
                    style={{
                      background: ['#378ADD', '#7F77DD', '#EF9F27'][i % 3],
                    }}
                  />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          {/* 右：表单卡片（毛玻璃） */}
          <div className='mx-auto w-full max-w-[400px] rounded-2xl border border-white/10 bg-[#1B2A4E]/55 p-6 shadow-[0_0_24px_rgba(55,138,221,0.18)] backdrop-blur-xl sm:p-8'>
            {children}
          </div>
        </div>
      </main>

      {/* 底部版权 */}
      <footer className='relative z-10 px-6 pb-5 sm:px-10'>
        <div className='flex flex-col items-center justify-between gap-1 text-xs text-muted-foreground/70 sm:flex-row'>
          <span>
            {BRAND_NAME} · {systemName}
          </span>
          <span>蜀ICP备xxx号</span>
        </div>
      </footer>
    </div>
  )
}
