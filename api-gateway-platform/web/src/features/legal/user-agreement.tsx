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

const AGREEMENT_MD = `
**更新日期：2026 年 9 月 7 日**
**生效日期：2026 年 9 月 7 日**

欢迎使用川邮·星语开放平台！

川邮·星语开放平台由**四川邮电职业技术学院智算中心**（以下简称"我们"或"智算中心"）建设并负责运营。《川邮·星语开放平台服务协议》（以下简称"本协议"）特别适用于您作为校内师生、科研人员或开发者（以下简称"您"或"使用者"）使用本平台提供的应用程序编程接口（API）及配套开发者工具，开展教学、科研、学术研究或面向校内应用的开发活动。

在使用本平台服务（以下简称"本服务"）前，请您务必仔细阅读并充分理解本协议。我们特别提醒您在使用本服务之前认真阅读、充分理解本协议的全部条款。当您通过网络页面点击确认、勾选等方式同意本协议，或实际使用本服务时，均表示您与我们已就本协议达成一致，同意受其约束。如果您不同意任一条款，请停止使用本服务。

## 一、服务内容

1. 本平台是面向四川邮电职业技术学院教学、科研与校内应用场景提供的大模型 API 网关服务，覆盖文本对话、图像生成、语音合成、语音识别等能力，并将随技术演进持续扩展新的服务类型。您可以基于本服务，将相关模型能力集成于各类下游系统、应用或功能，用于预期的目的和具体场景。
2. 本平台软件基于 **New API 开源项目（AGPL v3）** 二次开发，并在此基础上结合校内需求进行了功能扩展与界面定制。
3. 在使用本服务期间，模型基于您输入的提示信息（以下称"输入"），通过计算推理输出相应的内容作为响应（以下称"输出"），包括文字、表格、代码、图像等。
4. 随着生成式人工智能技术及法律、法规的不断发展，智算中心可能对本服务进行新增、升级、变更、中止或终止，或对服务的技术、方式、性能等进行必要的调整。上述变更如对您的权益有重要影响，我们将通过站内推送、网站公示等显著方式及时通知您。

## 二、账号管理

1. 本平台使用统一账号体系，您应通过本人真实、有效的手机号完成注册，并按照平台要求设置账号信息。注册信息必须真实、准确、完整。
2. 您应对您的账号及密码、API Key 负有妥善保管义务，对账号下发生的所有行为承担责任，不得将账号出借、转让或用于任何违反本协议的活动。
3. 若您的账号用于非教学科研、非授权用途或违反法律法规的用途，本平台有权暂停或终止服务。
4. 您通过账号创建的 API Key 是您调用本平台接口的必要凭证，请妥善保管，防止任何形式的泄露，不要与他人共享或对外公开您的 API Key；因 API Key 泄露造成的损失，由您自行承担相应责任。

## 三、服务管理

1. 本平台提供的是中立、基础的模型技术服务，仅为价值链下游的系统、应用或功能的一部分，无法决定服务的最终目的和用途。您作为下游系统、应用或功能的提供者，应对其负责并承担相应的法律责任。
2. 您应按照《互联网信息服务深度合成管理规定》《生成式人工智能服务管理暂行办法》等法律法规的要求，作为深度合成服务提供者、生成式人工智能服务提供者，承担在提供生成式人工智能服务中的相应法律责任。
3. 您应按照《生成式人工智能服务管理暂行办法》《网络信息内容生态治理规定》等法律法规的要求，作为网络信息内容生产者，履行网络信息安全义务，对输入和输出进行必要的审查，建立风险识别、过滤机制，完善网络信息安全审查机制。
4. 您应按照《数据安全法》《个人信息保护法》等法律法规的要求，作为数据处理者、个人信息处理者，承担在收集、处理、使用、存储、删除以及共享数据（包括个人信息）等活动中的法律责任。
5. 您应按照《网络安全法》等法律法规的要求，采取包括但不限于授权与权限管理、访问控制、数据加密、监测审计以及应急处置等必要、有效的组织和技术措施，保障自身数据与信息系统的完整性、保密性和可用性。
6. 您应按照《人工智能生成合成内容标识办法》等法律法规、标准的要求，对利用人工智能技术生成、合成的文本、图像等内容进行标识，且不得恶意删除、篡改、伪造、隐匿此类生成内容标识。

## 四、输入与输出

1. 您对向本平台提交的所有输入和对应的输出负责。您声明并保证，您拥有根据本协议处理输入所需的所有权利、许可和权限，这些输入和对应的输出不违反法律法规的规定，不侵犯任何人的知识产权、肖像权、名誉权、荣誉权、姓名权、隐私权、个人信息权益等合法权益，不涉及任何国家秘密、商业秘密或其他可能会对国家安全或者公共利益造成不利影响的数据。
2. 在符合法律规定和本协议条款的条件下，您对以下事项享有相应权利：（1）您保留在提交的输入中拥有的任何权利、所有权和利益；（2）本服务输出的内容的任何权利、所有权和利益归属于您；（3）您可将本服务的输入与输出应用于广泛的场景中，包括个人使用、学术研究、课程教学、衍生产品开发等。

## 五、知识产权、个人信息保护和其他权利

1. 双方在使用本服务之前所拥有的知识产权依然归属各方所有，不因履行本协议而转归对方享有。为免疑义，本平台所接入的各模型的所有权、知识产权归属各模型提供方所有（包括但不限于模型参数、算法、代码、框架结构等）。
2. 本平台软件基于 **New API 开源项目（AGPL v3）** 二次开发。依据 AGPL v3 许可要求，本平台的派生软件源代码应向公众开放，任何获取本平台软件代码的使用者应遵守 AGPL v3 的条款，包括但不限于保留版权声明、以相同许可协议分发、在提供网络服务时向用户提供获取对应源代码的途径等。
3. 我们重视您的个人信息保护，具体处理规则请参阅《隐私政策》（即本平台公布的《川邮·星语隐私政策》）。我们将遵循合法、正当、必要和诚信原则处理您的个人信息。
4. 您利用本平台输出内容时应自行判断并承担相应的合规责任，输出的知识产权归属及使用责任依法确定。

## 六、付费充值

1. 当您使用付费服务时，您需预先在平台进行充值，在余额（配额）充足时可以正常使用本服务；余额不足时本平台有权停止服务。您应关注账号余额情况，及时充值续费，并承担因未及时续费造成的任何责任和损失。
2. 付费服务的充值方式、计费价格、消耗方式以及赠送额度等以本平台产品页面公示为准。智算中心有权根据业务情况对服务费用进行调整，如调整对您的权益有重要影响，我们会通过站内推送、网站公示等显著方式及时通知您。
3. 当您进行充值时，应仔细确认自己的账号、支付方式及其他信息；因自身操作不当造成充错账号等情形而损害自身权益的，由您自行承担责任。配额一经使用或兑换，一般不退、不换，法律法规另有规定或本平台另有承诺的除外。

## 七、违约责任与责任限制

1. 如您违反本协议约定，无论是否造成实际损失，本平台均有权视情节采取警告、限制功能、暂停服务、终止协议等措施，并可不予退还您账户内未消耗的余额。
2. 您应自行承担因违反法律法规或本协议约定而产生的全部责任与损失，因您的违规行为给本平台或第三方造成损失的，您应予以赔偿。
3. 因不可抗力、网络故障、第三方服务中断等原因导致服务异常或数据丢失的，本平台不承担责任。在不违反法律强制性规定的前提下，本平台对服务不提供任何明示或默示的担保（包括但不限于适销性、特定用途适用性、不侵犯第三方权利等），不对大模型生成内容的准确性、完整性、可靠性作任何保证。

## 八、人工智能生成内容

1. 大模型的输出由人工智能自动生成，可能包含不准确、不完整、具有偏见或不合时宜的内容，仅供您参考，不代表智算中心的任何立场或观点。您应对输出内容进行自主判断与核验，并自行承担因使用生成内容而产生的一切后果。
2. 您不得利用本服务生成、传播侵犯他人权益、危害国家安全、违反法律法规或公序良俗的内容。平台有权依法对违规内容进行处理，并保留向有关部门报告的权利。

## 九、法律适用和管辖

1. 本协议的订立、履行、解释及争议解决均适用中华人民共和国法律。
2. 因本协议引起的或与本协议有关的任何争议，双方应首先友好协商解决；协商不成的，任何一方可向协议签订地（即平台所在地）有管辖权的人民法院提起诉讼。

## 十、其他

1. 本协议是您使用本平台服务的完整约定。本协议的任何条款被认定无效或不可执行的，不影响其余条款的效力。
2. 本平台可不时修订本协议，修订后将在平台公示并标注生效日期；您继续使用本平台即视为接受修订后的协议。您可随时停止使用本平台；平台在您严重违约或依法需终止时，有权终止服务。
3. 如对本协议有任何疑问，请联系四川邮电职业技术学院智算中心相关负责人。
`

