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
import { Link } from '@tanstack/react-router'

import { RichContent } from '@/components/rich-content'

const PRIVACY_MD = `
1. 我们通过以下方式收集信息：注册手机号、账号显示名称、API 调用记录（模型/时间/token 用量/消费配额）以及为保障安全而记录的访问日志（IP 地址、浏览器类型等）。我们仅在实现本政策目的所必需的范围内处理上述信息。

2. 我们收集的信息用于：账号注册与登录验证、API 调用计费与配额管理、服务运行监控与安全防护、以及改进服务体验与教学科研分析。

3. 您的个人信息存储于本平台服务器，我们采取必要的安全技术措施（加密、访问控制等）加以保护，并仅在实现目的所必需的期限内保留，超出期限将删除或匿名化处理。

4. 我们不会向任何第三方出售您的个人信息。仅在事先获得您的明确同意、依据法律法规或有权机关指令、或为保护我们或您合法权益所必需的情形下才可能披露。

5. 您对您的个人信息享有依法查询、更正、复制、删除以及撤回授权、注销账号等权利。您可通过平台联系我们提出请求，我们将在法律规定的期限内处理。

6. 本平台主要面向学院师生及成年授权用户。若您为未满 18 周岁的未成年人，请在监护人指导下使用本平台。

7. 我们可能不时更新本隐私政策，更新后在平台公示并标注生效日期；您继续使用本平台即视为接受更新后的政策。

8. 如对本隐私政策有任何疑问或建议，请联系四川邮电职业技术学院信息工程学院相关负责人。
`

export function PrivacyPolicy() {
  return (
    <div className='bg-background text-foreground min-h-svh px-4 py-10 sm:px-6'>
      <div className='mx-auto max-w-3xl'>
        <div className='mb-6 text-sm'>
          <Link
            to='/'
            className='text-[#7F77DD] hover:underline'
          >
            ← 返回平台
          </Link>
        </div>
        <h1 className='text-2xl font-semibold tracking-tight'>
          隐私政策
        </h1>
        <p className='text-muted-foreground mt-1 text-xs'>
          最近更新：2026 年 9 月 7 日 · 四川邮电职业技术学院
        </p>
        <RichContent
          mode='markdown'
          content={PRIVACY_MD}
          className='prose-neutral dark:prose-invert max-w-none'
        />
      </div>
    </div>
  )
}
