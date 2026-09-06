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
import {
  Hash,
  Coins,
  Layers,
  Gauge,
  Zap,
  TrendingUp,
  Activity,
  type LucideIcon,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'

import type { IconBadgeTone } from '@/components/ui/icon-badge'
import { safeDivide } from '@/features/dashboard/lib'
import { formatNumber, formatQuota } from '@/lib/format'

interface StatCardConfig {
  key: string
  title: string
  description: string
  icon: LucideIcon
  iconTone: IconBadgeTone
  getValue: (stat: Record<string, number>, days?: number) => number
}

export function useModelStatCardsConfig(): StatCardConfig[] {
  const { t } = useTranslation()

  return [
    {
      key: 'count',
      title: t('Total Count'),
      description: t('Statistical count'),
      icon: Hash,
      iconTone: 'info',
      getValue: (stat) => stat?.rpm ?? 0,
    },
    {
      key: 'quota',
      title: t('Total Quota'),
      description: t('Statistical quota'),
      icon: Coins,
      iconTone: 'success',
      getValue: (stat) => stat?.quota ?? 0,
    },
    {
      key: 'tokens',
      title: t('Total Tokens'),
      description: t('Statistical tokens'),
      icon: Layers,
      iconTone: 'chart-4',
      getValue: (stat) => stat?.tpm ?? 0,
    },
    {
      key: 'avgRpm',
      title: t('Average RPM'),
      description: t('Requests per minute'),
      icon: Gauge,
      iconTone: 'chart-2',
      getValue: (stat, timeRangeMinutes = 1) =>
        safeDivide(stat?.rpm ?? 0, timeRangeMinutes),
    },
    {
      key: 'avgTpm',
      title: t('Average TPM'),
      description: t('Tokens per minute'),
      icon: Zap,
      iconTone: 'warning',
      getValue: (stat, timeRangeMinutes = 1) =>
        safeDivide(stat?.tpm ?? 0, timeRangeMinutes),
    },
  ]
}

export function useSummaryCardsConfig(totals: {
  todayUsageDisplay: string
  usedDisplay: string
  requestCountDisplay: string
  currencyLabel: string
  currencyEnabled: boolean
  monthQuota: number
  monthCount: number
  monthTokens: number
  monthLoading: boolean
}) {
  const { t } = useTranslation()

  return [
    {
      key: 'monthConsumption',
      title: t('本月消费'),
      value: totals.monthLoading
        ? '…'
        : totals.currencyEnabled
          ? formatQuota(totals.monthQuota)
          : formatNumber(totals.monthQuota),
      description: t('本月累计消费金额'),
      icon: Coins,
    },
    {
      key: 'monthRequests',
      title: t('本月调用次数'),
      value: totals.monthLoading
        ? '…'
        : formatNumber(totals.monthCount),
      description: t('本月 API 调用次数'),
      icon: Activity,
    },
    {
      key: 'monthTokens',
      title: t('本月消耗 token'),
      value: totals.monthLoading
        ? '…'
        : formatNumber(totals.monthTokens),
      description: t('本月输入 + 输出 token 总数'),
      icon: Layers,
    },
    {
      key: 'cumulative',
      title: t('累计消费'),
      value: totals.usedDisplay,
      description: totals.currencyEnabled
        ? `${t('历史累计消费')} (${totals.currencyLabel})`
        : t('历史累计消耗'),
      icon: TrendingUp,
    },
  ]
}