const AGREEMENT_MD_EN = `
**Last updated: September 7, 2026**
**Effective date: September 7, 2026**

Welcome to the StarWhisper Open Platform!

The StarWhisper Open Platform is built and operated by the **Intelligent Computing Center of Sichuan Post and Telecommunication College** ("we" or "the Center"). This StarWhisper Open Platform Service Agreement (this "Agreement") applies specifically to your use, as a faculty member, student, researcher, or developer ("you" or "User"), of the application programming interfaces (APIs) and accompanying developer tools provided by the Platform for teaching, research, academic activities, or development of on-campus applications.

Before using the services of the Platform (the "Services"), please read and fully understand this Agreement carefully. We specifically remind you to carefully read and fully understand all terms of this Agreement before using the Services. By clicking to confirm, checking boxes, or otherwise agreeing to this Agreement through the web page, or by actually using the Services, you indicate that you and we have reached agreement on this Agreement and that you consent to be bound by it. If you do not agree to any term, please stop using the Services.

## I. Service Content

1. The Platform is a large-model API gateway service for the teaching, research, and on-campus application scenarios of Sichuan Post and Telecommunication College, covering text conversation, image generation, speech synthesis, speech recognition, and other capabilities, and will continue to expand with new service types as technology evolves. Based on the Services, you may integrate the relevant model capabilities into various downstream systems, applications, or features for their intended purposes and specific scenarios.
2. The Platform software is developed on the basis of the **New API open-source project (AGPL v3)**, with functional extensions and interface customization for on-campus needs.
3. During your use of the Services, the models generate corresponding content as a response (the "Output") through computational inference based on the prompts you enter (the "Input"), including text, tables, code, images, etc.
4. As generative artificial intelligence technology and laws and regulations continue to develop, the Center may add to, upgrade, modify, suspend, or terminate the Services, or make necessary adjustments to the technology, methods, or performance of the Services. If such changes materially affect your rights and interests, we will notify you promptly through in-app notifications, website announcements, or other prominent means.

## II. Account Management

1. The Platform uses a unified account system. You shall register with your own genuine and valid mobile phone number and set up your account information as required by the Platform. Registration information must be true, accurate, and complete.
2. You shall properly safeguard your account, password, and API Keys, and are responsible for all activities under your account. You shall not lend, transfer, or use your account for any activities in violation of this Agreement.
3. If your account is used for non-teaching, non-research, unauthorized, or illegal purposes, the Platform has the right to suspend or terminate the Services.
4. The API Keys you create through your account are the necessary credentials for calling the Platform's APIs. Please keep them safe and prevent any form of leakage; do not share them with others or make them public. Losses caused by leakage of API Keys shall be borne by you.

## III. Service Management

1. The Platform provides neutral and basic model technology services, serving only as a part of the downstream systems, applications, or features in the value chain, and cannot determine the final purpose and use of the services. As the provider of the downstream systems, applications, or features, you shall be responsible for them and bear the corresponding legal liability.
2. In accordance with the *Provisions on the Administration of Deep Synthesis of Internet Information Services*, the *Interim Measures for the Administration of Generative Artificial Intelligence Services*, and other applicable laws and regulations, you shall, as a provider of deep synthesis services and generative artificial intelligence services, bear the corresponding legal responsibilities in providing generative AI services.
3. In accordance with the *Interim Measures for the Administration of Generative Artificial Intelligence Services*, the *Provisions on the Governance of Network Information Content Ecosystem*, and other applicable laws and regulations, you shall, as a producer of network information content, fulfill network information security obligations, conduct necessary review of inputs and outputs, establish risk identification and filtering mechanisms, and improve network information security review mechanisms.
4. In accordance with the *Data Security Law*, the *Personal Information Protection Law*, and other applicable laws and regulations, you shall, as a data processor and personal information processor, bear legal responsibility for activities including collecting, processing, using, storing, deleting, and sharing data (including personal information).
5. In accordance with the *Cybersecurity Law* and other applicable laws and regulations, you shall adopt necessary and effective organizational and technical measures, including but not limited to authorization and permission management, access control, data encryption, monitoring and auditing, and emergency response, to ensure the integrity, confidentiality, and availability of your data and information systems.
6. In accordance with the *Measures for Labeling AI-Generated Synthetic Content* and other applicable laws, regulations, and standards, you shall label text, images, and other content generated or synthesized using AI technology, and shall not maliciously delete, tamper with, forge, or conceal such labels.

## IV. Input and Output

1. You are responsible for all Input submitted to the Platform and the corresponding Output. You represent and warrant that you possess all rights, licenses, and permissions required to process the Input under this Agreement; that the Input and corresponding Output do not violate laws and regulations; that they do not infringe upon any person's intellectual property, portrait rights, reputation rights, honor rights, name rights, privacy rights, personal information rights and interests, or other lawful rights and interests; and that they do not involve any state secrets, trade secrets, or other data that may adversely affect national security or public interests.
2. Subject to legal provisions and the terms of this Agreement, you enjoy the corresponding rights in the following matters: (1) you retain any rights, ownership, and interests you hold in the submitted Input; (2) any rights, ownership, and interests in the content Output by the Services belong to you; (3) you may apply the Input and Output of the Services to a wide range of scenarios, including personal use, academic research, course teaching, and derivative product development.

## V. Intellectual Property, Personal Information Protection, and Other Rights

1. The intellectual property rights owned by each party before using the Services remain owned by that party and shall not transfer to the other party by virtue of performing this Agreement. For the avoidance of doubt, the ownership and intellectual property rights of each model connected to the Platform belong to the respective model provider (including but not limited to model parameters, algorithms, code, and framework structures).
2. The Platform software is developed on the basis of the **New API open-source project (AGPL v3)**. In accordance with the AGPL v3 license, the source code of the Platform's derivative software shall be made available to the public. Any user who obtains the Platform software code shall comply with the terms of AGPL v3, including but not limited to retaining copyright notices, distributing under the same license, and providing users with a means to obtain the corresponding source code when providing network services.
3. We value the protection of your personal information. For specific processing rules, please refer to the Privacy Policy (i.e., the *StarWhisper Privacy Policy* published by the Platform). We will process your personal information following the principles of legality, propriety, necessity, and good faith.
4. When using the content Output by the Platform, you shall make your own judgment and bear the corresponding compliance responsibilities; the intellectual property ownership and usage responsibilities of the Output shall be determined in accordance with the law.

## VI. Paid Recharge

1. When you use paid services, you need to recharge in advance on the Platform. You may use the Services normally while your balance (quota) is sufficient; if the balance is insufficient, the Platform has the right to stop the Services. You shall pay attention to your account balance, recharge in a timely manner, and bear any responsibilities and losses caused by failure to recharge in time.
2. The recharge methods, billing prices, consumption rules, and complimentary quotas for paid services are subject to what is published on the Platform's product pages. The Center may adjust service fees based on business conditions. If such adjustments materially affect your rights and interests, we will notify you promptly through in-app notifications, website announcements, or other prominent means.
3. When recharging, please carefully verify your account, payment method, and other information. Losses caused by your own operational errors, such as recharging the wrong account, shall be borne by you. Quota, once used or redeemed, is generally non-refundable and non-exchangeable, except as otherwise provided by laws and regulations or otherwise promised by the Platform.

## VII. Breach of Agreement and Limitation of Liability

1. If you breach this Agreement, regardless of whether actual losses are caused, the Platform has the right to take measures such as warning, restricting features, suspending services, or terminating the Agreement as appropriate, and may refuse to refund the unspent balance in your account.
2. You shall bear all responsibilities and losses arising from violations of laws and regulations or this Agreement. If your violations cause losses to the Platform or third parties, you shall provide compensation.
3. The Platform is not liable for service abnormalities or data loss caused by force majeure, network failures, third-party service interruptions, or similar causes. To the extent not prohibited by mandatory provisions of law, the Platform provides no express or implied warranties for the Services (including but not limited to merchantability, fitness for a particular purpose, and non-infringement of third-party rights), and makes no guarantee as to the accuracy, completeness, or reliability of large-model generated content.

## VIII. AI-Generated Content

1. The Output of large models is automatically generated by artificial intelligence and may contain inaccurate, incomplete, biased, or untimely content. It is for your reference only and does not represent any position or viewpoint of the Center. You shall exercise independent judgment and verification of the Output and bear all consequences arising from the use of generated content.
2. You shall not use the Services to generate or disseminate content that infringes upon the rights of others, endangers national security, or violates laws, regulations, or public order and good morals. The Platform has the right to handle violating content in accordance with the law and reserves the right to report to the relevant authorities.

## IX. Governing Law and Jurisdiction

1. The conclusion, performance, interpretation, and dispute resolution of this Agreement are governed by the laws of the People's Republic of China.
2. Any dispute arising from or in connection with this Agreement shall first be resolved through friendly negotiation; if negotiation fails, either party may file a lawsuit with the people's court with jurisdiction at the place where the Agreement is signed (i.e., where the Platform is located).

## X. Miscellaneous

1. This Agreement constitutes the entire agreement between you and the Platform regarding your use of the Services. If any provision of this Agreement is determined to be invalid or unenforceable, the validity of the remaining provisions shall not be affected.
2. The Platform may revise this Agreement from time to time; revisions will be published on the Platform with the effective date indicated. Your continued use of the Platform constitutes acceptance of the revised Agreement. You may stop using the Platform at any time; the Platform has the right to terminate the Services if you seriously breach the Agreement or when termination is required by law.
3. If you have any questions about this Agreement, please contact the relevant person in charge at the Intelligent Computing Center of Sichuan Post and Telecommunication College.
`

export function UserAgreement() {
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
          {t('《川邮·星语》开放平台服务协议')}
        </h1>
        <p className='text-muted-foreground mt-1 text-xs'>
          {t('最近更新：{{date}} · 四川邮电职业技术学院智算中心', { date: '2026-09-07' })}
        </p>
        <RichContent
          mode='markdown'
          content={isEn ? AGREEMENT_MD_EN : AGREEMENT_MD}
          className='prose-neutral dark:prose-invert max-w-none'
        />
      </div>
    </div>
  )
}
