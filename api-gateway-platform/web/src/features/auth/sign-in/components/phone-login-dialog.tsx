/*
Copyright (C) 2026 AlloMax

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
*/
import { Loader2, MessageSquareText } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Dialog } from '@/components/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { phoneLogin, sendPhoneCode } from '@/features/auth/api'
import { useAuthRedirect } from '@/features/auth/hooks/use-auth-redirect'
import { isAuthBundle } from '@/lib/api'
import { getServerErrorMessageKey } from '@/lib/server-error-message'

const CN_PHONE = /^1[3-9][0-9]{9}$/

interface PhoneLoginDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  redirectTo?: string
}

/**
 * AlloMax: 手机号验证码登录对话框
 * 用户不存在时后端自动注册（验证码登录即注册）。
 */
export function PhoneLoginDialog({
  open,
  onOpenChange,
  redirectTo,
}: PhoneLoginDialogProps) {
  const { t } = useTranslation()
  const { handleLoginSuccess } = useAuthRedirect()

  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [countdown, setCountdown] = useState(0)
  const [isSending, setIsSending] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const phoneValid = CN_PHONE.test(phone)
  const codeValid = code.trim().length >= 4

  // 发送验证码倒计时
  useEffect(() => {
    if (!open) return
    if (countdown <= 0) return
    const timer = setInterval(() => setCountdown((c) => c - 1), 1000)
    return () => clearInterval(timer)
  }, [open, countdown])

  const reset = () => {
    setCode('')
    setPhone('')
    setCountdown(0)
  }

  async function handleSendCode() {
    if (!phoneValid) {
      toast.error(t('Please enter a valid phone number'))
      return
    }
    setIsSending(true)
    try {
      const res = await sendPhoneCode(phone)
      if (res.success) {
        setCountdown(60)
        toast.success(t('Verification code sent'))
        // mock 通道回显验证码（生产短信通道不返回）
        if (res.dev_code) {
          toast.info(`${t('Dev code')}: ${res.dev_code}`)
        }
      } else {
        if (getServerErrorMessageKey(res)) return
        toast.error(res.message || t('Failed to send verification code'))
      }
    } catch (error: unknown) {
      if (getServerErrorMessageKey(error)) return
      toast.error(t('Failed to send verification code'))
    } finally {
      setIsSending(false)
    }
  }

  async function handleSubmit() {
    if (!phoneValid) {
      toast.error(t('Please enter a valid phone number'))
      return
    }
    if (!codeValid) {
      toast.error(t('Please enter the verification code'))
      return
    }
    setIsSubmitting(true)
    try {
      const res = await phoneLogin(phone, code)
      if (res.success && isAuthBundle(res.data)) {
        await handleLoginSuccess(res.data, redirectTo)
        toast.success(t('Welcome back!'))
        onOpenChange(false)
        reset()
      } else {
        if (getServerErrorMessageKey(res)) return
        toast.error(res.message || t('Login failed'))
      }
    } catch (error: unknown) {
      if (getServerErrorMessageKey(error)) return
      toast.error(t('Login failed'))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next)
        if (!next) reset()
      }}
      title={t('Sign in with phone number')}
      description={t(
        'Enter your phone number to receive a verification code. New phone numbers will be registered automatically.'
      )}
      contentClassName='max-w-sm'
      headerClassName='text-left'
      contentHeight='auto'
      bodyClassName='space-y-4'
      footer={
        <>
          <Button
            type='button'
            variant='outline'
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            {t('Cancel')}
          </Button>
          <Button
            type='button'
            onClick={handleSubmit}
            disabled={isSubmitting || !phoneValid || !codeValid}
            className='gap-2'
          >
            {isSubmitting ? (
              <Loader2 className='h-4 w-4 animate-spin' />
            ) : null}
            {t('Sign in')}
          </Button>
        </>
      }
    >
      <div className='grid gap-4'>
        <div className='grid gap-2'>
          <Label htmlFor='phone-login-number'>
            {t('Phone number')}
          </Label>
          <div className='flex gap-2'>
            <Input
              id='phone-login-number'
              type='tel'
              inputMode='numeric'
              maxLength={11}
              placeholder='13800138000'
              value={phone}
              onChange={(e) =>
                setPhone(e.target.value.replace(/[^0-9]/g, ''))
              }
              autoComplete='tel'
            />
            <Button
              type='button'
              variant='secondary'
              onClick={handleSendCode}
              disabled={isSending || countdown > 0 || !phoneValid}
              className='shrink-0 gap-1.5'
            >
              {isSending ? (
                <Loader2 className='h-4 w-4 animate-spin' />
              ) : (
                <MessageSquareText className='h-4 w-4' />
              )}
              {countdown > 0 ? `${countdown}s` : t('Get code')}
            </Button>
          </div>
        </div>

        <div className='grid gap-2'>
          <Label htmlFor='phone-login-code'>{t('Verification code')}</Label>
          <Input
            id='phone-login-code'
            inputMode='numeric'
            maxLength={6}
            placeholder='123456'
            value={code}
            onChange={(e) =>
              setCode(e.target.value.replace(/[^0-9]/g, ''))
            }
            autoComplete='one-time-code'
          />
        </div>

        <p className='text-muted-foreground text-xs'>
          {t(
            'If no SMS is received, check the server log or sms_logs table (mock channel).'
          )}
        </p>
      </div>
    </Dialog>
  )
}
