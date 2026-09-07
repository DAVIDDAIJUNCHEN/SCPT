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

const AGREEMENT_MD = `
# 四川邮电职业技术学院「川邮·星语」开放平台服务协议

**生效日期：2026 年 9 月**

欢迎使用由四川邮电职业技术学院信息工程学院建设与运营的人工智能开放平台「川邮·星语」（以下简称"本平台"）。本平台向学院师生及授权用户提供大模型 API 接入与调用能力。**注册、登录或使用本平台，即表示您已阅读、理解并同意本协议的全部内容。**

## 一、服务说明

1. 本平台基于 New API 开源项目（AGPL v3）二次开发，面向四川邮电职业技术学院教学、科研与校内应用场景，提供大模型（文本对话、图像生成、语音合成、语音识别等）的 API 网关服务。
2. 本平台在"按现状"和"按可用"的基础上提供服务，不承诺特定模型在任意时刻均可用。
3. 您应自行评估并将本平台用于合法、与教学科研相关的用途。

## 二、账号与注册

1. 您应通过本人真实、有效的手机号完成注册。注册信息必须真实、准确、完整。
2. 您应对账号下发生的所有行为承担责任，不得将账号出借、转让或用于任何违反本协议的活动。
3. 若您的账号用于非教学科研或违反法律法规的用途，本平台有权暂停或终止服务。

## 三、API Key 与使用规范

1. API Key（令牌）是您访问本平台模型能力的凭证，应妥善保管，不得泄露给未授权第三方。
2. 您不得恶意抓取、攻击、干扰本平台服务，不得绕过平台的限流、配额与安全机制。
3. 本平台会通过限流（RPM/TPM/并发）、配额等方式对调用进行管理，请据此合理使用。

## 四、配额、充值与费用

1. 平台采用"配额"体系计量调用量。注册用户可获赠初始配额；超出部分需通过兑换码等方式充值获取。
2. 平台当前的模型计费将不定期调整，调整后以平台内置价目表为准。
3. 配额一经使用或兑换，一般不退、不换，法律法规另有规定或平台另有承诺的除外。

## 五、知识产权

1. 本平台软件基于 New API（AGPL v3）二次开发，遵循相应开源协议。
2. 您通过本平台生成的内容，其产生的知识产权归属及合规责任由您自行判断与承担。
3. 未经许可，不得对本平台进行反向工程、二次分发或用于商业性转售。

## 六、内容合规

1. 您不得利用本平台生成、传播侵犯他人权益、危害国家安全、违反法律法规或公序良俗的内容。
2. 平台有权依法对违规内容进行处理，并保留向有关部门报告的权利。

## 七、隐私保护

我们重视您的个人信息保护，具体请查阅《隐私政策》。我们会依法并遵循最小必要原则处理您的个人信息。

## 八、免责声明

1. 因不可抗力、网络故障、第三方服务中断等原因导致服务异常或数据丢失的，本平台不承担责任。
2. 本平台不对大模型生成内容的准确性、完整性、可靠性作任何明示或默示的保证。

## 九、协议变更与终止

1. 本平台可不时修订本协议，修订后将在平台公示；您继续使用本平台即视为接受修订后的协议。
2. 您可随时停止使用本平台；平台在您严重违约或依法需终止时，有权终止服务。

## 十、联系我们

如对本协议有任何疑问，请联系四川邮电职业技术学院信息工程学院相关负责人。
`

export function UserAgreement() {
  const { t } = useTranslation()
  return (
    <PublicLayout>
      <div className='mx-auto max-w-4xl space-y-6 py-12 px-4 sm:px-6'>
        <h1 className='text-2xl font-semibold tracking-tight'>
          {t('四川邮电职业技术学院「川邮·星语」开放平台服务协议')}
        </h1>
        <RichContent
          mode='markdown'
          content={AGREEMENT_MD}
          className='prose-neutral dark:prose-invert max-w-none'
        />
      </div>
    </PublicLayout>
  )
}
