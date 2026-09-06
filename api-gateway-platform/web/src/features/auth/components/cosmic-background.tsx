/*
Copyright (C) 2026 川邮星语 · AlloMax

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { cn } from '@/lib/utils'

// 星辰大海主题背景：深空底 + 星点 + 银河光晕 + 探索者剪影
// 纯装饰层，pointer-events 不拦截交互。

const STARS: Array<{ top: string; left: string; size: number; opacity: number; twinkle?: boolean }> = [
  { top: '6%', left: '5%', size: 2, opacity: 0.9, twinkle: true },
  { top: '12%', left: '18%', size: 1.5, opacity: 0.7 },
  { top: '8%', left: '32%', size: 1, opacity: 0.6 },
  { top: '18%', left: '46%', size: 2, opacity: 0.85, twinkle: true },
  { top: '10%', left: '63%', size: 1, opacity: 0.5 },
  { top: '15%', left: '80%', size: 1.5, opacity: 0.75 },
  { top: '7%', left: '91%', size: 2, opacity: 0.9 },
  { top: '30%', left: '8%', size: 1, opacity: 0.55 },
  { top: '42%', left: '24%', size: 1, opacity: 0.6 },
  { top: '36%', left: '70%', size: 1.5, opacity: 0.7 },
  { top: '50%', left: '88%', size: 1, opacity: 0.5 },
  { top: '58%', left: '14%', size: 1, opacity: 0.55 },
  { top: '70%', left: '34%', size: 1.5, opacity: 0.7 },
  { top: '66%', left: '56%', size: 1, opacity: 0.45 },
  { top: '80%', left: '78%', size: 1, opacity: 0.5 },
  { top: '22%', left: '55%', size: 1, opacity: 0.6, twinkle: true },
  { top: '48%', left: '40%', size: 1, opacity: 0.5 },
  { top: '88%', left: '20%', size: 1.5, opacity: 0.6 },
  { top: '92%', left: '60%', size: 1, opacity: 0.5 },
  { top: '76%', left: '92%', size: 2, opacity: 0.8, twinkle: true },
  { top: '26%', left: '92%', size: 1, opacity: 0.5 },
  { top: '62%', left: '6%', size: 1, opacity: 0.5 },
  { top: '16%', left: '12%', size: 1, opacity: 0.5 },
  { top: '40%', left: '90%', size: 1, opacity: 0.55 },
]

export function CosmicBackground({ className }: { className?: string }) {
  return (
    <div className={cn('pointer-events-none absolute inset-0 overflow-hidden', className)} aria-hidden>
      {/* 深空底色 */}
      <div
        className='absolute inset-0'
        style={{ background: '#070D1F' }}
      />
      {/* 银河光晕：左上蓝紫、右下暖金 */}
      <div
        className='absolute inset-0'
        style={{
          background:
            'radial-gradient(ellipse 60% 80% at 18% 6%, rgba(83,74,183,0.26) 0%, rgba(83,74,183,0.06) 42%, transparent 66%),' +
            'radial-gradient(ellipse 70% 55% at 90% 100%, rgba(239,159,39,0.20) 0%, rgba(239,159,39,0.05) 38%, transparent 62%)',
        }}
      />
      {/* 星点 */}
      {STARS.map((s, i) => (
        <span
          key={i}
          className={cn('absolute rounded-full bg-white', s.twinkle && 'animate-pulse')}
          style={{
            top: s.top,
            left: s.left,
            width: s.size,
            height: s.size,
            opacity: s.opacity,
            boxShadow: s.size >= 2 ? '0 0 4px rgba(255,255,255,0.9)' : undefined,
          }}
        />
      ))}
      {/* 探索者剪影（右下，山丘 + 仰望的人） */}
      <svg
        viewBox='0 0 220 90'
        className='absolute bottom-0 right-0 h-28 w-64 opacity-50'
        style={{ right: '-1rem' }}
        fill='none'
      >
        <path d='M0,90 Q50,72 90,56 Q140,40 220,30 L220,90 Z' fill='#0A1126' />
        <circle cx='150' cy='36' r='5' fill='#0A1126' />
        <path d='M150,42 L150,60 Q150,64 146,68 M150,48 Q158,52 158,58' stroke='#0A1126' strokeWidth='3' strokeLinecap='round' />
      </svg>
    </div>
  )
}
