/*
Copyright (C) 2026 川邮星语 · AlloMax

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { AuthLayout } from '../auth-layout'
import { PhoneAuthForm } from '../sign-in/components/phone-auth-form'

export function SignUp() {
  const { t } = useTranslation()

  return (
    <AuthLayout>
      <div className='space-y-6'>
        <div className='space-y-1.5 text-center lg:text-left'>
          <h1 className='text-xl font-medium text-foreground'>{t('注册')}</h1>
          <p className='text-sm text-muted-foreground'>{t('仅支持手机号注册，一个账号访问全部服务')}</p>
        </div>
        <PhoneAuthForm variant='sign-up' />
        <p className='text-center text-sm text-muted-foreground'>
          {t('已有账号？')}{' '}
          <Link to='/sign-in' className='text-[#7F77DD] hover:underline'>
            {t('登录')}
          </Link>
        </p>
      </div>
    </AuthLayout>
  )
}
