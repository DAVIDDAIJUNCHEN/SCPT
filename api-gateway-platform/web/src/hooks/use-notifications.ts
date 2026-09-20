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
import { useQuery } from '@tanstack/react-query'
import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { useStatus } from '@/hooks/use-status'
import { getNotice } from '@/lib/api'
import { useNotificationStore } from '@/stores/notification-store'

/**
 * 川邮·星语（#190）：Notice 双语解析。
 *
 * 存储约定：管理员在系统设置里可用分段标记存储双语公告——
 *
 *   [zh]
 *   中文内容
 *   [en]
 *   English content
 *
 * 解析规则：
 *  - 按行扫描，遇到 [zh] / [en] 标记即开始对应语言的段落，直到下一个标记或结尾
 *  - 目标语言段落为空 → 回退另一语言段落（英文用户看不到漏译的空公告）
 *  - 完全没有标记 → 视为单语原文，两种语言都显示全文（兼容历史数据）
 */
export function parseLocalizedNotice(raw: string): {
  zh: string
  en: string
} {
  const result = { zh: '', en: '' }
  if (!raw) return result

  const lines = raw.split(/\r?\n/)
  let current: 'zh' | 'en' | null = null
  let hasMarker = false

  for (const line of lines) {
    const marker = line.trim().match(/^\[(zh|en)\]$/)
    if (marker) {
      current = marker[1] as 'zh' | 'en'
      hasMarker = true
      continue
    }
    if (current) {
      result[current] += (result[current] ? '\n' : '') + line
    }
  }

  // 历史数据（无标记）：整段作为两种语言的共同内容
  if (!hasMarker) {
    return { zh: raw, en: raw }
  }

  return {
    zh: result.zh.trim(),
    en: result.en.trim(),
  }
}

/** 按当前界面语言选取展示内容（目标段为空回退另一段） */
export function pickLocalizedNotice(
  raw: string,
  language: string
): string {
  const { zh, en } = parseLocalizedNotice(raw)
  const isChinese = language.toLowerCase().startsWith('zh')
  if (isChinese) return zh || en
  return en || zh
}

function hashString(input: string): string {
  let hash = 0
  if (!input) return '0'

  for (let i = 0; i < input.length; i += 1) {
    const chr = input.charCodeAt(i)
    hash = (hash << 5) - hash + chr
    hash |= 0
  }

  return hash.toString(36)
}

/**
 * Generate a unique key for an announcement
 * Prefer backend id, fall back to a content hash so edits register
 */
function getAnnouncementKey(item: Record<string, unknown>): string {
  if (!item) return ''

  if (item.id !== undefined && item.id !== null) {
    return `id:${item.id}`
  }

  const fingerprint = JSON.stringify({
    publishDate: (item?.publishDate as string) || '',
    content: ((item?.content as string) || '').trim(),
    extra: ((item?.extra as string) || '').trim(),
    type: (item?.type as string) || '',
    title: ((item?.title as string) || '').trim(),
    link: ((item?.link as string) || '').trim(),
  })
  return `hash:${hashString(fingerprint)}`
}

/**
 * Hook to manage notifications (Notice + Announcements)
 * Provides unread counts and read status management
 */
export function useNotifications() {
  const { i18n } = useTranslation()
  const [popoverOpen, setPopoverOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<'notice' | 'announcements'>(
    'notice'
  )

  // Fetch Notice from API
  const {
    data: noticeResponse,
    isLoading: noticeLoading,
    refetch: refetchNotice,
  } = useQuery({
    queryKey: ['notice'],
    queryFn: getNotice,
    staleTime: 1000 * 60 * 5, // 5 minutes
  })

  // Fetch Announcements from status
  const { status, loading: statusLoading } = useStatus()
  const announcementsEnabled = status?.announcements_enabled ?? false
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const announcements: Record<string, unknown>[] = announcementsEnabled
    ? ((status?.announcements || []) as Record<string, unknown>[]).slice(0, 20)
    : []

  // Notification store
  const {
    lastReadNotice,
    markNoticeRead,
    markAnnouncementsRead,
    isAnnouncementRead,
  } = useNotificationStore()

  // Extract notice content (localized #190)
  const rawNotice = noticeResponse?.success
    ? (noticeResponse.data || '').trim()
    : ''
  const noticeContent = useMemo(
    () => pickLocalizedNotice(rawNotice, i18n.language),
    [rawNotice, i18n.language]
  )

  // Calculate unread counts
  const unreadCounts = useMemo(() => {
    const noticeUnread =
      noticeContent && noticeContent !== lastReadNotice ? 1 : 0

    const announcementsUnread = announcements.filter(
      (item: Record<string, unknown>) => {
        const key = getAnnouncementKey(item)
        return !isAnnouncementRead(key)
      }
    ).length

    return {
      notice: noticeUnread,
      announcements: announcementsUnread,
      total: noticeUnread + announcementsUnread,
    }
  }, [noticeContent, lastReadNotice, announcements, isAnnouncementRead])

  const markAnnouncementsAsRead = () => {
    if (announcements.length > 0) {
      const allKeys = announcements.map((item: Record<string, unknown>) =>
        getAnnouncementKey(item)
      )
      markAnnouncementsRead(allKeys)
    }
  }

  // Handle popover open
  const handleOpenPopover = (tab?: 'notice' | 'announcements') => {
    const nextTab = tab || activeTab

    // Mark currently visible content as read when opening the notification center
    if (noticeContent) {
      markNoticeRead(noticeContent)
    }
    if (nextTab === 'announcements') {
      markAnnouncementsAsRead()
    }

    setActiveTab(nextTab)
    setPopoverOpen(true)
  }

  const handlePopoverOpenChange = (open: boolean) => {
    if (open) {
      handleOpenPopover(activeTab)
      return
    }

    setPopoverOpen(false)
  }

  // Handle tab change - mark announcements as read when switching to that tab
  const handleTabChange = (tab: 'notice' | 'announcements') => {
    setActiveTab(tab)

    if (tab === 'announcements') {
      markAnnouncementsAsRead()
    }
  }

  return {
    // Data
    notice: noticeContent,
    announcements,
    loading: noticeLoading || statusLoading,

    // Unread counts
    unreadCount: unreadCounts.total,
    unreadNoticeCount: unreadCounts.notice,
    unreadAnnouncementsCount: unreadCounts.announcements,

    // Popover state
    popoverOpen,
    setPopoverOpen: handlePopoverOpenChange,
    activeTab,
    setActiveTab: handleTabChange,

    // Actions
    openPopover: handleOpenPopover,
    closePopover: () => setPopoverOpen(false),
    refetchNotice,
  }
}
