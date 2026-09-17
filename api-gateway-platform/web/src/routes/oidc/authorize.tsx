/*
Copyright (C) 2026 川邮星语 · AlloMax

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { createFileRoute, redirect } from '@tanstack/react-router'
import { z } from 'zod'

import { OIDCAuthorizePage } from '@/features/oidc/authorize'

const searchSchema = z.object({
  client_id: z.string(),
  redirect_uri: z.string(),
  state: z.string().optional(),
  scope: z.string().optional(),
  nonce: z.string().optional(),
  response_type: z.string().optional(),
})

export const Route = createFileRoute('/oidc/authorize')({
  component: OIDCAuthorizePage,
  validateSearch: searchSchema,
  beforeLoad: async ({ search }) => {
    // 未登录 → 跳登录页并携带回跳参数，登录后自动回到授权页
    const auth = (await import('@/stores/auth-store')).useAuthStore.getState().auth
    if (!auth.user) {
      const target = encodeURIComponent(
        `/oidc/authorize?client_id=${encodeURIComponent(search.client_id)}&redirect_uri=${encodeURIComponent(search.redirect_uri)}` +
          (search.state ? `&state=${encodeURIComponent(search.state)}` : '') +
          (search.scope ? `&scope=${encodeURIComponent(search.scope)}` : '') +
          (search.nonce ? `&nonce=${encodeURIComponent(search.nonce)}` : '') +
          (search.response_type
            ? `&response_type=${encodeURIComponent(search.response_type)}`
            : '')
      )
      throw redirect({ href: `/sign-in?redirect=${target}`, replace: true })
    }
  },
})
