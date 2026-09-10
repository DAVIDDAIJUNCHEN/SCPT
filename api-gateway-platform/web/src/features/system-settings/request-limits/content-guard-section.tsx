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
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'

import {
  SettingsForm,
  SettingsSwitchContent,
  SettingsSwitchItem,
} from '../components/settings-form-layout'
import { SettingsPageFormActions } from '../components/settings-page-context'
import { SettingsSection } from '../components/settings-section'
import { useUpdateOption } from '../hooks/use-update-option'

const contentGuardSchema = z.object({
  ContentGuardEnabled: z.boolean(),
  ContentGuardPIIRedact: z.boolean(),
  ContentGuardHarmfulBlock: z.boolean(),
  ContentGuardInjectionBlock: z.boolean(),
  ContentGuardOutputBlock: z.boolean(),
  ContentGuardBlockMode: z.string(),
  ContentGuardHistorySanitize: z.boolean(),
  ContentGuardSanitizePlaceholder: z.string().optional(),
  ContentGuardRefusalTemplate: z.string().optional(),
  ContentGuardHarmfulWords: z.string().optional(),
  ContentGuardInjectionWords: z.string().optional(),
  ContentGuardOutputWords: z.string().optional(),
})

type ContentGuardFormValues = z.infer<typeof contentGuardSchema>

type ContentGuardSectionProps = {
  defaultValues: ContentGuardFormValues
}

