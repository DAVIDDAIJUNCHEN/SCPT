/*
Copyright (C) 2026 川邮星语 · AlloMax

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { Loader2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  sendPhoneCode,
  phoneLogin,
  phonePasswordLogin,
  setPhonePassword,
  login,
} from '@/features/auth/api'
import { useAuthRedirect } from '@/features/auth/hooks/use-auth-redirect'
import { isAuthBundle } from '@/lib/api'
import { getServerErrorMessageKey } from '@/lib/server-error-message'

const CN_PHONE = /^1[3-9][0-9]{9}$/

type Mode = 'sms' | 'password' | 'account'

export function PhoneAuthForm({
  redirectTo,
  variant = 'sign-in',
}: {
  redirectTo?: string
  variant?: 'sign-in' | 'sign-up'
}) {
  const { t } = useTranslation()
  const { handleLoginSuccess } = useAuthRedirect()

  const isSignUp = variant === 'sign-up'

  const [mode, setMode] = useState<Mode>('sms')
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  // 账号登录（admin 用用户名+密码）
  const [accountName, setAccountName] = useState('')
  const [accountPwd, setAccountPwd] = useState('')
  const [countdown, setCountdown] = useState(0)
  const [agreed, setAgreed] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // 忘记密码（重置密码）状态
  const [forgot, setForgot] = useState(false)
  const [forgotPhone, setForgotPhone] = useState('')
  const [forgotCode, setForgotCode] = useState('')
  const [forgotNewPwd, setForgotNewPwd] = useState('')
  const [forgotCountdown, setForgotCountdown] = useState(0)
  const [forgotSending, setForgotSending] = useState(false)
  const [resetting, setResetting] = useState(false)

  const phoneValid = CN_PHONE.test(phone)

  useEffect(() => {
    if (countdown <= 0) return
    const timer = setInterval(() => setCountdown((c) => c - 1), 1000)
    return () => clearInterval(timer)
  }, [countdown])

  useEffect(() => {
    if (forgotCountdown <= 0) return
    const timer = setInterval(() => setForgotCountdown((c) => c - 1), 1000)
    return () => clearInterval(timer)
  }, [forgotCountdown])

  async function sendForgotCode() {
    if (!CN_PHONE.test(forgotPhone)) {
      toast.error(t('请输入正确的手机号'))
      return
    }
    setForgotSending(true)
    try {
      const res = await sendPhoneCode(forgotPhone)
      if (res.success) {
        setForgotCountdown(60)
        toast.success(t('验证码已发送'))
        if (res.dev_code) toast.info(`${t('测试验证码')}: ${res.dev_code}`)
      } else {
        if (getServerErrorMessageKey(res)) return
        toast.error(res.message || t('验证码发送失败，请稍后重试'))
      }
    } catch (error) {
      if (getServerErrorMessageKey(error)) return
      toast.error(t('验证码发送失败，请稍后重试'))
    } finally {
      setForgotSending(false)
    }
  }

  async function handleResetPassword() {
    if (!CN_PHONE.test(forgotPhone)) {
      toast.error(t('请输入正确的手机号'))
      return
    }
    if (forgotCode.trim().length < 4) {
      toast.error(t('请输入验证码'))
      return
    }
    if (forgotNewPwd.length < 8) {
      toast.error(t('密码至少 8 位'))
      return
    }
    setResetting(true)
    try {
      const res = await setPhonePassword(forgotPhone, forgotCode, forgotNewPwd, true)
      if (res.success) {
        toast.success(t('密码重置成功，请使用新密码登录'))
        setForgot(false)
        setMode('password')
        setPassword('')
        setPhone(forgotPhone)
      } else {
        if (getServerErrorMessageKey(res)) return
        toast.error(res.message || t('重置失败'))
      }
    } catch (error) {
      if (getServerErrorMessageKey(error)) return
      toast.error(t('重置失败'))
    } finally {
      setResetting(false)
    }
  }

  async function handleSendCode() {
    if (!phoneValid) {
      toast.error(t('请输入正确的手机号'))
      return
    }
    setIsSending(true)
    try {
      const res = await sendPhoneCode(phone)
      if (res.success) {
        setCountdown(60)
        toast.success(t('验证码已发送'))
        if (res.dev_code) {
          toast.info(`${t('测试验证码')}: ${res.dev_code}`)
        }
      } else {
        if (getServerErrorMessageKey(res)) return
        toast.error(res.message || t('验证码发送失败，请稍后重试'))
      }
    } catch (error) {
      if (getServerErrorMessageKey(error)) return
      toast.error(t('验证码发送失败，请稍后重试'))
    } finally {
      setIsSending(false)
    }
  }

  async function handleSmsLogin() {
    if (!agreed) {
      toast.error(t('请先阅读并同意平台协议与隐私政策'))
      return
    }
    if (!phoneValid) {
      toast.error(t('请输入正确的手机号'))
      return
    }
    if (code.trim().length < 4) {
      toast.error(t('请输入验证码'))
      return
    }
    setIsSubmitting(true)
    try {
      const res = await phoneLogin(phone, code)
      if (res.success && isAuthBundle(res.data)) {
        await handleLoginSuccess(res.data, redirectTo)
        toast.success(t('欢迎回来！'))
      } else {
        if (getServerErrorMessageKey(res)) return
        toast.error(res.message || t('登录失败'))
      }
    } catch (error) {
      if (getServerErrorMessageKey(error)) return
      toast.error(t('登录失败'))
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handlePasswordLogin() {
    if (!agreed) {
      toast.error(t('请先阅读并同意平台协议与隐私政策'))
      return
    }
    if (!phoneValid) {
      toast.error(t('请输入正确的手机号'))
      return
    }
    if (!password) {
      toast.error(t('请输入密码'))
      return
    }
    setIsSubmitting(true)
    try {
      const res = await phonePasswordLogin(phone, password)
      if (res.success && isAuthBundle(res.data)) {
        await handleLoginSuccess(res.data, redirectTo)
        toast.success(t('欢迎回来！'))
      } else {
        if (getServerErrorMessageKey(res)) return
        toast.error(res.message || t('登录失败'))
      }
    } catch (error) {
      if (getServerErrorMessageKey(error)) return
      toast.error(t('登录失败'))
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleAccountLogin() {
    if (!agreed) {
      toast.error(t('请先阅读并同意平台协议与隐私政策'))
      return
    }
    if (!accountName || !accountPwd) {
      toast.error(t('请输入用户名和密码'))
      return
    }
    setIsSubmitting(true)
    try {
      const res = await login({
        username: accountName,
        password: accountPwd,
        passwordEncryptionEnabled: false,
      })
      if (res.success && isAuthBundle(res.data)) {
        await handleLoginSuccess(res.data, redirectTo)
        toast.success(t('欢迎回来！'))
      } else {
        if (getServerErrorMessageKey(res)) return
        toast.error(res.message || t('登录失败'))
      }
    } catch (error) {
      if (getServerErrorMessageKey(error)) return
      toast.error(t('登录失败'))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className='space-y-5'>
      {/* tab 切换 */}
      <div className='flex border-b border-white/10'>
        <button
          type='button'
          onClick={() => setMode('sms')}
          className={`flex-1 pb-2.5 text-sm transition-colors ${
            mode === 'sms'
              ? 'border-b-2 border-[#378ADD] font-medium text-foreground'
              : 'text-muted-foreground'
          }`}
        >
          {t('验证码登录')}
        </button>
        <button
          type='button'
          onClick={() => setMode('password')}
          className={`flex-1 pb-2.5 text-sm transition-colors ${
            mode === 'password'
              ? 'border-b-2 border-[#378ADD] font-medium text-foreground'
              : 'text-muted-foreground'
          }`}
        >
          {t('密码登录')}
        </button>
        <button
          type='button'
          onClick={() => setMode('account')}
          className={`flex-1 pb-2.5 text-sm transition-colors ${
            mode === 'account'
              ? 'border-b-2 border-[#378ADD] font-medium text-foreground'
              : 'text-muted-foreground'
          }`}
        >
          {t('账号登录')}
        </button>
      </div>

      {mode === 'sms' ? (
        <div className='space-y-3'>
          <div className='flex gap-2'>
            <div className='flex items-center rounded-lg border border-white/15 bg-[#0A1126]/55 px-3 text-sm text-muted-foreground'>
              +86
            </div>
            <Input
              type='tel'
              inputMode='numeric'
              maxLength={11}
              placeholder={t('手机号')}
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/[^0-9]/g, ''))}
              className='bg-[#0A1126]/55'
            />
          </div>
          <div className='flex gap-2'>
            <Input
              inputMode='numeric'
              maxLength={6}
              placeholder={t('验证码')}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, ''))}
              className='bg-[#0A1126]/55'
            />
            <Button
              type='button'
              variant='ghost'
              onClick={handleSendCode}
              disabled={isSending || countdown > 0 || !phoneValid}
              className='shrink-0 border border-white/15 text-foreground'
            >
              {isSending ? <Loader2 className='h-4 w-4 animate-spin' /> : null}
              {countdown > 0 ? `${countdown}s` : t('发送验证码')}
            </Button>
          </div>
          <p className='text-center text-xs text-muted-foreground'>
            {isSignUp ? t('仅支持手机号注册') : t('未注册的手机号将自动注册')}
          </p>
        </div>
      ) : mode === 'password' ? (
        <div className='space-y-3'>
          <div className='flex gap-2'>
            <div className='flex items-center rounded-lg border border-white/15 bg-[#0A1126]/55 px-3 text-sm text-muted-foreground'>
              +86
            </div>
            <Input
              type='tel'
              inputMode='numeric'
              maxLength={11}
              placeholder={t('手机号')}
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/[^0-9]/g, ''))}
              className='bg-[#0A1126]/55'
            />
          </div>
          <Input
            type='password'
            placeholder={t('密码')}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className='bg-[#0A1126]/55'
          />
          <button
            type='button'
            onClick={() => setForgot(true)}
            className='self-end text-xs text-muted-foreground transition-colors hover:text-[#7F77DD]'
          >
            {t('忘记密码？')}
          </button>
        </div>
      ) : (
        <div className='space-y-3'>
          <div className='flex gap-2'>
            <div className='flex shrink-0 items-center rounded-lg border border-white/15 bg-[#0A1126]/55 px-3 text-sm text-muted-foreground'>
              {t('账号')}
            </div>
            <Input
              placeholder={t('用户名')}
              value={accountName}
              onChange={(e) => setAccountName(e.target.value)}
              className='bg-[#0A1126]/55'
            />
          </div>
          <Input
            type='password'
            placeholder={t('密码')}
            value={accountPwd}
            onChange={(e) => setAccountPwd(e.target.value)}
            className='bg-[#0A1126]/55'
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAccountLogin()
            }}
          />
        </div>
      )}

      {forgot && (
        <div className='space-y-3 rounded-lg border border-[#378ADD]/30 bg-[#0A1126]/40 p-3'>
          <p className='text-xs font-medium text-[#FAEEDA]'>{t('重置密码')}</p>
          <div className='flex gap-2'>
            <div className='flex items-center rounded-lg border border-white/15 bg-[#0A1126]/55 px-3 text-sm text-muted-foreground'>
              +86
            </div>
            <Input
              type='tel'
              inputMode='numeric'
              maxLength={11}
              placeholder={t('手机号')}
              value={forgotPhone}
              onChange={(e) => setForgotPhone(e.target.value.replace(/[^0-9]/g, ''))}
              className='bg-[#0A1126]/55'
            />
          </div>
          <div className='flex gap-2'>
            <Input
              inputMode='numeric'
              maxLength={6}
              placeholder={t('验证码')}
              value={forgotCode}
              onChange={(e) => setForgotCode(e.target.value.replace(/[^0-9]/g, ''))}
              className='bg-[#0A1126]/55'
            />
            <Button
              type='button'
              variant='ghost'
              onClick={() => sendForgotCode()}
              disabled={forgotSending || forgotCountdown > 0}
              className='shrink-0 border border-white/15 text-foreground'
            >
              {forgotCountdown > 0 ? `${forgotCountdown}s` : t('发送验证码')}
            </Button>
          </div>
          <Input
            type='password'
            placeholder={t('新密码（至少 8 位）')}
            value={forgotNewPwd}
            onChange={(e) => setForgotNewPwd(e.target.value)}
            className='bg-[#0A1126]/55'
          />
          <div className='flex gap-2'>
            <Button
              type='button'
              variant='ghost'
              onClick={() => setForgot(false)}
              className='flex-1 border border-white/15 text-foreground'
            >
              {t('取消')}
            </Button>
            <Button
              type='button'
              onClick={handleResetPassword}
              disabled={resetting || !agreed}
              className='flex-1 bg-gradient-to-br from-[#378ADD] to-[#534AB7] text-white'
            >
              {resetting ? <Loader2 className='h-4 w-4 animate-spin' /> : null}
              {t('确认重置')}
            </Button>
          </div>
        </div>
      )}

      {/* 协议勾选 */}
      <label className='flex items-start gap-2 text-xs text-muted-foreground'>
        <input
          type='checkbox'
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
          className='mt-0.5 accent-[#378ADD]'
        />
        <span>
          {t('已阅读并同意')}
          <a className='text-[#7F77DD] hover:underline'>{t('《平台协议》')}</a>
          {t('与')}
          <a className='text-[#7F77DD] hover:underline'>{t('《隐私政策》')}</a>
        </span>
      </label>

      <Button
        type='button'
        onClick={
          mode === 'sms'
            ? handleSmsLogin
            : mode === 'password'
              ? handlePasswordLogin
              : handleAccountLogin
        }
        disabled={isSubmitting || !agreed}
        className='w-full gap-2 bg-gradient-to-br from-[#378ADD] to-[#534AB7] text-white shadow-[0_4px_16px_rgba(55,138,221,0.32)] hover:opacity-90'
      >
        {isSubmitting ? <Loader2 className='h-4 w-4 animate-spin' /> : null}
        {isSignUp ? t('注 册') : t('登 录')}
      </Button>
    </div>
  )
}
