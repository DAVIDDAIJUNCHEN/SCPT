/*
Copyright (C) 2026 川邮星语 · AlloMax

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { useMutation } from '@tanstack/react-query'
import { useSearch } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'

import { AuthLayout } from '../auth/auth-layout'

interface OIDCAuthorizeResponse {
  success: boolean
  message?: string
  data?: {
    code: string
    state?: string
    expires_at: number
  }
}

export function OIDCAuthorizePage() {
  const { t } = useTranslation()
  const user = useAuthStore((s) => s.auth.user)
  const search = useSearch({ from: '/oidc/authorize' }) as {
    client_id: string
    redirect_uri: string
    state?: string
    scope?: string
    nonce?: string
    response_type?: string
  }

  const authorizeMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post<OIDCAuthorizeResponse>('/api/oidc/authorize', {
        client_id: search.client_id,
        redirect_uri: search.redirect_uri,
        state: search.state,
        scope: search.scope,
        nonce: search.nonce,
        response_type: search.response_type,
      })
      if (!res.data.success || !res.data.data?.code) {
        throw new Error(res.data.message || t('Authorization failed'))
      }
      return res.data.data
    },
    onSuccess: (data) => {
      const url = new URL(search.redirect_uri)
      url.searchParams.set('code', data.code)
      if (search.state) {
        url.searchParams.set('state', search.state)
      }
      window.location.href = url.toString()
    },
    onError: (error: Error) => {
      toast.error(error.message || t('Authorization failed, please retry'))
    },
  })

  const displayName = user?.display_name || user?.username || ''
  const clientName = search.client_id || t('third-party app')

  return (
    <AuthLayout>
      <div className='flex flex-col gap-5'>
        <div className='space-y-1.5'>
          <h1 className='text-xl font-semibold text-foreground'>
            {t('Authorize sign-in')}
          </h1>
          <p className='text-sm text-muted-foreground'>
            {t('The app will receive the following account info')}
          </p>
        </div>

        <div className='rounded-2xl border border-white/10 bg-[#070D1F]/60 p-4 space-y-3'>
          <div className='flex items-center gap-3'>
            <div className='flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#378ADD]/20 text-sm font-medium text-[#378ADD]'>
              {displayName ? displayName.slice(0, 1).toUpperCase() : '?'}
            </div>
            <div className='min-w-0'>
              <p className='truncate text-sm font-medium text-foreground'>
                {displayName}
              </p>
              {user?.email && (
                <p className='truncate text-xs text-muted-foreground'>
                  {user.email}
                </p>
              )}
            </div>
          </div>
          <div className='space-y-1.5 border-t border-white/10 pt-3 text-sm'>
            <p className='text-muted-foreground'>
              {t('After authorization, {{client}} will get these permissions', {
                client: clientName,
              })}
            </p>
            <ul className='space-y-1 text-foreground/90'>
              <li>· {t('Read your username and display name (profile)')}</li>
              <li>· {t('Read your email address (email)')}</li>
            </ul>
          </div>
        </div>

        <div className='flex flex-col gap-2.5'>
          <Button
            className='w-full'
            onClick={() => authorizeMutation.mutate()}
            disabled={authorizeMutation.isPending}
          >
            {authorizeMutation.isPending
              ? t('Authorizing...')
              : t('Approve and continue')}
          </Button>
          <Button
            variant='outline'
            className='w-full'
            onClick={() => {
              const url = new URL(search.redirect_uri)
              url.searchParams.set('error', 'access_denied')
              if (search.state) {
                url.searchParams.set('state', search.state)
              }
              window.location.href = url.toString()
            }}
            disabled={authorizeMutation.isPending}
          >
            {t('Deny')}
          </Button>
        </div>

        <p className='text-center text-xs text-muted-foreground/70'>
          {t('You will be redirected to {{redirect}}', {
            redirect: search.redirect_uri,
          })}
        </p>
      </div>
    </AuthLayout>
  )
}
