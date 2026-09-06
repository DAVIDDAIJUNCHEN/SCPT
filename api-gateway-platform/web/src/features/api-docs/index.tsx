/*
Copyright (C) 2023-2026 QuantumNous
Copyright (C) 2026 川邮·星语 · AlloMax（二次开发：API 接口文档页）

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { BookOpen, Copy, KeyRound, Plug, Rocket, Wallet } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { PublicLayout } from '@/components/layout'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

// 平台 base_url（OpenAI 兼容）
const BASE_URL =
  (typeof window !== 'undefined' ? window.location.origin : '') + '/v1'

// 对外开放的模型列表（后续自动从后端拉取）
const MODELS = [
  'DeepSeek-V4-Flash-0731',
  'deepseek-v4-flash-0731',
  'qwen3.8-flash-next',
  'glm-5.3-flash',
  'Qwen3-VL-30B-A3B-Instruct',
  'Qwen2-Audio-7B-Instruct',
  'FLUX.2-klein-4B',
  'MinerU2.5-Pro-2605-1.2B',
  'Qwen3-ASR-1.7B',
  'cosyvoice-v3',
]

// curl 调用样例（文本对话）
const CURL_CHAT = `curl ${BASE_URL}/chat/completions \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer $YOUR_API_KEY" \\
  -d '{
    "model": "DeepSeek-V4-Flash-0731",
    "messages": [
      {"role": "system", "content": "You are a helpful assistant."},
      {"role": "user", "content": "你好！"}
    ]
  }'`

// Python OpenAI SDK 样例
const PYTHON_SAMPLE = `from openai import OpenAI

client = OpenAI(
    api_key="YOUR_API_KEY",
    base_url="${BASE_URL}",
)

resp = client.chat.completions.create(
    model="DeepSeek-V4-Flash-0731",
    messages=[{"role": "user", "content": "你好！"}],
)
print(resp.choices[0].message.content)`

// Node.js OpenAI SDK 样例
const NODE_SAMPLE = `import OpenAI from "openai";

const client = new OpenAI({
  apiKey: "YOUR_API_KEY",
  baseURL: "${BASE_URL}",
});

const resp = await client.chat.completions.create({
  model: "DeepSeek-V4-Flash-0731",
  messages: [{ role: "user", content: "你好！" }],
});
console.log(resp.choices[0].message.content);`

function CodeBlock({ title, code }: { title: string; code: string }) {
  const { t } = useTranslation()
  const copy = () => {
    navigator.clipboard
      ?.writeText(code)
      .then(() => toast.success(t('已复制')))
      .catch(() => toast.error(t('复制失败')))
  }
  return (
    <div className='overflow-hidden rounded-lg border border-white/10 bg-[#0A1126]/80'>
      <div className='flex items-center justify-between border-b border-white/10 px-4 py-2'>
        <span className='text-xs font-medium text-foreground/80'>{title}</span>
        <Button
          variant='ghost'
          size='sm'
          className='h-7 gap-1.5 text-xs'
          onClick={copy}
        >
          <Copy className='h-3.5 w-3.5' />
          {t('复制')}
        </Button>
      </div>
      <pre className='overflow-x-auto p-4 text-xs leading-relaxed text-[#9dd0f1]'>
        <code>{code}</code>
      </pre>
    </div>
  )
}

function StepCard({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: typeof Plug
  title: string
  description: string
  children?: React.ReactNode
}) {
  return (
    <Card data-card-hover='false' className='gap-0'>
      <CardHeader>
        <CardTitle className='flex items-center gap-2 text-base'>
          <Icon className='h-4 w-4 text-[#378ADD]' />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className='space-y-3 text-sm text-muted-foreground'>
        <p>{description}</p>
        {children}
      </CardContent>
    </Card>
  )
}

export function ApiDocs() {
  const { t } = useTranslation()

  return (
    <PublicLayout showMainContainer={false}>
      <div className='mx-auto w-full max-w-4xl space-y-8 px-4 py-10 sm:px-6'>
        {/* 头部 */}
        <div>
          <h1 className='text-2xl font-semibold text-foreground sm:text-3xl'>
            {t('API 接口文档')}
          </h1>
          <p className='mt-2 text-muted-foreground'>
            接入川邮·星语 API，使用 OpenAI 兼容格式调用平台 AI 模型
          </p>
          <Badge className='mt-3'>
            OpenAI Compatible · Base URL: {BASE_URL}
          </Badge>
        </div>

        {/* 第一步：获取 API Key */}
        <StepCard
          icon={KeyRound}
          title={t('第 1 步 · 获取 API Key')}
          description={t('登录后在「API Keys」页面创建一个令牌，复制生成的 sk- 开头的 API Key。')}
        />

        {/* 第二步：聊天接口 */}
        <StepCard
          icon={Rocket}
          title={t('第 2 步 · 调用对话接口')}
          description={t('以下是三种主流调用方式，任选其一即可。')}
        >
          <div className='space-y-3'>
            <CodeBlock title='curl' code={CURL_CHAT} />
            <CodeBlock title='Python SDK' code={PYTHON_SAMPLE} />
            <CodeBlock title='Node.js SDK' code={NODE_SAMPLE} />
          </div>
        </StepCard>

        {/* 第三步：可用模型 */}
        <StepCard
          icon={BookOpen}
          title={t('第 3 步 · 可用模型')}
          description={t('平台当前纳管以下模型（覆盖文本、视觉、语音、图像、视频生成）：')}
        >
          <div className='flex flex-wrap gap-2'>
            {MODELS.map((m) => (
              <Badge key={m} variant='outline' className='font-mono text-xs'>
                {m}
              </Badge>
            ))}
          </div>
        </StepCard>

        {/* 第四步：计费方式 */}
        <StepCard
          icon={Wallet}
          title={t('第 4 步 · 计费方式')}
          description={t('按 token 计费，价格详见「价格」页。文本模型按输入/输出 token 计费，图像、语音等按次/按量计费。')}
        />

        {/* 其他说明 */}
        <StepCard
          icon={Plug}
          title={t('更多能力')}
          description={t('支持图像生成（/v1/images/generations）、语音合成（/v1/audio/speech）、语速识别（/v1/audio/transcriptions）、文档解析等，详见具体模型文档。')}
        />
      </div>
    </PublicLayout>
  )
}
