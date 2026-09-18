/*
Copyright (C) 2026 川邮星语 · AlloMax

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { useEffect, useRef } from 'react'

import { cn } from '@/lib/utils'

// 深空星空背景：与 Portal 主页（xingyu-chat/portal/index.html）完全同源
//  - 底色 #0e1538
//  - 三团星云光晕（紫/蓝/靛）
//  - canvas 星空：星点正弦闪烁 + 流星划过（左下方向、渐隐拖尾）
//  - prefers-reduced-motion 时退化为静态星场
// 纯装饰层，pointer-events 不拦截交互。

const STAR_DENSITY = 1 / 4200 // 每屏星数/像素
const MAX_METEORS = 3

type Star = {
  x: number
  y: number
  r: number
  p: number
  s: number
  a: number
}

type Meteor = {
  x: number
  y: number
  len: number
  speed: number
  angle: number
  life: number
}

export function CosmicBackground({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const cv = canvasRef.current
    if (!cv) return
    const ctx = cv.getContext('2d')
    if (!ctx) return

    let W = 0
    let H = 0
    let dpr = 1
    let stars: Star[] = []
    const meteors: Meteor[] = []
    let rafId = 0
    let running = true

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      W = window.innerWidth
      H = window.innerHeight
      cv!.width = W * dpr
      cv!.height = H * dpr
      cv!.style.width = W + 'px'
      cv!.style.height = H + 'px'
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0)
      // 重建星场
      stars = []
      const n = Math.floor(W * H * STAR_DENSITY)
      for (let i = 0; i < n; i++) {
        stars.push({
          x: Math.random() * W,
          y: Math.random() * H,
          r: Math.random() * 1.1 + 0.3,
          p: Math.random() * Math.PI * 2, // 相位
          s: 0.4 + Math.random() * 1.2, // 闪烁速度
          a: 0.25 + Math.random() * 0.65, // 基础亮度
        })
      }
    }

    function spawnMeteor() {
      // 从上方随机点出发，向左下方划过（流星经典轨迹）
      meteors.push({
        x: W * (0.25 + Math.random() * 0.75),
        y: -20 - Math.random() * H * 0.15,
        len: 130 + Math.random() * 160, // 拖尾长
        speed: 5 + Math.random() * 4,
        angle: Math.PI * (0.72 + Math.random() * 0.1), // 约 130°~148°，左下方向
        life: 1, // 1→0 渐隐
      })
    }

    function drawStars(staticMode: boolean, ts: number) {
      for (let i = 0; i < stars.length; i++) {
        const st = stars[i]
        const tw = staticMode
          ? st.a
          : st.a * (0.55 + 0.45 * Math.sin(ts * 0.001 * st.s + st.p))
        ctx!.globalAlpha = Math.max(0.05, tw)
        ctx!.fillStyle = '#dfe6ff'
        ctx!.beginPath()
        ctx!.arc(st.x, st.y, st.r, 0, Math.PI * 2)
        ctx!.fill()
      }
    }

    function tick(ts: number) {
      if (!running) return
      ctx!.clearRect(0, 0, W, H)
      drawStars(false, ts)

      // 流星：渐隐拖尾（头部亮白，尾部透明蓝）
      for (let j = meteors.length - 1; j >= 0; j--) {
        const m = meteors[j]
        const dx = Math.cos(m.angle)
        const dy = Math.sin(m.angle)
        const tailX = m.x - dx * m.len
        const tailY = m.y - dy * m.len
        const grad = ctx!.createLinearGradient(m.x, m.y, tailX, tailY)
        grad.addColorStop(0, 'rgba(255,255,255,' + 0.9 * m.life + ')')
        grad.addColorStop(0.25, 'rgba(190,205,255,' + 0.55 * m.life + ')')
        grad.addColorStop(1, 'rgba(120,140,255,0)')
        ctx!.globalAlpha = 1
        ctx!.strokeStyle = grad
        ctx!.lineWidth = 1.6
        ctx!.lineCap = 'round'
        ctx!.beginPath()
        ctx!.moveTo(m.x, m.y)
        ctx!.lineTo(tailX, tailY)
        ctx!.stroke()
        // 头部亮点
        ctx!.globalAlpha = 0.9 * m.life
        ctx!.fillStyle = '#fff'
        ctx!.beginPath()
        ctx!.arc(m.x, m.y, 1.6, 0, Math.PI * 2)
        ctx!.fill()

        // 前进 + 生命衰减
        m.x += dx * m.speed
        m.y += dy * m.speed
        m.life -= 0.008
        if (m.life <= 0 || m.y > H + 60 || m.x < -m.len) {
          meteors.splice(j, 1)
        }
      }

      // 随机生成新流星（平均 1.2~2.5s 一颗，最多同时 3 颗）
      if (meteors.length < MAX_METEORS && Math.random() < 0.012) {
        spawnMeteor()
      }

      ctx!.globalAlpha = 1
      rafId = window.requestAnimationFrame(tick)
    }

    resize()

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')
    if (reduced.matches) {
      // 晕动症用户：不跑动画，只铺一层静态星
      ctx.clearRect(0, 0, W, H)
      drawStars(true, 0)
      running = false
    } else {
      rafId = window.requestAnimationFrame(tick)
    }

    // 切后台暂停动画（省电）
    function onVisibility() {
      if (document.hidden) {
        running = false
        window.cancelAnimationFrame(rafId)
      } else if (!reduced.matches) {
        running = true
        rafId = window.requestAnimationFrame(tick)
      }
    }
    document.addEventListener('visibilitychange', onVisibility)

    let resizeTimer: number | undefined
    function onResize() {
      window.clearTimeout(resizeTimer)
      resizeTimer = window.setTimeout(resize, 150) // 防抖：拖拽窗口时不连续重建星场
    }
    window.addEventListener('resize', onResize)

    return () => {
      running = false
      window.cancelAnimationFrame(rafId)
      window.clearTimeout(resizeTimer)
      window.removeEventListener('resize', onResize)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  return (
    <div
      className={cn(
        'pointer-events-none absolute inset-0 overflow-hidden',
        className
      )}
      aria-hidden
    >
      {/* 深空底色（与 Portal 一致：#0e1538） */}
      <div className='absolute inset-0' style={{ background: '#0e1538' }} />
      {/* 深空星云光晕：紫 + 蓝 + 靛 三团微光（复刻 Portal body::before） */}
      <div
        className='absolute inset-0'
        style={{
          background:
            'radial-gradient(38% 45% at 22% 30%, rgba(109,91,255,0.20) 0%, rgba(109,91,255,0) 100%),' +
            'radial-gradient(42% 48% at 78% 20%, rgba(65,118,230,0.18) 0%, rgba(65,118,230,0) 100%),' +
            'radial-gradient(30% 40% at 55% 85%, rgba(90,120,255,0.12) 0%, rgba(90,120,255,0) 100%)',
        }}
      />
      {/* 星空画布：星点闪烁 + 流星划过 */}
      <canvas ref={canvasRef} className='absolute inset-0 block' />
    </div>
  )
}