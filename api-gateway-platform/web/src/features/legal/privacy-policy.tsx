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
import { useTranslation } from 'react-i18next'

import { RichContent } from '@/components/rich-content'

const PRIVACY_MD = `
**更新日期：2026 年 9 月 7 日**
**生效日期：2026 年 9 月 7 日**

四川邮电职业技术学院智算中心（以下简称"我们"或"智算中心"）深知个人信息对您的重要性，我们将按照法律法规要求，采取相应安全保护措施，尽力保护您的个人信息安全可控。请您在使用川邮·星语开放平台（以下简称"本平台"）前，仔细阅读并理解本隐私政策。

## 一、我们如何收集和使用您的个人信息

我们仅在本政策所述目的所必需的范围内收集和使用您的个人信息，并遵循合法、正当、必要和诚信原则。

**1. 账号注册、登录、认证**

当您注册或登录本平台时，我们会收集您的手机号码、账号显示名称、登录密码（加密存储）等信息，用于完成账号注册、登录验证及账户安全管理。您也可以使用平台提供的其他登录方式完成认证。

**2. API 调用与使用记录**

当您使用本平台调用模型服务时，我们会记录必要的调用信息，包括：调用的模型名称、调用时间、输入输出内容（仅在为您提供对话服务所必需时短暂处理）、Token 用量、消费配额等，用于实现 API 计费、配额管理、用量统计与异常监控。

**3. 运营与安全保障**

为保障平台安全稳定运行、防范网络攻击与不当使用，我们会记录必要的访问日志，包括 IP 地址、浏览器类型及版本、操作系统、访问时间、访问页面等，用于安全防护、故障排查与审计。

**4. 收集、使用个人信息的其他规则**

（1）如我们超出本政策范围收集、使用您的个人信息，我们会另行向您说明并征得您的同意；（2）根据法律法规的规定，以下情形中收集、使用您的个人信息无需征得您的授权同意：与国家安全、国防安全直接相关的；与公共安全、公共卫生、重大公共利益直接相关的；与犯罪侦查、起诉、审判和判决执行等直接相关的；出于维护您或其他个人的生命、财产等重大合法权益但又很难得到本人同意的；所涉及的个人信息是您自行向社会公众公开的；从合法公开披露的信息中收集的；法律法规规定的其他情形。

## 二、我们如何使用 Cookie 和同类技术

为改善您在本平台的访问体验，我们可能会使用 Cookie 及同类技术，用于维持登录状态、记住部分界面偏好、保障登录安全性等。您可以通过浏览器设置管理或清除 Cookie；如您禁用 Cookie，本平台部分功能可能无法正常使用。

## 三、我们如何委托处理、共享、转让、公开披露您的个人信息

1. **数据共享的原则**。我们不会向任何第三方出售您的个人信息。除以下情形外，我们不会与任何公司、组织或个人共享您的个人信息：（1）在获取您的明确同意后共享；（2）根据法律法规规定或有权机关要求共享；（3）为保护平台、您或其他个人合法权益所必需。
2. **实现功能或服务的数据使用**。为向您提供 API 网关服务，我们可能会将必要的调用信息提供给为您提供服务的模型提供方；此类共享仅以实现本平台功能所必需为限，并要求相关方遵守保密义务。
3. **转移**。如发生合并、收购、资产转让等情形导致个人信息控制者变更的，我们将要求继受方继续受本政策约束，否则我们将要求其重新征得您的授权同意。
4. **公开**。我们不会公开披露您的个人信息，法律法规另有规定或经您单独同意除外。
5. **事先征得授权同意的例外**。根据法律法规规定，下列情形中我们共享、转让、公开披露您的个人信息无需事先征得您的授权同意：与国家安全、国防安全直接相关；与公共安全、公共卫生、重大公共利益直接相关；与犯罪侦查、起诉、审判和判决执行等直接相关；出于维护您或其他个人的生命、财产等重大合法权益但又很难得到本人同意的；您自行向社会公众公开的个人信息；从合法公开披露的信息中收集的；法律法规规定的其他情形。

## 四、我们如何保护您的个人信息

1. 我们采用符合行业标准的安全防护措施保护您的个人信息，包括但不限于传输加密（HTTPS）、存储加密、访问控制、权限管理、日志审计等。
2. 我们建立了数据安全管理制度，对处理个人信息的员工实行最小权限管理，并对接触个人信息的场景进行记录与审计。
3. 如不幸发生个人信息安全事件，我们将按照法律法规要求，及时以邮件、短信、站内推送或公告等方式告知您安全事件的基本情况和可能的影响、我们已采取或将要采取的处理措施等，并视情况向有关主管部门报告。

## 五、我们如何存储您的个人信息

1. **存储信息的地点**。我们依照法律法规规定，将在中国境内存储您的个人信息，不会向境外传输。
2. **存储信息的期限**。我们仅在实现本政策目的所必需的最短期限内保留您的个人信息，超出保留期限后，我们将对相关个人信息进行删除或匿名化处理。法律法规另有规定的，从其规定。

## 六、您如何实现管理您个人信息的权利

1. **您的个人信息权利**。您对您的个人信息依法享有查阅、复制、更正、补充、删除以及撤回授权、注销账号等权利。
2. **行使权利的方式**。您可通过本平台"个人中心"自行查询、修改您的账号信息，或通过本章第九条所述的联系方式向我们提出请求。我们将在法律规定的期限内处理您的请求。

## 七、我们如何保护未成年人的个人信息

1. 本平台主要面向学院师生及成年授权用户，我们非常重视对未成年人个人信息的保护。
2. 若您为未满 18 周岁的未成年人，在使用本平台及相关服务前，请在您的父母或其他监护人的监护、指导下共同阅读并同意本隐私政策。我们不会主动收集未满 14 周岁的未成年人（儿童）的个人信息；如发现在未事先获得监护人同意的情况下收集了儿童的个人信息，我们将设法尽快删除相关信息。

## 八、我们如何更新本政策

1. 为给您提供更好的服务，我们可能适时修订本隐私政策。本政策更新后，我们会在平台发布更新版本并标注生效日期，通过公告等方式提醒您阅读。
2. 对于会实质减损您在本隐私政策项下权利的变更，我们还会提供更为显著的通知。您对本平台的继续使用，视为您知悉并同意更新后的政策。

## 九、如何联系我们

如对本隐私政策有任何疑问、意见、建议或投诉、举报需求，请通过以下方式联系我们：**四川邮电职业技术学院智算中心**。我们将在收到您的反馈后，在法律法规规定的期限内予以答复处理。
`

