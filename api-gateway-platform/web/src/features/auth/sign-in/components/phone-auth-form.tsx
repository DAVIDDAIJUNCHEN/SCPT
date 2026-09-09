/*
Copyright (C) 2026 川邮星语 · AlloMax

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { Loader2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PasswordInput } from '@/components/password-input'
import {
  phoneLogin,
  phonePasswordLogin,
  phoneRegister,
  setPhonePassword,
} from '@/features/auth/api'
import { useAuthRedirect } from '@/features/auth/hooks/use-auth-redirect'
import { isAuthBundle } from '@/lib/api'
import { getServerErrorMessageKey } from '@/lib/server-error-message'
import { CaptchaDialog } from '@/features/auth/sign-in/components/captcha-dialog'

const CN_PHONE = /^1[3-9][0-9]{9}$/

// 三态：登录（密码/验证码双 tab）、注册、忘记密码
type View = 'login' | 'register' | 'forgot'
type Mode = 'sms' | 'password'

// ---------- 模块级输入框样式常量 ----------
// 登录页统一输入框：44px 高 + 深色半透明底 + focus 蓝紫发光描边
const INPUT_CLS =
  'h-11 bg-[#0A1126]/55 focus-visible:border-[#378ADD]/70 focus-visible:ring-[#378ADD]/25'
// 手机号输入框：+86 内嵌，左侧预留前缀空间
const PHONE_INPUT_CLS = `${INPUT_CLS} pl-14`

// ---------- 输入框小组件（必须定义在模块顶层） ----------
// 注意：绝不能定义在 PhoneAuthForm 组件内部，否则每次父组件重渲染都会以新函数身份
// 重建子组件 → input 反复卸载重挂 → 快速连续输入丢字（已实测根因）
function PhoneField({
  value,
  onChange,
  placeholder,
  extraCls,
}: {
  value: string
  onChange: (v: string) => void
  placeholder: string
  extraCls?: string
}) {
  // 与密码登录手机号框完全同构：Base UI Input + 无 replace + 简单受控
  return (
    <div className='relative'>
      <span className='pointer-events-none absolute inset-y-0 left-3.5 z-10 flex items-center text-sm text-foreground/80'>
        +86
      </span>
      <Input
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`${INPUT_CLS} ${PHONE_INPUT_CLS} ${extraCls ?? ''}`}
      />
    </div>
  )
}

function CodeField({
  value,
  onChange,
  countdown,
  onSend,
}: {
  value: string
  onChange: (v: string) => void
  countdown: number
  onSend: () => void
}) {
  const { t } = useTranslation()
  return (
    <div className='flex gap-2'>
      <Input
        placeholder={t('验证码')}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={INPUT_CLS}
      />
      <Button
        type='button'
        variant='ghost'
        onClick={onSend}
        disabled={countdown > 0}
        className='h-11 shrink-0 border border-white/15 px-4 text-foreground transition-colors hover:border-[#378ADD]/60 disabled:opacity-50'
      >
        {countdown > 0 ? `${countdown}s` : t('发送验证码')}
      </Button>
    </div>
  )
}

export function PhoneAuthForm({
  redirectTo,
  initialView = 'login',
}: {
  redirectTo?: string
  initialView?: View
}) {
  const { t } = useTranslation()
  const { handleLoginSuccess } = useAuthRedirect()

  // 视图状态机
  const [view, setView] = useState<View>(initialView)
  // 登录 tab：密码 / 验证码（默认密码登录）
  const [mode, setMode] = useState<Mode>('password')

  // 登录字段
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [countdown, setCountdown] = useState(0)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // 注册字段（用户名默认=手机号）
  const [regPhone, setRegPhone] = useState('')
  const [regCode, setRegCode] = useState('')
  const [regPwd, setRegPwd] = useState('')
  const [regPwdConfirm, setRegPwdConfirm] = useState('')
  const [regCountdown, setRegCountdown] = useState(0)
  const [isRegistering, setIsRegistering] = useState(false)

  // 忘记密码字段（分两步：Step1 手机号+验证码 → Step2 新密码+确认）
  const [forgotStep, setForgotStep] = useState<1 | 2>(1)
  const [forgotPhone, setForgotPhone] = useState('')
  const [forgotCode, setForgotCode] = useState('')
  const [forgotNewPwd, setForgotNewPwd] = useState('')
  const [forgotPwdConfirm, setForgotPwdConfirm] = useState('')
  const [forgotCountdown, setForgotCountdown] = useState(0)
  const [resetting, setResetting] = useState(false)

  // 自研几何图形+颜色人机校验：点击"发送验证码"后弹出
  const [captchaOpen, setCaptchaOpen] = useState(false)
  const captchaTargetRef = useRef<'login' | 'register' | 'forgot'>('login')

  // 登录页统一输入框：44px 高 + 深色半透明底 + focus 蓝紫发光描边（手机号/验证码框已用模块级 INPUT_CLS）
  const inputCls =
    'h-11 bg-[#0A1126]/55 focus-visible:border-[#378ADD]/70 focus-visible:ring-[#378ADD]/25'

  useEffect(() => {
    if (countdown <= 0) return
    const timer = setInterval(() => setCountdown((c) => c - 1), 1000)
    return () => clearInterval(timer)
  }, [countdown])

  useEffect(() => {
    if (regCountdown <= 0) return
    const timer = setInterval(() => setRegCountdown((c) => c - 1), 1000)
    return () => clearInterval(timer)
  }, [regCountdown])

  useEffect(() => {
    if (forgotCountdown <= 0) return
    const timer = setInterval(() => setForgotCountdown((c) => c - 1), 1000)
    return () => clearInterval(timer)
  }, [forgotCountdown])

  // ---------- 发送验证码（三态各自独立倒计时，共用同一个人机校验弹窗） ----------
  function requestCaptcha(target: 'login' | 'register' | 'forgot', phoneToSend: string) {
    if (!CN_PHONE.test(phoneToSend)) {
      toast.error(t('请输入正确的手机号'))
      return
    }
    captchaTargetRef.current = target
    setCaptchaOpen(true)
  }

  // 人机校验通过、短信已发出后统一处理倒计时/提示
  function handleCaptchaVerified(devCode?: string) {
    const target = captchaTargetRef.current
    if (target === 'register') {
      setRegCountdown(60)
    } else if (target === 'forgot') {
      setForgotCountdown(60)
    } else {
      setCountdown(60)
    }
    toast.success(t('验证码已发送'))
    if (devCode) toast.info(`${t('测试验证码')}: ${devCode}`)
    captchaTargetRef.current = 'login'
  }

  // ---------- 登录 ----------
  async function handleSmsLogin() {
    if (!CN_PHONE.test(phone)) {
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
    if (!phone.trim()) {
      toast.error(t('请输入手机号或用户名'))
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

  // ---------- 注册：手机号(用户名) + 密码 + 确认密码 + 验证码 ----------
  async function handleRegister() {
    if (!CN_PHONE.test(regPhone)) {
      toast.error(t('请输入正确的手机号'))
      return
    }
    if (regPwd.length < 8) {
      toast.error(t('密码至少 8 位'))
      return
    }
    if (regPwd !== regPwdConfirm) {
      toast.error(t('两次输入的密码不一致'))
      return
    }
    if (regCode.trim().length < 4) {
      toast.error(t('请输入验证码'))
      return
    }
    setIsRegistering(true)
    try {
      const res = await phoneRegister(regPhone, regCode, regPwd)
      if (res.success && isAuthBundle(res.data)) {
        await handleLoginSuccess(res.data, redirectTo)
        toast.success(t('注册成功，已自动登录'))
      } else {
        if (getServerErrorMessageKey(res)) return
        toast.error(res.message || t('注册失败'))
      }
    } catch (error) {
      if (getServerErrorMessageKey(error)) return
      toast.error(t('注册失败'))
    } finally {
      setIsRegistering(false)
    }
  }

  // ---------- 忘记密码 Step1 → Step2：前端校验手机号+验证码后解锁下一步 ----------
  function handleForgotNext() {
    if (!CN_PHONE.test(forgotPhone)) {
      toast.error(t('请输入正确的手机号'))
      return
    }
    if (forgotCode.trim().length < 4) {
      toast.error(t('请输入验证码'))
      return
    }
    setForgotStep(2)
  }

  // ---------- 忘记密码：Step2 提交（手机号+验证码+新密码，验证码为一次性凭证） ----------
  function handleResetPassword() {
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
    if (forgotNewPwd !== forgotPwdConfirm) {
      toast.error(t('两次输入的密码不一致'))
      return
    }
    confirmResetPassword()
  }

  async function confirmResetPassword() {
    setResetting(true)
    try {
      const res = await setPhonePassword(forgotPhone, forgotCode, forgotNewPwd, true)
      if (res.success) {
        toast.success(t('密码重置成功，请使用新密码登录'))
        // 重置成功回到登录（密码登录 tab），预填手机号并复位忘记密码分步状态
        setView('login')
        setMode('password')
        setPassword('')
        setPhone(forgotPhone)
        setForgotStep(1)
        setForgotPhone('')
        setForgotCode('')
        setForgotNewPwd('')
        setForgotPwdConfirm('')
        setForgotCountdown(0)
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

  // ---------- 标题 ----------
  // 登录视图标题位置展示品牌名"川邮·星语"（替代单独的"登录"二字）；注册/忘记密码显示各自语义
  const title =
    view === 'register'
      ? t('立即注册')
      : view === 'forgot'
        ? t('重置统一登录密码')
        : t('川邮·星语')

  const subtitle =
    view === 'register'
      ? t('使用手机号注册，一个账号访问全部服务')
      : view === 'forgot'
        ? t('通过手机号验证重置您的登录密码')
        : ''

  // ---------- 主按钮 ----------
  const primaryBtnCls =
    'w-full gap-2 bg-gradient-to-br from-[#378ADD] to-[#534AB7] py-6 text-base font-medium text-white shadow-[0_4px_16px_rgba(55,138,221,0.32)] transition-all hover:shadow-[0_6px_24px_rgba(83,74,183,0.45)] hover:opacity-95 active:scale-[0.99] disabled:opacity-50'

  return (
    <div className='space-y-5'>
      {/* 标题 + 副标题（始终居中，确保登录视图品牌名"川邮·星语"居中） */}
      <div className='space-y-1.5 text-center'>
        <h1 className='text-xl font-medium text-foreground'>{title}</h1>
        {subtitle && (
          <p className='text-sm text-muted-foreground'>{subtitle}</p>
        )}
      </div>

      {/* ============ 登录视图 ============ */}
      {view === 'login' && (
        <>
          {/* tab 切换：密码登录（默认）/ 验证码登录 */}
          <div className='flex border-b border-white/10'>
            <button
              type='button'
              onClick={() => setMode('password')}
              className={`relative flex-1 py-2.5 text-sm transition-colors ${
                mode === 'password'
                  ? 'font-medium text-foreground'
                  : 'text-muted-foreground hover:text-foreground/80'
              }`}
            >
              {t('密码登录')}
              <span
                className={`absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-gradient-to-r from-[#378ADD] to-[#534AB7] transition-all duration-300 ${
                  mode === 'password' ? 'opacity-100' : 'opacity-0'
                }`}
              />
            </button>
            <button
              type='button'
              onClick={() => setMode('sms')}
              className={`relative flex-1 py-2.5 text-sm transition-colors ${
                mode === 'sms'
                  ? 'font-medium text-foreground'
                  : 'text-muted-foreground hover:text-foreground/80'
              }`}
            >
              {t('验证码登录')}
              <span
                className={`absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-gradient-to-r from-[#378ADD] to-[#534AB7] transition-all duration-300 ${
                  mode === 'sms' ? 'opacity-100' : 'opacity-0'
                }`}
              />
            </button>
          </div>

          {mode === 'password' ? (
            <div className='space-y-3'>
              <Input
                placeholder={t('手机号 / 用户名')}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                autoComplete='username'
                className={inputCls}
              />
              <PasswordInput
                placeholder={t('密码')}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete='current-password'
                className={inputCls}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handlePasswordLogin()
                }}
              />
              <button
                type='button'
                onClick={() => setView('forgot')}
                className='self-end text-xs text-muted-foreground transition-colors hover:text-[#7F77DD]'
              >
                {t('忘记密码？')}
              </button>
            </div>
          ) : (
            <div className='space-y-3'>
              <PhoneField
                value={phone}
                onChange={setPhone}
                placeholder={t('手机号')}
              />
              <CodeField
                value={code}
                onChange={setCode}
                countdown={countdown}
                onSend={() => requestCaptcha('login', phone)}
              />
            </div>
          )}

          <Button
            type='button'
            onClick={mode === 'sms' ? handleSmsLogin : handlePasswordLogin}
            disabled={isSubmitting}
            className={primaryBtnCls}
          >
            {isSubmitting ? <Loader2 className='h-4 w-4 animate-spin' /> : null}
            {t('登 录')}
          </Button>
        </>
      )}

      {/* ============ 注册视图 ============ */}
      {view === 'register' && (
        <div className='space-y-3'>
          <PhoneField
            value={regPhone}
            onChange={setRegPhone}
            placeholder={t('手机号 / 用户名')}
          />
          <PasswordInput
            placeholder={t('设置密码（至少 8 位）')}
            value={regPwd}
            onChange={(e) => setRegPwd(e.target.value)}
            autoComplete='new-password'
            className={inputCls}
          />
          <PasswordInput
            placeholder={t('再次输入密码')}
            value={regPwdConfirm}
            onChange={(e) => setRegPwdConfirm(e.target.value)}
            autoComplete='new-password'
            className={inputCls}
          />
          <CodeField
            value={regCode}
            onChange={setRegCode}
            countdown={regCountdown}
            onSend={() => requestCaptcha('register', regPhone)}
          />
          <Button
            type='button'
            onClick={handleRegister}
            disabled={isRegistering}
            className={primaryBtnCls}
          >
            {isRegistering ? <Loader2 className='h-4 w-4 animate-spin' /> : null}
            {t('注 册')}
          </Button>
        </div>
      )}

      {/* ============ 忘记密码视图（分两步） ============ */}
      {view === 'forgot' && (
        <div className='space-y-3'>
          {/* 分步指示 */}
          <div className='flex items-center justify-center gap-2 text-xs text-muted-foreground'>
            <span className={forgotStep === 1 ? 'font-medium text-[#378ADD]' : ''}>
              {t('验证身份')}
            </span>
            <span className='text-muted-foreground/40'>·</span>
            <span className={forgotStep === 2 ? 'font-medium text-[#378ADD]' : ''}>
              {t('设置新密码')}
            </span>
          </div>

          {forgotStep === 1 && (
            <>
              <PhoneField
                value={forgotPhone}
                onChange={setForgotPhone}
                placeholder={t('手机号')}
              />
              <CodeField
                value={forgotCode}
                onChange={setForgotCode}
                countdown={forgotCountdown}
                onSend={() => requestCaptcha('forgot', forgotPhone)}
              />
              <Button
                type='button'
                onClick={handleForgotNext}
                className={primaryBtnCls}
              >
                {t('下一步')}
              </Button>
            </>
          )}

          {forgotStep === 2 && (
            <>
              <PasswordInput
                placeholder={t('新密码（至少 8 位）')}
                value={forgotNewPwd}
                onChange={(e) => setForgotNewPwd(e.target.value)}
                autoComplete='new-password'
                className={inputCls}
              />
              <PasswordInput
                placeholder={t('再次输入新密码')}
                value={forgotPwdConfirm}
                onChange={(e) => setForgotPwdConfirm(e.target.value)}
                autoComplete='new-password'
                className={inputCls}
              />
              <Button
                type='button'
                onClick={handleResetPassword}
                disabled={resetting}
                className={primaryBtnCls}
              >
                {resetting ? <Loader2 className='h-4 w-4 animate-spin' /> : null}
                {t('确认重置')}
              </Button>
              <button
                type='button'
                onClick={() => setForgotStep(1)}
                className='mx-auto block text-xs text-muted-foreground transition-colors hover:text-[#7F77DD]'
              >
                {t('上一步：修改手机号 / 验证码')}
              </button>
            </>
          )}
        </div>
      )}

      {/* ============ 底部链接 ============ */}
      {view === 'login' && mode === 'password' ? (
        <p className='flex items-center justify-center gap-1 text-sm text-muted-foreground'>
          {t('没有账号？')}
          <button
            type='button'
            onClick={() => setView('register')}
            className='font-medium text-[#7F77DD] transition-colors hover:text-[#9A93E8]'
          >
            {t('立即注册')}
          </button>
        </p>
      ) : null}

      {view !== 'login' && (
        <button
          type='button'
          onClick={() => {
            setView('login')
            setMode('password')
          }}
          className='mx-auto block text-sm text-muted-foreground transition-colors hover:text-[#7F77DD]'
        >
          {t('返回登录')}
        </button>
      )}

      {/* 川邮·星语：参考 DeepSeek，登录/注册即代表已阅读并同意协议 */}
      <p className='text-xs leading-relaxed text-center text-muted-foreground'>
        {t('注册登录即代表已阅读并同意')}
        <a href='/user-agreement' className='text-[#7F77DD] hover:underline'>
          {t('《川邮·星语开放平台协议》')}
        </a>
        {t('与')}
        <a href='/privacy-policy' className='text-[#7F77DD] hover:underline'>
          {t('《隐私政策》')}
        </a>
      </p>

      {/* 验证码登录说明（置于隐私政策之后）：未注册手机号通过验证码登录会自动注册 */}
      {view === 'login' && mode === 'sms' && (
        <p className='text-center text-xs text-muted-foreground/80'>
          {t('未注册的手机号将自动注册')}
        </p>
      )}

      {/* 自研几何图形+颜色人机校验：点击"发送验证码"后弹出 */}
      <CaptchaDialog
        open={captchaOpen}
        phone={
          captchaTargetRef.current === 'register'
            ? regPhone
            : captchaTargetRef.current === 'forgot'
              ? forgotPhone
              : phone
        }
        onOpenChange={setCaptchaOpen}
        onVerified={handleCaptchaVerified}
      />
    </div>
  )
}
