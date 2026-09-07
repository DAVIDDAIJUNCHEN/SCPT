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
import { useTranslation } from 'react-i18next'

import { PublicLayout } from '@/components/layout'
import { RichContent } from '@/components/rich-content'

const PRIVACY_MD = `
# 四川邮电职业技术学院「川邮·星语」隐私政策

**生效日期：2026 年 9 月**

四川邮电职业技术学院信息工程学院（以下简称"我们"）十分重视您的个人信息与隐私保护。本隐私政策旨在向您说明「川邮·星语」开放平台（以下简称"本平台"）如何收集、使用、存储和保护您的个人信息。**注册、登录或使用本平台，即表示您理解并同意本政策。**

## 一、我们收集的信息

1. **注册信息**：您注册时提供的手机号码（用于账号注册与登录验证）。
2. **账号信息**：您在个人中心设置的显示名称、密码（加密存储）等信息。
3. **使用信息**：您对本平台的调用记录，包括调用的模型、时间、token 用量、消费配额等，用于计费与用量统计。
4. **设备与日志信息**：为保障服务安全，我们可能记录 IP 地址、浏览器类型等访问日志信息。

## 二、我们如何使用信息

1. 用于账号的注册、验证、登录与安全维护。
2. 用于 API 调用计费、配额管理与用量统计。
3. 用于服务的运行监控、安全防护与故障排查。
4. 在法律允许范围内，用于改进服务体验与教学科研分析。

## 三、存储与保护

1. 您的个人信息存储于本平台服务器，我们采取必要的安全技术措施（如加密、访问控制）加以保护。
2. 我们仅在实现本政策所述目的所必需的期限内保留您的个人信息，超出期限将进行删除或匿名化处理。

## 四、共享与披露

我们不会向任何第三方出售您的个人信息。仅在以下情形下可能披露：

1. 事先获得您的明确同意或授权。
2. 依据法律法规、监管要求或有权机关的合法指令。
3. 为保护我们、您或其他主体的合法权益所必需。

## 五、您的权利

您有权依法查询、更正、复制、删除您的个人信息，或撤回授权、注销账号。您可通过"联系我们"一节向学院提出请求，我们将在法律规定的期限内予以处理。

## 六、未成年人保护

本平台主要面向学院师生及成年授权用户。若您为未满 18 周岁的未成年人，请在监护人指导下使用本平台。

## 七、政策更新

我们可能不时更新本隐私政策，更新后将在平台公示，并在显著位置标注生效日期。您继续使用本平台即视为接受更新后的政策。

## 八、联系我们

如对本隐私政策有任何疑问或建议，请联系四川邮电职业技术学院信息工程学院相关负责人。
`

export function PrivacyPolicy() {
  const { t } = useTranslation()
  return (
    <PublicLayout>
      <div className='mx-auto max-w-4xl space-y-6 py-12 px-4 sm:px-6'>
        <h1 className='text-2xl font-semibold tracking-tight'>
          {t('四川邮电职业技术学院「川邮·星语」隐私政策')}
        </h1>
        <RichContent
          mode='markdown'
          content={PRIVACY_MD}
          className='prose-neutral dark:prose-invert max-w-none'
        />
      </div>
    </PublicLayout>
  )
}
