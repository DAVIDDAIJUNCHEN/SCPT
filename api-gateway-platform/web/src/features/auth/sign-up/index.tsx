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
      <PhoneAuthForm initialView='register' />
    </AuthLayout>
  )
}