const PRIVACY_MD_EN = `
**Last updated: September 7, 2026**
**Effective date: September 7, 2026**

The Intelligent Computing Center of Sichuan Post and Telecommunication College ("we" or "the Center") understands the importance of your personal information. In accordance with applicable laws and regulations, we will take appropriate security measures to keep your personal information secure and under control. Please read and understand this Privacy Policy carefully before using the StarWhisper Open Platform (the "Platform").

## I. How We Collect and Use Your Personal Information

We collect and use your personal information only to the extent necessary for the purposes described in this Policy, following the principles of legality, propriety, necessity, and good faith.

**1. Account Registration, Sign-in, and Verification**

When you register for or sign in to the Platform, we collect your mobile phone number, account display name, sign-in password (stored in encrypted form), and other information necessary for account registration, sign-in verification, and account security management. You may also use other sign-in methods provided by the Platform.

**2. API Calls and Usage Records**

When you call model services through the Platform, we record necessary call information, including: the model name, call time, input and output content (processed briefly only when necessary to provide conversational services to you), token usage, and consumed quota, for the purposes of API billing, quota management, usage statistics, and anomaly monitoring.

**3. Operations and Security Assurance**

To ensure the secure and stable operation of the Platform and to prevent cyber attacks and misuse, we record necessary access logs, including IP address, browser type and version, operating system, access time, and pages visited, for security protection, troubleshooting, and auditing.

**4. Other Rules for Collecting and Using Personal Information**

(1) If we collect or use your personal information beyond the scope of this Policy, we will separately explain this to you and obtain your consent; (2) in accordance with laws and regulations, consent is not required for collecting or using personal information in the following circumstances: directly related to national or defense security; directly related to public safety, public health, or major public interests; directly related to criminal investigation, prosecution, trial, and judgment enforcement; necessary to protect the life, property, or other major lawful rights and interests of you or another individual where it is difficult to obtain that person's consent; the personal information has been made public by you; collected from lawfully disclosed information; and other circumstances prescribed by laws and regulations.

## II. How We Use Cookies and Similar Technologies

To improve your experience on the Platform, we may use cookies and similar technologies to maintain sign-in status, remember interface preferences, and protect sign-in security. You can manage or clear cookies through your browser settings; if you disable cookies, some features of the Platform may not function properly.

## III. How We Entrust Processing, Share, Transfer, or Publicly Disclose Your Personal Information

1. **Principles for Data Sharing**. We do not sell your personal information to any third party. Except in the following circumstances, we do not share your personal information with any company, organization, or individual: (1) sharing with your explicit consent; (2) sharing as required by laws and regulations or by competent authorities; (3) sharing necessary to protect the lawful rights and interests of the Platform, you, or other individuals.
2. **Data Use for Service Delivery**. To provide you with API gateway services, we may provide necessary call information to the model providers serving your requests; such sharing is limited to what is necessary for the Platform to function, and the relevant parties are required to honor confidentiality obligations.
3. **Transfer**. In the event of a merger, acquisition, or asset transfer that results in a change of the personal information controller, we will require the successor to remain bound by this Policy; otherwise, we will require the successor to obtain your authorization and consent anew.
4. **Public Disclosure**. We do not publicly disclose your personal information, except as otherwise provided by laws and regulations or with your separate consent.
5. **Exceptions to Prior Consent**. In accordance with laws and regulations, prior authorization is not required for sharing, transferring, or publicly disclosing your personal information in the following circumstances: directly related to national or defense security; directly related to public safety, public health, or major public interests; directly related to criminal investigation, prosecution, trial, and judgment enforcement; necessary to protect the life, property, or other major lawful rights and interests of you or another individual where it is difficult to obtain that person's consent; personal information made public by you; collected from lawfully disclosed information; and other circumstances prescribed by laws and regulations.

## IV. How We Protect Your Personal Information

1. We adopt security measures consistent with industry standards to protect your personal information, including but not limited to transmission encryption (HTTPS), storage encryption, access control, permission management, and log auditing.
2. We have established a data security management system, enforce least-privilege access for employees handling personal information, and record and audit scenarios involving access to personal information.
3. In the unfortunate event of a personal information security incident, we will, as required by laws and regulations, promptly inform you via email, SMS, in-app notifications, or announcements of the basic situation and possible impact of the incident and the measures we have taken or will take, and report to the competent authorities as appropriate.

## V. How We Store Your Personal Information

1. **Storage Location**. In accordance with laws and regulations, we store your personal information within the territory of China and will not transfer it outside the country.
2. **Storage Period**. We retain your personal information only for the shortest period necessary to achieve the purposes of this Policy. After the retention period expires, we will delete or anonymize the relevant personal information, unless otherwise provided by laws and regulations.

## VI. How You Can Manage Your Personal Information Rights

1. **Your Rights**. You lawfully enjoy rights over your personal information, including the rights to access, copy, correct, supplement, and delete it, to withdraw authorization, and to cancel your account.
2. **How to Exercise Your Rights**. You may query and modify your account information through the "Personal Center" of the Platform, or submit requests to us through the contact information described in Section IX. We will process your requests within the time limits prescribed by law.

## VII. How We Protect Minors' Personal Information

1. The Platform is primarily intended for faculty, students, and authorized adult users. We attach great importance to the protection of minors' personal information.
2. If you are a minor under the age of 18, please read and agree to this Privacy Policy together with your parents or other guardians before using the Platform and related services. We do not knowingly collect personal information from minors under the age of 14 (children); if we discover that a child's personal information has been collected without prior guardian consent, we will endeavor to delete the relevant information as soon as possible.

## VIII. How We Update This Policy

1. To provide you with better services, we may revise this Privacy Policy from time to time. Upon update, we will publish the revised version on the Platform with the effective date indicated and remind you to read it via announcements or other means.
2. For changes that materially diminish your rights under this Privacy Policy, we will provide more prominent notice. Your continued use of the Platform constitutes your acknowledgment of and consent to the updated Policy.

## IX. How to Contact Us

If you have any questions, comments, suggestions, complaints, or reports regarding this Privacy Policy, please contact us at: **the Intelligent Computing Center of Sichuan Post and Telecommunication College**. We will respond and process your feedback within the time limits prescribed by laws and regulations.
`

export function PrivacyPolicy() {
  // #12：标题/返回链接/日期行/正文全部按语言对齐（zh=中文正文，en=英文正文）
  const { t, i18n } = useTranslation()
  const isEn = i18n.language?.startsWith('en')
  return (
    <div className='bg-background text-foreground min-h-svh px-4 py-10 sm:px-6'>
      <div className='mx-auto max-w-3xl'>
        <div className='mb-6 text-sm'>
          <Link
            to='/'
            className='text-[#7F77DD] hover:underline'
          >
            ← {t('返回平台')}
          </Link>
        </div>
        <h1 className='text-2xl font-semibold tracking-tight'>
          {t('隐私政策')}
        </h1>
        <p className='text-muted-foreground mt-1 text-xs'>
          {t('最近更新：{{date}} · 四川邮电职业技术学院智算中心', { date: '2026-09-07' })}
        </p>
        <RichContent
          mode='markdown'
          content={isEn ? PRIVACY_MD_EN : PRIVACY_MD}
          className='prose-neutral dark:prose-invert max-w-none'
        />
      </div>
    </div>
  )
}
