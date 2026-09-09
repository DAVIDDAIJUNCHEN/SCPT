/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import axios from 'axios'

import { api, refreshAuthentication, type RefreshOutcome } from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'

import {
  clearPasswordEncryptionCache,
  encryptPassword,
} from './lib/password-encryption'
import { getAffiliateCode } from './lib/storage'
import type { TelegramAuthorization } from './lib/telegram-login'
import type {
  LoginPayload,
  LoginResponse,
  Login2FAResponse,
  TwoFAPayload,
  RegisterPayload,
  ApiResponse,
} from './types'

// ============================================================================
// Authentication APIs
// ============================================================================

// ----------------------------------------------------------------------------
// Login & Logout
// ----------------------------------------------------------------------------

// User login with username and password
export async function login(payload: LoginPayload): Promise<LoginResponse> {
  const turnstile = payload.turnstile ?? ''
  try {
    let passwordFields:
      | { password: string }
      | { password_encrypted: string; encryption_key_id: string }
    if (payload.passwordEncryptionEnabled) {
      const encryptedPassword = await encryptPassword(payload.password)
      passwordFields = {
        password_encrypted: encryptedPassword.password_encrypted,
        encryption_key_id: encryptedPassword.encryption_key_id,
      }
    } else {
      passwordFields = { password: payload.password }
    }
    const res = await api.post<LoginResponse>(
      `/api/user/login?turnstile=${turnstile}`,
      {
        username: payload.username,
        ...passwordFields,
      },
      { skipAuthRefresh: true }
    )
    if (payload.passwordEncryptionEnabled && !res.data?.success) {
      clearPasswordEncryptionCache()
    }
    return res.data
  } catch (error: unknown) {
    if (payload.passwordEncryptionEnabled) {
      clearPasswordEncryptionCache()
    }
    throw error
  }
}

// Two-factor authentication login
export async function login2fa(payload: TwoFAPayload) {
  const res = await api.post<Login2FAResponse>('/api/user/login/2fa', payload, {
    skipAuthRefresh: true,
  })
  return res.data
}

// ----------------------------------------------------------------------------
// AlloMax: Phone number verification-code login
// ----------------------------------------------------------------------------

export interface PhoneCodeResponse {
  success: boolean
  message: string
  /** mock 通道回显验证码（生产短信通道不返回） */
  dev_code?: string
  /** 需要人机验证（未通过或缺失校验时 true） */
  need_captcha?: boolean
}

/** 自研几何图形+颜色人机校验（后端下发 SVG + 题目） */
export interface CaptchaChallengeResponse {
  success: boolean
  challenge_id: string
  svg: string
  prompt_cn: string
}

/** 获取人机校验挑战（SVG 图形 + 题目文字） */
export async function getCaptchaChallenge(): Promise<CaptchaChallengeResponse> {
  const res = await api.get<CaptchaChallengeResponse>('/api/phone/captcha', {
    skipAuthRefresh: true,
  })
  return res.data
}

/** 请求发送手机号验证码（需先通过几何图形+颜色人机校验） */
export async function sendPhoneCode(
  phone: string,
  captcha?: { id: string; x: number; y: number }
): Promise<PhoneCodeResponse> {
  let url = `/api/phone/verification?phone=${encodeURIComponent(phone)}`
  if (captcha) {
    url += `&captcha_id=${encodeURIComponent(captcha.id)}`
    url += `&captcha_x=${captcha.x}`
    url += `&captcha_y=${captcha.y}`
  }
  const res = await api.get<PhoneCodeResponse>(url, { skipAuthRefresh: true })
  return res.data
}

/** 手机号验证码登录（用户不存在则自动注册） */
export async function phoneLogin(
  phone: string,
  code: string
): Promise<LoginResponse> {
  const res = await api.post<LoginResponse>(
    '/api/user/phone/login',
    { phone, code },
    { skipAuthRefresh: true }
  )
  return res.data
}

/** 手机号 + 验证码 + 密码注册（需先发码并经人机校验）；成功即登录 */
export async function phoneRegister(
  phone: string,
  code: string,
  password: string
): Promise<LoginResponse> {
  const res = await api.post<LoginResponse>(
    '/api/user/phone/register',
    { phone, code, password },
    { skipAuthRefresh: true }
  )
  return res.data
}

/** 密码登录（账号支持手机号或用户名，用户需已设置密码） */
export async function phonePasswordLogin(
  account: string,
  password: string
): Promise<LoginResponse> {
  const res = await api.post<LoginResponse>(
    '/api/user/phone/password-login',
    { account, password },
    { skipAuthRefresh: true }
  )
  return res.data
}

