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
import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import * as z from 'zod'

import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Textarea } from '@/components/ui/textarea'

import { SettingsForm } from '../components/settings-form-layout'
import { SettingsPageFormActions } from '../components/settings-page-context'
import { SettingsSection } from '../components/settings-section'
import { useUpdateOption } from '../hooks/use-update-option'

const noticeSchema = z.object({
  Notice: z.string().optional(),
  NoticeEn: z.string().optional(),
})

type NoticeFormValues = z.infer<typeof noticeSchema>

type NoticeSectionProps = {
  defaultValue: string
}

/**
 * 川邮·星语（#190）：Notice 双语编辑。
 *
 * 存储格式沿用 use-notifications.ts 的解析约定：
 *   [zh]\n中文内容\n[en]\nEnglish content
 * 管理界面拆成两个输入框，保存时拼回分段格式；
 * 读取时若为旧版单语数据（无 [zh]/[en] 标记）填入中文框。
 */
function splitNoticeStorage(raw: string): { zh: string; en: string } {
  if (!raw) return { zh: '', en: '' }
  if (!/^\[(zh|en)\]\s*$/m.test(raw)) return { zh: raw, en: '' }

  const zhMatch = raw.match(/^\[zh\]\s*\n([\s\S]*?)(?=\n\[en\]\s*$|$)/m)
  const enMatch = raw.match(/^\[en\]\s*\n([\s\S]*?)$/m)
  return {
    zh: (zhMatch?.[1] || '').trim(),
    en: (enMatch?.[1] || '').trim(),
  }
}

function joinNoticeStorage(zh: string, en: string): string {
  const parts: string[] = []
  if (zh.trim()) parts.push(`[zh]\n${zh.trim()}`)
  if (en.trim()) parts.push(`[en]\n${en.trim()}`)
  return parts.join('\n')
}

export function NoticeSection({ defaultValue }: NoticeSectionProps) {
  const { t } = useTranslation()
  const updateOption = useUpdateOption()
  const initial = splitNoticeStorage(defaultValue ?? '')
  const form = useForm<NoticeFormValues>({
    resolver: zodResolver(noticeSchema),
    defaultValues: {
      Notice: initial.zh,
      NoticeEn: initial.en,
    },
  })

  useEffect(() => {
    const next = splitNoticeStorage(defaultValue ?? '')
    form.reset({ Notice: next.zh, NoticeEn: next.en })
  }, [defaultValue, form])

  const onSubmit = async (values: NoticeFormValues) => {
    const normalized = joinNoticeStorage(values.Notice ?? '', values.NoticeEn ?? '')
    if (normalized === (defaultValue ?? '')) {
      return
    }
    await updateOption.mutateAsync({
      key: 'Notice',
      value: normalized,
    })
  }

  return (
    <SettingsSection title={t('System Notice')}>
      <Form {...form}>
        <SettingsForm onSubmit={form.handleSubmit(onSubmit)}>
          <SettingsPageFormActions
            onSave={form.handleSubmit(onSubmit)}
            isSaving={updateOption.isPending}
            saveLabel='Save notice'
          />
          <FormField
            control={form.control}
            name='Notice'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('Announcement content')}（中文）</FormLabel>
                <FormControl>
                  <Textarea
                    rows={8}
                    placeholder={t(
                      'Planned maintenance on Friday at 22:00 UTC...'
                    )}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name='NoticeEn'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('Announcement content')} (English)</FormLabel>
                <FormControl>
                  <Textarea
                    rows={8}
                    placeholder={t(
                      'Planned maintenance on Friday at 22:00 UTC...'
                    )}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </SettingsForm>
      </Form>
    </SettingsSection>
  )
}
