/*
Copyright (C) 2026 川邮·星语 · AlloMax

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

const BRAND_NAME = '川邮·星语'
const SUBTAGLINE = '使用川邮星语 API 构建你的应用'

type AuthLayoutProps = {
  children: React.ReactNode
}

// 深色极简居中风格（参考 DeepSeek 官方登录页）：顶部 logo+文档，主体居中窄表单卡
export function AuthLayout({ children }: AuthLayoutProps) {
  const { t } = useTranslation()
  const { systemName, logo, loading } = useSystemConfig()

  return (
    <div className='dark relative grid min-h-svh w-full overflow-hidden bg-[#070D1F] text-foreground'>
      <CosmicBackground />

      {/* 顶部导航：左 logo，右文档（均小尺寸，贴近 DeepSeek） */}
      <header className='relative z-10 flex items-center justify-between px-6 py-5 sm:px-8'>
        <div className='flex items-center gap-2.5'>
          <div className='relative h-9 w-9'>
            {loading ? (
              <Skeleton className='absolute inset-0 rounded-lg' />
            ) : (
              <img
                src={logo}
                alt={BRAND_NAME}
                className='h-9 w-9 rounded-lg object-contain'
              />
            )}
          </div>
        </div>
        <Link
          to='/'
          className='inline-flex items-center rounded-lg border border-white/10 bg-white/5 px-3.5 py-1.5 text-sm text-foreground/85 transition-colors hover:border-[#378ADD]/50 hover:bg-white/10'
        >
          {t('API 开发文档')}
        </Link>
      </header>

      {/* 主体：居中窄表单卡（DeepSeek 极简布局） */}
      <main className='relative z-10 mx-auto flex w-full max-w-[420px] flex-1 flex-col justify-center px-4 py-8 sm:py-10'>
        {/* 品牌名 + 副标语（卡外上方，居中） */}
        <div className='mb-6 text-center'>
          <h1 className='text-2xl font-medium tracking-wide text-foreground'>
            {BRAND_NAME}
          </h1>
          <p className='mt-2 text-sm text-muted-foreground'>{SUBTAGLINE}</p>
        </div>

        {/* 精致表单卡 */}
        <div className='rounded-3xl border border-white/10 bg-[#111B33]/70 p-7 shadow-[0_8px_40px_rgba(0,0,0,0.35)] backdrop-blur-2xl sm:p-8'>
          {children}
        </div>
      </main>

      {/* 底部版权 */}
      <footer className='relative z-10 px-6 pb-5 sm:px-8'>
        <div className='flex flex-col items-center justify-between gap-1 text-xs text-muted-foreground/60 sm:flex-row'>
          <span>
            {BRAND_NAME} · {systemName}
          </span>
          <span>蜀ICP备xxx号</span>
        </div>
      </footer>
    </div>
  )
}
