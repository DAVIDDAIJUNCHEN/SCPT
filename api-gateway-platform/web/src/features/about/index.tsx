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
import { useTranslation } from 'react-i18next'

import { PublicLayout } from '@/components/layout'
import { RichContent } from '@/components/rich-content'
import { Skeleton } from '@/components/ui/skeleton'
import { isHttpUrl, isLikelyHtml } from '@/lib/content-format'

import { getAboutContent } from './api'

function EmptyAboutState() {
  const currentYear = new Date().getFullYear()

  return (
    <div className='mx-auto max-w-3xl px-4 py-10 sm:px-6'>
      <div className='space-y-6'>
        <div>
          <h2 className='text-2xl font-semibold tracking-tight'>
            关于四川邮电职业技术学院智算中心
          </h2>
          <p className='text-muted-foreground mt-1 text-xs'>
            {currentYear} · 四川邮电职业技术学院智算中心
          </p>
        </div>

        <div className='prose-neutral dark:prose-invert max-w-none space-y-4 text-sm leading-relaxed'>
          <p>
            <strong>川邮·星语开放平台</strong>由四川邮电职业技术学院智算中心建设与运营，面向
            学院教学、科研与校内应用场景，提供大模型（文本对话、图像生成、语音合成、语音识别等）
            的统一 API 网关服务，覆盖模型接入、令牌管理、配额计费、用量统计与统一鉴权等能力。
          </p>

          <div>
            <h3 className='text-base font-semibold'>关于 New API 二次开发</h3>
            <p className='mt-2'>
              本平台软件基于开源项目{' '}
              <a
                href='https://github.com/QuantumNous/new-api'
                target='_blank'
                rel='noopener noreferrer'
                className='text-primary hover:underline'
              >
                New API
              </a>{' '}
              （继任自{' '}
              <a
                href='https://github.com/songquanpeng/one-api'
                target='_blank'
                rel='noopener noreferrer'
                className='text-primary hover:underline'
              >
                One API
              </a>
              ）进行二次开发，结合校内实际场景进行了功能扩展、品牌定制与界面调整。我们对上游开源
              社区及其维护者的工作表示感谢与尊重。
            </p>
          </div>

          <div>
            <h3 className='text-base font-semibold'>开源合规与许可声明</h3>
            <p className='mt-2'>
              本平台遵循{' '}
              <a
                href='https://github.com/QuantumNous/new-api/blob/main/LICENSE'
                target='_blank'
                rel='noopener noreferrer'
                className='text-primary hover:underline'
              >
                AGPL v3.0 License
              </a>{' '}
              开源协议进行二次开发与分发。依据 AGPL v3 的要求，本平台向公众开放：平台的派生
              软件源代码可以 AGPL v3 许可向使用者提供，使用者在获得本平台代码进行再分发或提供
              网络服务时，应当同时向使用者提供获取对应源代码的途径，并保留上游版权与许可声明。
            </p>
          </div>

          <div>
            <h3 className='text-base font-semibold'>免责声明</h3>
            <p className='mt-2'>
              本平台为校内教学、科研用途而建设，所接入各模型的版权与知识产权归属各模型提供方。
              平台不对模型生成内容的准确性、完整性或可靠性作任何明示或默示的保证，生成内容仅供
              您参考，不代表智算中心的立场或观点。
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

export function About() {
  const { t } = useTranslation()
  const { data, isLoading } = useQuery({
    queryKey: ['about-content'],
    queryFn: getAboutContent,
  })

  const rawContent = data?.data?.trim() ?? ''
  const hasContent = rawContent.length > 0
  const isUrl = hasContent && isHttpUrl(rawContent)
  const contentIsHtml = hasContent && isLikelyHtml(rawContent)

  if (isLoading) {
    return (
      <PublicLayout>
        <div className='mx-auto flex max-w-4xl flex-col gap-4 py-12'>
          <Skeleton className='h-8 w-[45%]' />
          <Skeleton className='h-4 w-full' />
          <Skeleton className='h-4 w-[90%]' />
          <Skeleton className='h-4 w-[80%]' />
        </div>
      </PublicLayout>
    )
  }

  if (!hasContent) {
    return (
      <PublicLayout>
        <EmptyAboutState />
      </PublicLayout>
    )
  }

  if (isUrl) {
    return (
      <PublicLayout showMainContainer={false}>
        <iframe
          src={rawContent}
          className='h-[calc(100vh-3.5rem)] w-full border-0'
          title={t('About')}
          sandbox='allow-forms allow-popups allow-popups-to-escape-sandbox allow-scripts'
        />
      </PublicLayout>
    )
  }

  if (contentIsHtml) {
    return (
      <PublicLayout showMainContainer={false}>
        <RichContent
          mode='html'
          htmlVariant='isolated'
          content={rawContent}
          className='prose-neutral dark:prose-invert max-w-none'
        />
      </PublicLayout>
    )
  }

  return (
    <PublicLayout>
      <div className='mx-auto max-w-6xl px-4 py-8'>
        <RichContent
          mode='markdown'
          content={rawContent}
          className='prose-neutral dark:prose-invert max-w-none'
        />
      </div>
    </PublicLayout>
  )
}