export function ContentGuardSection({
  defaultValues,
}: ContentGuardSectionProps) {
  const { t } = useTranslation()
  const updateOption = useUpdateOption()
  const form = useForm<ContentGuardFormValues>({
    resolver: zodResolver(contentGuardSchema),
    defaultValues,
  })

  useEffect(() => {
    form.reset(defaultValues)
  }, [defaultValues, form])

  const onSubmit = async (values: ContentGuardFormValues) => {
    const updates = Object.entries(values).filter(
      ([key, value]) =>
        value !== defaultValues[key as keyof ContentGuardFormValues]
    )

    for (const [key, value] of updates) {
      await updateOption.mutateAsync({ key, value: value ?? '' })
    }
  }

  return (
    <SettingsSection title={t('内容管控（ContentGuard）')}>
      <Form {...form}>
        <SettingsForm onSubmit={form.handleSubmit(onSubmit)}>
          <SettingsPageFormActions
            onSave={form.handleSubmit(onSubmit)}
            isSaving={updateOption.isPending}
            saveLabel='Save content guard settings'
          />
          <div className='space-y-4'>
            <FormField
              control={form.control}
              name='ContentGuardEnabled'
              render={({ field }) => (
                <SettingsSwitchItem>
                  <SettingsSwitchContent>
                    <FormLabel>{t('总开关')}</FormLabel>
                    <FormDescription>
                      {t(
                        '关闭时以下分项全部不生效（可作为一键回滚）。注意：只开总开关、分项全关等于未启用任何能力。'
                      )}
                    </FormDescription>
                  </SettingsSwitchContent>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </SettingsSwitchItem>
              )}
            />

            <FormField
              control={form.control}
              name='ContentGuardPIIRedact'
              render={({ field }) => (
                <SettingsSwitchItem>
                  <SettingsSwitchContent>
                    <FormLabel>{t('PII 脱敏（输入侧）')}</FormLabel>
                    <FormDescription>
                      {t(
                        '手机号 / 身份证 / 银行卡替换为占位符后放行，模型不会收到原文（正常计费）。'
                      )}
                    </FormDescription>
                  </SettingsSwitchContent>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </SettingsSwitchItem>
              )}
            />

            <FormField
              control={form.control}
              name='ContentGuardHarmfulBlock'
              render={({ field }) => (
                <SettingsSwitchItem>
                  <SettingsSwitchContent>
                    <FormLabel>{t('有害内容拦截（输入侧）')}</FormLabel>
                    <FormDescription>
                      {t(
                        '命中下方有害词表即拦截，不调用模型、不计费，并写入拦截审计日志。返回形式由下方「拦截呈现方式」决定。'
                      )}
                    </FormDescription>
                  </SettingsSwitchContent>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </SettingsSwitchItem>
              )}
            />

            <FormField
              control={form.control}
              name='ContentGuardInjectionBlock'
              render={({ field }) => (
                <SettingsSwitchItem>
                  <SettingsSwitchContent>
                    <FormLabel>{t('注入检测（输入侧）')}</FormLabel>
                    <FormDescription>
                      {t(
                        '检测“忽略之前 / 越狱 / jailbreak”等提示注入特征，命中即拦截且不计费。'
                      )}
                    </FormDescription>
                  </SettingsSwitchContent>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </SettingsSwitchItem>
              )}
            />

            <FormField
              control={form.control}
              name='ContentGuardOutputBlock'
              render={({ field }) => (
                <SettingsSwitchItem>
                  <SettingsSwitchContent>
                    <FormLabel>{t('输出侧拦截')}</FormLabel>
                    <FormDescription>
                      {t(
                        '检查模型输出，命中下方输出词表即拦截（商业合规常用）。命中后按「拦截呈现方式」返回合规提示或错误码。'
                      )}
                    </FormDescription>
                  </SettingsSwitchContent>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </SettingsSwitchItem>
              )}
            />
          </div>

          <FormField
            control={form.control}
            name='ContentGuardHistorySanitize'
            render={({ field }) => (
              <SettingsSwitchItem>
                <SettingsSwitchContent>
                  <FormLabel>{t('会话防污染：历史消息净化（强烈建议开启）')}</FormLabel>
                  <FormDescription>
                    {t(
                      '开启后只拦截「本次新输入」，历史消息里命中的内容会被替换为占位符后照常转发。关闭后任意位置命中即整单拦截——注意：客户端会持续重发完整会话历史，这会导致某一轮违规后整个任务窗口永久不可用（Agent 类客户端尤其明显）。净化只是不告知用户，被剔除的内容同样不会到达模型。'
                    )}
                  </FormDescription>
                </SettingsSwitchContent>
                <FormControl>
                  <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                </FormControl>
              </SettingsSwitchItem>
            )}
          />

          <FormField
            control={form.control}
            name='ContentGuardSanitizePlaceholder'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('净化占位符')}</FormLabel>
                <FormControl>
                  <Textarea
                    rows={2}
                    placeholder={t('【内容已被安全策略屏蔽】')}
                    {...field}
                  />
                </FormControl>
                <FormDescription>
                  {t(
                    '历史消息中被屏蔽内容的替换文本。留空则使用默认值。'
                  )}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name='ContentGuardBlockMode'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('拦截呈现方式')}</FormLabel>
                <Select
                  items={[
                    {
                      value: 'message',
                      label: t('返回合规提示（推荐）'),
                    },
                    {
                      value: 'error',
                      label: t('返回错误码（4xx）'),
                    },
                  ]}
                  onValueChange={field.onChange}
                  value={field.value || 'message'}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent alignItemWithTrigger={false}>
                    <SelectGroup>
                      <SelectItem value='message'>
                        {t('返回合规提示（推荐）')}
                      </SelectItem>
                      <SelectItem value='error'>
                        {t('返回错误码（4xx）')}
                      </SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
                <FormDescription>
                  {t(
                    '命中拦截后如何返回给用户：选「返回合规提示」时以 HTTP 200 返回一条助手回复（如"你的提问未通过内容安全策略，已被拦截"），客户端不会显示服务故障；选「返回错误码」则返回 4xx 错误对象，适合程序化调用方按错误码处理。两种方式都不调用模型、不计费，并都会写入拦截审计日志。'
                  )}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name='ContentGuardRefusalTemplate'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('合规提示文案模板')}</FormLabel>
                <FormControl>
                  <Textarea
                    rows={3}
                    placeholder={t(
                      '抱歉，你的提问未通过平台内容安全策略（%s），已被拦截。'
                    )}
                    {...field}
                  />
                </FormControl>
                <FormDescription>
                  {t(
                    '%s 会被替换为具体拦截原因（如"有害内容: 制作炸弹"）。留空则使用默认文案。'
                  )}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name='ContentGuardHarmfulWords'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('有害内容词表')}</FormLabel>
                <FormControl>
                  <Textarea
                    rows={6}
                    placeholder={t('一行一个词')}
                    {...field}
                  />
                </FormControl>
                <FormDescription>
                  {t('命中即拦截。留空则该分项不生效。')}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name='ContentGuardInjectionWords'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('注入检测特征词')}</FormLabel>
                <FormControl>
                  <Textarea
                    rows={6}
                    placeholder={t('一行一个特征词')}
                    {...field}
                  />
                </FormControl>
                <FormDescription>
                  {t('英文特征词不区分大小写。')}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name='ContentGuardOutputWords'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('输出侧高风险词')}</FormLabel>
                <FormControl>
                  <Textarea
                    rows={6}
                    placeholder={t('一行一个词')}
                    {...field}
                  />
                </FormControl>
                <FormDescription>
                  {t(
                    '模型输出命中即拦截且不计费。商业/金融场景建议加入“保本保息、稳赚不赔”等承诺性表述。'
                  )}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </SettingsForm>
      </Form>
    </SettingsSection>
  )
}
