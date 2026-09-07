import { createFileRoute, redirect } from '@tanstack/react-router'

import { UsageAnalysis } from '@/features/usage-analysis'
import { ROLE } from '@/lib/roles'
import { useAuthStore } from '@/stores/auth-store'

export const Route = createFileRoute('/_authenticated/usage-analysis/')({
  beforeLoad: () => {
    const { auth } = useAuthStore.getState()

    if (!auth.user || auth.user.role < ROLE.ADMIN) {
      throw redirect({
        to: '/403',
      })
    }
  },
  component: UsageAnalysis,
})
