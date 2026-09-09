/*
Copyright (C) 2026 川邮星语 · AlloMax

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { AuthLayout } from '../auth-layout'
import { PhoneAuthForm } from '../sign-in/components/phone-auth-form'

export function SignUp() {
  return (
    <AuthLayout>
      {/* 川邮·星语：sign-up 路由与 sign-in 统一默认密码登录，
          注册通过登录页"立即注册"入口进入，避免一进来就是注册页 */}
      <PhoneAuthForm initialView='login' />
    </AuthLayout>
  )
}
