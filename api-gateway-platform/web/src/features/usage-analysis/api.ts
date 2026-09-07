import { api } from '@/lib/api'

export type UsageRow = {
  key: string
  count: number
  total_quota: number
  prompt_tokens: number
  completion_tokens: number
  total_tokens: number
  use_time: number
}

export type UsageOverview = {
  total_calls: number
  total_quota: number
  total_tokens: number
  active_users: number
  active_models: number
  active_channels: number
  avg_use_time_millis: number
}

function buildDaysParams(days: number): string {
  return `?days=${days}`
}

async function fetchRows(path: string, days: number): Promise<UsageRow[]> {
  const res = await api.get(`${path}${buildDaysParams(days)}`)
  return (res.data?.data as UsageRow[]) ?? []
}

export async function getOverview(days: number): Promise<UsageOverview> {
  const res = await api.get(`/api/usage-stats/overview${buildDaysParams(days)}`)
  return (res.data?.data as UsageOverview) ?? {}
}

export async function getByModel(days: number): Promise<UsageRow[]> {
  return fetchRows('/api/usage-stats/by-model', days)
}

export async function getByUser(days: number): Promise<UsageRow[]> {
  return fetchRows('/api/usage-stats/by-user', days)
}

export async function getByChannel(days: number): Promise<UsageRow[]> {
  return fetchRows('/api/usage-stats/by-channel', days)
}

export async function getTrend(days: number): Promise<UsageRow[]> {
  return fetchRows('/api/usage-stats/trend', days)
}