/** 验证码校验后设置/重置密码（reset=true 走忘记密码语义） */
export async function setPhonePassword(
  phone: string,
  code: string,
  password: string,
  reset = false
): Promise<ApiResponse> {
  const res = await api.post<ApiResponse>(
    reset ? '/api/user/phone/reset-password' : '/api/user/phone/set-password',
    { phone, code, password },
    { skipAuthRefresh: true }
  )
  return res.data
}

interface LogoutRuntime {
  getExpectedSID: () => string | undefined
  request: (expectedSID?: string) => Promise<ApiResponse>
  refresh: () => Promise<RefreshOutcome>
}

export async function executeLogout(
  runtime: LogoutRuntime,
  allowMismatchRecovery = true
): Promise<ApiResponse> {
  try {
    return await runtime.request(runtime.getExpectedSID())
  } catch (error: unknown) {
    const code = axios.isAxiosError(error)
      ? error.response?.data?.code
      : undefined
    if (
      allowMismatchRecovery &&
      axios.isAxiosError(error) &&
      error.response?.status === 409 &&
      code === 'AUTH_SESSION_MISMATCH'
    ) {
      const outcome = await runtime.refresh()
      if (outcome.kind === 'authenticated') {
        return executeLogout(runtime, false)
      }
      if (outcome.kind === 'anonymous') {
        return { success: true, message: '' }
      }
    }
    throw error
  }
}

// User logout
export async function logout(): Promise<ApiResponse> {
  return executeLogout({
    getExpectedSID: () => useAuthStore.getState().auth.session?.sid,
    request: async (sid) => {
      const res = await api.post('/api/user/auth/logout', undefined, {
        headers: sid ? { 'X-Auth-Session': sid } : undefined,
        skipAuthRefresh: true,
        skipErrorHandler: true,
      })
      return res.data
    },
    refresh: refreshAuthentication,
  })
}

// ----------------------------------------------------------------------------
// Password Management
// ----------------------------------------------------------------------------

// Send password reset email
export async function sendPasswordResetEmail(
  email: string,
  turnstile?: string
): Promise<ApiResponse> {
  const res = await api.get('/api/reset_password', {
    params: { email, turnstile },
  })
  return res.data
}

// ----------------------------------------------------------------------------
// OAuth
// ----------------------------------------------------------------------------

// Start GitHub OAuth flow
export async function githubOAuthStart(clientId: string, state: string) {
  const url = `https://github.com/login/oauth/authorize?client_id=${clientId}&state=${state}&scope=user:email`
  window.open(url)
}

// Get OAuth state for CSRF protection
export async function createOAuthFlow(
  provider: string,
  intent: 'login' | 'bind'
): Promise<string> {
  const aff = intent === 'login' ? getAffiliateCode() : ''
  const res = await api.post(
    '/api/oauth/state',
    { provider, intent, aff: aff || undefined },
    { skipAuthRefresh: intent === 'login' }
  )
  if (res.data?.success) {
    if (typeof res.data.data === 'string') return res.data.data
    if (typeof res.data.data?.flow_token === 'string') {
      return res.data.data.flow_token
    }
  }
  throw new Error(res.data?.message || 'Failed to initialize OAuth')
}

// WeChat login by authorization code
export async function wechatLoginByCode(code: string): Promise<ApiResponse> {
  const res = await api.get('/api/oauth/wechat', { params: { code } })
  return res.data
}

export async function telegramLogin(
  authorization: TelegramAuthorization
): Promise<ApiResponse> {
  const res = await api.get('/api/oauth/telegram/login', {
    params: authorization,
    disableDuplicate: true,
    skipAuthRefresh: true,
    skipBusinessError: true,
    skipErrorHandler: true,
  })
  return res.data
}

// ----------------------------------------------------------------------------
// Registration
// ----------------------------------------------------------------------------

// User registration
export async function register(payload: RegisterPayload): Promise<ApiResponse> {
  const res = await api.post(`/api/user/register`, payload, {
    params: { turnstile: payload.turnstile ?? '' },
  })
  return res.data
}

// Send email verification code
export async function sendEmailVerification(
  email: string,
  turnstile?: string
): Promise<ApiResponse> {
  const res = await api.get('/api/verification', {
    params: { email, turnstile },
  })
  return res.data
}

// Bind email to OAuth account
export async function bindEmail(
  email: string,
  code: string
): Promise<ApiResponse> {
  const res = await api.post('/api/oauth/email/bind', {
    email,
    code,
  })
  return res.data
}
