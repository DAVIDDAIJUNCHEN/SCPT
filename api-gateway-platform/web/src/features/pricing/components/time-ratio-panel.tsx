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
import { Clock as ClockIcon, Info as InfoIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

import type { TimeRatioInfo, TimeRatioRule } from '../types'

interface TimeRatioPanelProps {
  info?: TimeRatioInfo
  className?: string
}

/** 把星期数组渲染为「周六日」这类紧凑文本；空表示不限。 */
function formatDays(days: number[] | undefined, t: (k: string) => string) {
  if (!days || days.length === 0) return t('Weekdays')
  const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const sorted = [...days].sort((a, b) => a - b)
  return sorted.map((d) => t(names[d] ?? '')).join('/')
}

/**
 * 倍率格式化：1 → "1x"、0.5 → "0.5x"、2 → "2x"、1.25 → "1.25x"。
 * 不用 toFixed + 正则去尾零——那样会把整数部分的零也吃掉（2.00 → "2"，
 * 但 10.00 会变成 "1"），这里显式分离整数与小数部分处理。
 */
function formatRatio(ratio: number) {
  const fixed = ratio.toFixed(2)
  const trimmed = fixed.includes('.')
    ? fixed.replace(/\.?0+$/, '')
    : fixed
  return `${trimmed}x`
}

/** 时段名 → 展示用的本地化标签与配色。 */
function describeTier(name: string, ratio: number) {
  if (name === 'PEAK' || ratio > 1) {
    return {
      labelKey: 'Peak hours',
      tone: 'text-rose-600 dark:text-rose-400',
      badge:
        'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300',
    }
  }
  if (name === 'VALLEY' || ratio < 1) {
    return {
      labelKey: 'Off-peak hours',
      tone: 'text-emerald-600 dark:text-emerald-400',
      badge:
        'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300',
    }
  }
  return {
    labelKey: 'Standard hours',
    tone: 'text-sky-600 dark:text-sky-400',
    badge:
      'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900/60 dark:bg-sky-950/40 dark:text-sky-300',
  }
}

/** 渲染 0-24 的时间轴条，标出该规则覆盖的区间。 */
function TimeBar(props: { rule: TimeRatioRule; tone: string }) {
  const { rule, tone } = props
  const start = rule.start_hour
  const end = rule.end_hour
  // 跨零点时拆成两段渲染，保证条形图视觉连续。
  const segments: { left: number; width: number }[] = []
  if (start >= 0 && start < end && end <= 24) {
    segments.push({ left: (start / 24) * 100, width: ((end - start) / 24) * 100 })
  } else {
    segments.push({ left: (start / 24) * 100, width: ((24 - start) / 24) * 100 })
    segments.push({ left: 0, width: (end / 24) * 100 })
  }

  return (
    <div className='bg-muted relative h-1.5 w-full overflow-hidden rounded-full'>
      {segments.map((seg, i) => (
        <span
          key={i}
          className={cn('absolute inset-y-0 rounded-full', tone)}
          style={{ left: `${seg.left}%`, width: `${seg.width}%` }}
        />
      ))}
    </div>
  )
}

/**
 * 时段倍率说明面板（星语 4.2）。
 *
 * 产品定价页此前只展示静态基准价，用户在工作日高峰实际被按 2 倍计费却无处
 * 获知，容易产生「被多扣费」的疑虑。这里把「当前处于什么时段、按几倍计价、
 * 全天的规则怎么划分」一次性讲清楚，消除报价与实收的信息差。
 */
export function TimeRatioPanel(props: TimeRatioPanelProps) {
  const { t } = useTranslation()
  const info = props.info

  // 未启用或后端未返回时，整块不渲染——不给用户看无意义的信息。
  if (!info || !info.enabled || info.rules.length === 0) return null

  const current = info.current
  const isSpecial = current.ratio !== 1
  const currentTier = describeTier(current.name, current.ratio)

  // location 在配置里是 string 类型（不经过 json.Unmarshal），若被误存成
  // 带引号的字面量 `"Asia/Shanghai"`，展示时会出现多余引号。这里做一次
  // 防御性清洗，避免脏配置直接暴露给用户。
  const cleanLocation = info.location?.trim().replace(/^["']|["']$/g, '') ?? ''

  return (
    <Card className={cn('overflow-hidden', props.className)}>
      <CardContent className='py-4 sm:py-5'>
        <div className='flex flex-wrap items-start justify-between gap-3'>
          <div className='flex items-start gap-2.5'>
            <ClockIcon className='text-muted-foreground mt-0.5 size-4 shrink-0' />
            <div>
              <div className='text-sm font-semibold'>
                {t('Time-based pricing')}
              </div>
              <div className='text-muted-foreground mt-0.5 text-xs'>
                {t(
                  'Prices vary by time of day. Peak hours cost more, off-peak hours cost less.'
                )}
              </div>
            </div>
          </div>

          <Badge
            variant='outline'
            className={cn('shrink-0 gap-1.5 px-2.5 py-1 text-xs font-medium', currentTier.badge)}
          >
            <span
              className={cn(
                'size-1.5 rounded-full',
                isSpecial ? 'animate-pulse bg-current' : 'bg-current opacity-50'
              )}
            />
            {t('Now')} {current.hour.toString().padStart(2, '0')}:00 ·{' '}
            {formatRatio(current.ratio)}
            {current.name ? ` ${current.name}` : ''}
          </Badge>
        </div>

        <div className='mt-4 space-y-3'>
          {info.rules.map((rule, idx) => {
            const tier = describeTier(rule.name, rule.ratio)
            const hit = current.name !== '' && current.name === rule.name
            return (
              <div key={`${rule.name}-${idx}`} className='space-y-1.5'>
                <div className='flex items-center justify-between gap-3 text-xs'>
                  <div className='flex min-w-0 items-center gap-2'>
                    <span
                      className={cn(
                        'shrink-0 rounded border px-1.5 py-0.5 font-mono text-[10px] font-semibold',
                        tier.badge
                      )}
                    >
                      {formatRatio(rule.ratio)}
                    </span>
                    <span className='truncate font-medium'>
                      {t(tier.labelKey)}
                      {rule.name ? (
                        <span className='text-muted-foreground/70 ml-1.5 font-mono text-[10px]'>
                          {rule.name}
                        </span>
                      ) : null}
                    </span>
                    {hit ? (
                      <span className='shrink-0 rounded bg-foreground px-1.5 py-0.5 text-[10px] font-medium text-background'>
                        {t('Active')}
                      </span>
                    ) : null}
                  </div>
                  <span
                    className={cn(
                      'shrink-0 font-mono text-[11px] tabular-nums',
                      tier.tone
                    )}
                  >
                    {formatDays(rule.days, t)}{' '}
                    {String(rule.start_hour).padStart(2, '0')}:00-
                    {String(rule.end_hour).padStart(2, '0')}:00
                  </span>
                </div>
                <TimeBar rule={rule} tone={tier.tone.replace('text-', 'bg-')} />
              </div>
            )
          })}
        </div>

        <div className='text-muted-foreground mt-4 flex items-start gap-1.5 border-t pt-3 text-[11px] leading-relaxed'>
          <InfoIcon className='mt-0.5 size-3 shrink-0' />
          <span>
            {t(
              'Prices shown are base rates for standard hours. Actual charge = base rate x current time multiplier x group discount.'
            )}
            {cleanLocation ? (
              <span className='text-muted-foreground/70 ml-1'>
                ({t('Timezone')}: {cleanLocation})
              </span>
            ) : null}
          </span>
        </div>
      </CardContent>
    </Card>
  )
}