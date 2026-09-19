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
import { createFileRoute, redirect } from '@tanstack/react-router'
import { z } from 'zod'

import { lazyAuthRoute } from '@/features/auth/lib/lazy-auth-route'
import { sanitizeAuthRedirect } from '@/features/auth/lib/auth-redirect'
import { useAuthStore } from '@/stores/auth-store'

// 川邮·星语（2026-09-19）：登录页懒加载，从 3.5MB 首屏主包里切出去。
// 首屏只加载框架与路由骨架，登录组件成独立 async chunk 按需拉取。
// 详见 @/features/auth/lib/lazy-auth-route.tsx 的背景说明。
const SignInRoute = lazyAuthRoute(
  () => import('@/features/auth/sign-in'),
  'SignIn'
)

const searchSchema = z.object({
  redirect: z.string().optional(),
})

export const Route = createFileRoute('/(auth)/sign-in')({
  component: SignInRoute,
  validateSearch: searchSchema,
  beforeLoad: async ({ search }) => {
    const { auth } = useAuthStore.getState()

    // 如果已经有用户信息，说明已登录
    if (auth.user) {
      const target =
        sanitizeAuthRedirect(search?.redirect, window.location.origin) ??
        '/dashboard'
      throw redirect({ href: target, replace: true })
    }
  },
})
