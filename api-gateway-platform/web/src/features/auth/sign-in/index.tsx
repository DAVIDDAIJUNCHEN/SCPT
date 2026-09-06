/*
Copyright (C) 2026 川邮星语 · AlloMax

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { Link, useSearch } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { AuthLayout } from '../auth-layout'
import { PhoneAuthForm } from './components/phone-auth-form'

export function SignIn() {
  const { t } = useTranslation()
  const { redirect } = useSearch({ from: '/(auth)/sign-in' })

  return (
    <AuthLayout>
      <div className='space-y-6'>
        <div className='space-y-1.5 text-center'>
          <h1 className='text-xl font-medium text-foreground'>{t('登录')}</h1>
        </div>
        <PhoneAuthForm redirectTo={redirect} />
        <p className='text-center text-sm text-muted-foreground'>
          {t('没有账号？')}{' '}
          <Link to='/sign-up' className='text-[#7F77DD] hover:underline'>
            {t('注册')}
          </Link>
        </p>
      </div>
    </AuthLayout>
  )
}
