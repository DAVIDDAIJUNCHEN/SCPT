/*
Copyright (C) 2026 川邮星语 · AlloMax

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { Loader2, RefreshCw, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  getCaptchaChallenge,
  sendPhoneCode,
  type CaptchaChallengeResponse,
} from '@/features/auth/api'
import { getServerErrorMessageKey } from '@/lib/server-error-message'

// 后端 SVG 的 viewBox / 设计尺寸（需与 common/captcha.go 的 captchaCanvasSize 一致）
const CANVAS = 260

// 判断是否为后端限流（HTTP 429）
function isRateLimited(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false
  const response = (value as { response?: { status?: number } }).response
  return response?.status === 429
}

interface CaptchaDialogProps {
  /** 打开状态（由父组件控制） */
  open: boolean
  /** 要发送验证码的手机号 */
  phone: string
  /** 关闭弹窗 */
  onOpenChange: (open: boolean) => void
  /** 验证通过且短信已发出的回调 */
  onVerified: (devCode?: string) => void
}

/**
 * 自研"几何图形+颜色"人机校验弹窗（对标 DeepSeek）。
 * 点击"发送验证码"后弹出，渲染后端下发的 SVG，
 * 用户点击符合题目（颜色+形状）的目标图形后，后端校验命中才真正发码。
 */
export function CaptchaDialog({
  open,
  phone,
  onOpenChange,
  onVerified,
}: CaptchaDialogProps) {
  const { t } = useTranslation()
  const svgRef = useRef<HTMLDivElement>(null)
  // 防重入锁：防止"换一张/点错重试"连点触发并发请求，撞上后端限流刷不出图
  const loadingRef = useRef(false)

  const [challenge, setChallenge] = useState<CaptchaChallengeResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [pendingClick, setPendingClick] = useState(false)

  const loadChallenge = useCallback(async () => {
    // 防重入：已在加载中则忽略本次调用（换一张/错误重试连点不会并发撞限流）
    if (loadingRef.current) return
    loadingRef.current = true
    setLoading(true)
    setChallenge(null)
    setPendingClick(false)
    try {
      const res = await getCaptchaChallenge()
      if (res.success && res.challenge_id) {
        setChallenge(res)
      } else {
        // 后端限流/异常：明确提示，避免无反馈
        toast.error(t('人机校验加载失败，请稍后重试'))
      }
    } catch (error) {
      if (getServerErrorMessageKey(error)) return
      // 识别 429 限流：给出友好提示，避免"加载失败"干瞪眼刷不出图
      if (isRateLimited(error)) {
        toast.error(t('操作太频繁，请稍后再试'))
        return
      }
      toast.error(t('人机校验加载失败，请稍后重试'))
    } finally {
      loadingRef.current = false
      setLoading(false)
    }
  }, [t])

  // 每次打开时加载新挑战
  useEffect(() => {
    if (open) loadChallenge()
  }, [open, loadChallenge])

  // 换算：把容器内点击的屏幕坐标映射到 SVG viewBox 坐标
  function computeCoords(ev: React.MouseEvent<HTMLDivElement>) {
    const el = svgRef.current
    if (!el) return { x: 0, y: 0 }
    const rect = el.getBoundingClientRect()
    const scaleX = CANVAS / rect.width
    const scaleY = CANVAS / rect.height
    return {
      x: Math.round((ev.clientX - rect.left) * scaleX),
      y: Math.round((ev.clientY - rect.top) * scaleY),
    }
  }

  async function handleCanvasClick(ev: React.MouseEvent<HTMLDivElement>) {
    if (!challenge || loading || sending || pendingClick) return
    const { x, y } = computeCoords(ev)
    setPendingClick(true)
    setSending(true)
    try {
      const res = await sendPhoneCode(phone, { id: challenge.challenge_id, x, y })
      if (res.success) {
        onOpenChange(false)
        onVerified(res.dev_code)
      } else {
        if (res.need_captcha) {
          toast.error(res.message || t('人机验证未通过，请重试'))
          // 换一张新题再试
          loadChallenge()
        } else {
          if (!getServerErrorMessageKey(res)) {
            toast.error(res.message || t('验证码发送失败，请稍后重试'))
          }
          onOpenChange(false)
        }
      }
    } catch (error) {
      if (getServerErrorMessageKey(error)) return
      toast.error(t('验证码发送失败，请稍后重试'))
      loadChallenge()
    } finally {
      setSending(false)
      setPendingClick(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-md'>
        <DialogHeader>
          <DialogTitle>{t('请完成人机验证')}</DialogTitle>
          <DialogDescription>
            {loading
              ? t('正在加载验证…')
              : challenge
                ? challenge.prompt_cn
                : t('点击下方图形中符合提示的图形')}
          </DialogDescription>
        </DialogHeader>

        <div className='flex items-center justify-center'>
          {loading ? (
            <div className='flex h-[260px] w-[260px] items-center justify-center'>
              <Loader2 className='h-8 w-8 animate-spin text-[#378ADD]' />
            </div>
          ) : challenge ? (
            <div
              ref={svgRef}
              onClick={handleCanvasClick}
              className='cursor-pointer overflow-hidden rounded-lg border border-[#378ADD]/30 transition-transform hover:scale-[1.01] active:scale-[0.99]'
              style={{ width: 260, height: 260 }}
              title={t('点击符合提示的图形')}
              // 当前处理中不可再点
              {...(sending || pendingClick
                ? { 'aria-disabled': true }
                : {})}
            >
              {/* 后端生成的静态 SVG（无脚本），用户点击坐标由后端判定 */}
              <div dangerouslySetInnerHTML={{ __html: challenge.svg }} />
            </div>
          ) : null}
        </div>

        {sending || pendingClick ? (
          <p className='flex items-center justify-center gap-2 text-xs text-[#378ADD]'>
            <Loader2 className='h-3.5 w-3.5 animate-spin' />
            {t('正在发送验证码…')}
          </p>
        ) : null}

        <DialogFooter className='justify-between sm:justify-between'>
          <Button
            type='button'
            variant='ghost'
            disabled={loading || sending}
            onClick={loadChallenge}
            className='gap-1.5 border border-white/15 text-foreground'
          >
            <RefreshCw className='h-4 w-4' />
            {t('换一张')}
          </Button>
          <Button
            type='button'
            variant='ghost'
            disabled={sending}
            onClick={() => onOpenChange(false)}
            className='gap-1.5 border border-white/15 text-foreground'
          >
            <X className='h-4 w-4' />
            {t('取消')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
