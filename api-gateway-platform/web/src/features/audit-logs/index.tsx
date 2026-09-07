import { useQuery } from '@tanstack/react-query'
import { ShieldCheck, LogIn, Loader2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'

import {
  AUDIT_TYPE_MANAGE,
  AUDIT_TYPE_LOGIN,
  getAuditLogs,
  type AuditLogItem,
} from './api'

type View = 'manage' | 'login'

function formatTime(ts: number): string {
  if (!ts) return '-'
  const d = new Date(ts * 1000)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

function AuditTable({ items }: { items: AuditLogItem[] }) {
  const { t } = useTranslation()
  if (!items || items.length === 0) {
    return (
      <div className='flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground'>
        <ShieldCheck className='h-10 w-10' />
        <p className='text-sm'>{t('暂无审计记录')}</p>
      </div>
    )
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className='w-[180px]'>{t('时间')}</TableHead>
          <TableHead className='w-[140px]'>{t('操作者')}</TableHead>
          <TableHead>{t('内容')}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((item) => (
          <TableRow key={item.id}>
            <TableCell className='whitespace-nowrap font-mono text-xs text-muted-foreground'>
              {formatTime(item.created_at)}
            </TableCell>
            <TableCell>
              <Badge variant='secondary'>{item.username || '-'}</Badge>
            </TableCell>
            <TableCell className='max-w-[560px]'>
              <span className='text-sm'>{item.content}</span>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

export function AuditLogs() {
  const { t } = useTranslation()
  const [view, setView] = useState<View>('manage')
  const [page, setPage] = useState(1)
  const pageSize = 20

  const type = view === 'manage' ? AUDIT_TYPE_MANAGE : AUDIT_TYPE_LOGIN
  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['audit-logs', type, page, pageSize],
    queryFn: () => getAuditLogs(type, page, pageSize),
  })

  const items = (data?.items as AuditLogItem[] | undefined) ?? []
  const total = Number(data?.total ?? 0)
  const pageCount = Math.max(1, Math.ceil(total / pageSize))

  const goPage = (p: number) => {
    if (p < 1 || p > pageCount) return
    setPage(p)
  }

  const pageNumbers: (number | 'ellipsis')[] = []
  for (let i = 1; i <= pageCount; i++) {
    if (i === 1 || i === pageCount || Math.abs(i - page) <= 1) {
      pageNumbers.push(i)
    } else if (pageNumbers[pageNumbers.length - 1] !== 'ellipsis') {
      pageNumbers.push('ellipsis')
    }
  }

  return (
    <div className='mx-auto max-w-6xl px-4 py-8'>
      <div className='mb-6 flex items-center justify-between'>
        <div>
          <h2 className='text-2xl font-semibold tracking-tight'>
            {view === 'manage' ? t('操作审计') : t('登录日志')}
          </h2>
          <p className='text-muted-foreground mt-1 text-sm'>
            {t('谁在何时做了什么操作，均自动记录留存')}
          </p>
        </div>
        <div className='flex items-center gap-2 text-muted-foreground'>
          {isFetching && <Loader2 className='h-4 w-4 animate-spin' />}
        </div>
      </div>

      <Tabs
        value={view}
        onValueChange={(v) => {
          setView(v as View)
          setPage(1)
        }}
      >
        <TabsList>
          <TabsTrigger value='manage' className='gap-2'>
            <ShieldCheck className='h-4 w-4' />
            {t('操作审计')}
          </TabsTrigger>
          <TabsTrigger value='login' className='gap-2'>
            <LogIn className='h-4 w-4' />
            {t('登录日志')}
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <div className='mt-4 rounded-lg border'>
        {isLoading ? (
          <div className='flex items-center justify-center py-16'>
            <Loader2 className='h-8 w-8 animate-spin text-muted-foreground' />
          </div>
        ) : (
          <AuditTable items={items} />
        )}
      </div>

      {total > 0 && (
        <div className='mt-4 flex items-center justify-between'>
          <p className='text-muted-foreground text-xs'>
            {t('共')} {total} {t('条')}
          </p>
          <Pagination>
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  aria-disabled={page <= 1}
                  className={page <= 1 ? 'pointer-events-none opacity-50' : ''}
                  onClick={() => goPage(page - 1)}
                />
              </PaginationItem>
              {pageNumbers.map((p, idx) =>
                p === 'ellipsis' ? (
                  <PaginationItem key={`e-${idx}`}>
                    <PaginationEllipsis />
                  </PaginationItem>
                ) : (
                  <PaginationItem key={p}>
                    <PaginationLink
                      isActive={p === page}
                      onClick={() => goPage(p)}
                    >
                      {p}
                    </PaginationLink>
                  </PaginationItem>
                )
              )}
              <PaginationItem>
                <PaginationNext
                  aria-disabled={page >= pageCount}
                  className={
                    page >= pageCount ? 'pointer-events-none opacity-50' : ''
                  }
                  onClick={() => goPage(page + 1)}
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </div>
      )}
    </div>
  )
}
