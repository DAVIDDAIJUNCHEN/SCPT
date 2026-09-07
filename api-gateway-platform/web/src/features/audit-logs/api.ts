import { api } from '@/lib/api'

export const AUDIT_TYPE_MANAGE = 3 // 管理/高危操作审计
export const AUDIT_TYPE_LOGIN = 7 // 登录审计

export type AuditLogItem = {
  id: number
  user_id: number
  username: string
  type: number
  content: string
  created_at: number
  model_name?: string
  token_name?: string
  other?: string
  [key: string]: unknown
}

export type AuditLogsResponse = {
  success: boolean
  message?: string
  data?: {
    items?: AuditLogItem[]
    total?: number
    [key: string]: unknown
  }
}

/**
 * 查询审计日志（管理端 /api/log，AdminAuth 保护）
 * @param type 3=操作审计 7=登录日志
 * @param page 页码（从1开始）
 * @param pageSize 每页条数
 */
export async function getAuditLogs(
  type: number,
  page: number,
  pageSize: number
): Promise<AuditLogsResponse['data']> {
  const params = new URLSearchParams()
  params.append('type', String(type))
  params.append('p', String(page))
  params.append('page_size', String(pageSize))

  const res = await api.get(`/api/log?${params.toString()}`)
  return res.data?.data
}
