import { useQuery } from '@tanstack/react-query'
import {
  Activity,
  Loader2,
  Boxes,
  Cable,
  Coins,
  Gauge,
  Hash,
  Users,
} from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

import {
  getByChannel,
  getByModel,
  getByUser,
  getOverview,
  getTrend,
  type UsageRow,
} from './api'

const DAY_OPTIONS = [
  { label: '近 7 天', value: 7 },
  { label: '近 30 天', value: 30 },
  { label: '近 90 天', value: 90 },
]

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: typeof Activity
  label: string
  value: string
  sub?: string
}) {
  return (
    <Card>
      <CardContent className='flex items-center gap-3 p-4'>
        <div className='bg-muted rounded-lg p-2'>
          <Icon className='text-primary h-5 w-5' />
        </div>
        <div className='min-w-0'>
          <p className='text-muted-foreground truncate text-xs'>{label}</p>
          <p className='text-lg font-semibold'>{value}</p>
          {sub ? <p className='text-muted-foreground text-[11px]'>{sub}</p> : null}
        </div>
      </CardContent>
    </Card>
  )
}

function UsageRowsTable({ rows }: { rows: UsageRow[] }) {
  const { t } = useTranslation()
  if (!rows || rows.length === 0) {
    return (
      <div className='flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground'>
        <Activity className='h-10 w-10' />
        <p className='text-sm'>{t('该时间范围内暂无用量数据')}</p>
      </div>
    )
  }
  const maxCount = Math.max(...rows.map((r) => r.count), 1)
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className='w-[40px]'>#</TableHead>
          <TableHead className='w-[60px]'>{t('占比')}</TableHead>
          <TableHead>{t('项')}</TableHead>
          <TableHead className='text-right'>{t('调用次数')}</TableHead>
          <TableHead className='text-right'>{t('消耗额度')}</TableHead>
          <TableHead className='text-right'>{t('Token')}</TableHead>
          <TableHead className='text-right'>{t('平均耗时(ms)')}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row, idx) => {
          const pct = Math.round((row.count / maxCount) * 100)
          return (
            <TableRow key={`${row.key}-${idx}`}>
              <TableCell className='text-muted-foreground text-xs'>
                {idx + 1}
              </TableCell>
              <TableCell>
                <div className='bg-muted h-2 w-16 overflow-hidden rounded-full'>
                  <div
                    className='bg-primary h-full rounded-full'
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </TableCell>
              <TableCell className='max-w-[220px]'>
                <span className='truncate'>{row.key}</span>
              </TableCell>
              <TableCell className='text-right font-medium'>
                {row.count}
              </TableCell>
              <TableCell className='text-right'>{row.total_quota}</TableCell>
              <TableCell className='text-right'>
                {row.total_tokens.toLocaleString()}
              </TableCell>
              <TableCell className='text-right text-muted-foreground'>
                {row.count ? Math.round(row.use_time / row.count) : 0}
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}

function TrendChart({ rows }: { rows: UsageRow[] }) {
  if (!rows || rows.length === 0) return null
  const max = Math.max(...rows.map((r) => r.count), 1)
  return (
    <div className='flex h-40 items-end gap-1'>
      {rows.map((row, idx) => {
        const h = Math.max(4, Math.round((row.count / max) * 150))
        return (
          <div
            key={idx}
            className='group flex flex-1 flex-col items-center gap-1'
            title={`${row.key}: ${row.count} 次 / ${row.total_tokens} token`}
          >
            <div
              className='bg-primary/80 w-full max-w-[32px] rounded-t transition-colors group-hover:bg-primary'
              style={{ height: h }}
            />
            <span className='text-muted-foreground w-full truncate text-center text-[9px]'>
              {row.key?.slice(5)}
            </span>
          </div>
        )
      })}
    </div>
  )
}

export function UsageAnalysis() {
  const { t } = useTranslation()
  const [days, setDays] = useState(7)
  const [tab, setTab] = useState('model')

  const overviewQ = useQuery({
    queryKey: ['usage-overview', days],
    queryFn: () => getOverview(days),
  })
  const modelQ = useQuery({
    queryKey: ['usage-model', days],
    queryFn: () => getByModel(days),
  })
  const userQ = useQuery({
    queryKey: ['usage-user', days],
    queryFn: () => getByUser(days),
  })
  const channelQ = useQuery({
    queryKey: ['usage-channel', days],
    queryFn: () => getByChannel(days),
  })
  const trendQ = useQuery({
    queryKey: ['usage-trend', days],
    queryFn: () => getTrend(days),
  })

  const ov = overviewQ.data ?? ({} as NonNullable<typeof overviewQ.data>)
  const rows =
    tab === 'model'
      ? (modelQ.data ?? [])
      : tab === 'user'
        ? (userQ.data ?? [])
        : (channelQ.data ?? [])
  const loading =
    tab === 'model'
      ? modelQ.isLoading
      : tab === 'user'
        ? userQ.isLoading
        : channelQ.isLoading

  return (
    <div className='mx-auto max-w-6xl px-4 py-8'>
      <div className='mb-6 flex items-center justify-between gap-4'>
        <div>
          <h2 className='text-2xl font-semibold tracking-tight'>
            {t('用量分析')}
          </h2>
          <p className='text-muted-foreground mt-1 text-sm'>
            {t('模型调用量 / 配额消耗 / Token 用量多维统计')}
          </p>
        </div>
        <Select
          value={String(days)}
          onValueChange={(v) => setDays(Number(v))}
        >
          <SelectTrigger className='w-[130px]'>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DAY_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={String(opt.value)}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {overviewQ.isLoading ? (
        <div className='flex items-center justify-center py-20'>
          <Loader2 className='h-8 w-8 animate-spin text-muted-foreground' />
        </div>
      ) : (
        <div className='grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6'>
          <StatCard
            icon={Activity}
            label={t('总调用次数')}
            value={String(ov.total_calls ?? 0)}
          />
          <StatCard
            icon={Coins}
            label={t('消耗额度')}
            value={String(ov.total_quota ?? 0)}
          />
          <StatCard
            icon={Hash}
            label={t('总 Token')}
            value={(ov.total_tokens ?? 0).toLocaleString()}
          />
          <StatCard
            icon={Gauge}
            label={t('平均耗时')}
            value={`${Math.round(ov.avg_use_time_millis ?? 0)}ms`}
          />
          <StatCard
            icon={Users}
            label={t('活跃用户')}
            value={String(ov.active_users ?? 0)}
          />
          <StatCard
            icon={Boxes}
            label={t('活跃模型')}
            value={String(ov.active_models ?? 0)}
            sub={`${t('渠道')} ${ov.active_channels ?? 0}`}
          />
        </div>
      )}

      <Card className='mt-6'>
        <CardHeader className='pb-2'>
          <CardTitle className='flex items-center gap-2 text-base'>
            <Cable className='h-4 w-4' />
            {t('按天调用趋势')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <TrendChart rows={trendQ.data ?? []} />
        </CardContent>
      </Card>

      <Card className='mt-6'>
        <CardHeader className='pb-2'>
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList>
              <TabsTrigger value='model'>{t('按模型')}</TabsTrigger>
              <TabsTrigger value='user'>{t('按用户')}</TabsTrigger>
              <TabsTrigger value='channel'>{t('按渠道')}</TabsTrigger>
            </TabsList>
          </Tabs>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className='flex items-center justify-center py-16'>
              <Loader2 className='h-8 w-8 animate-spin text-muted-foreground' />
            </div>
          ) : (
            <UsageRowsTable rows={rows} />
          )}
        </CardContent>
      </Card>
    </div>
  )
}
