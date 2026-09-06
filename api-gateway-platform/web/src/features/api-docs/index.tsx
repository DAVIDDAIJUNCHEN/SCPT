/*
Copyright (C) 2023-2026 QuantumNous
Copyright (C) 2026 川邮·星语 · AlloMax（二次开发：API 接口文档页）

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { Copy, Image as ImageIcon, KeyRound, MessagesSquare, Mic, Music } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { PublicLayout } from '@/components/layout'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

// 平台 base_url（OpenAI 兼容），动态取当前来源
const BASE_URL =
  (typeof window !== 'undefined' ? window.location.origin : '') + '/v1'

// 对外开放的模型（后期可改为从后端拉取）
const MODELS = {
  '文本对话 (LLM)': ['DeepSeek-V4-Flash-0731', 'deepseek-v4-flash-0731', 'qwen3.8-flash-next', 'glm-5.3-flash'],
  '视觉理解 (VL)': ['Qwen3-VL-30B-A3B-Instruct'],
  '音频理解 (Audio)': ['Qwen2-Audio-7B-Instruct'],
  '图像生成': ['FLUX.2-klein-4B'],
  '语音合成 (TTS)': ['cosyvoice-v3'],
  '语音识别 (ASR)': ['Qwen3-ASR-1.7B'],
  '文档解析': ['MinerU2.5-Pro-2605-1.2B'],
}

const BASE_URL_LINE = `export const baseURL = "${BASE_URL}"`

// ---------- 四类调用模式（均已在本平台实测）----------
const LLM_CURL = `curl ${BASE_URL}/chat/completions \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer $YOUR_API_KEY" \\
  -d '{
    "model": "DeepSeek-V4-Flash-0731",
    "messages": [
      {"role": "system", "content": "You are a helpful assistant."},
      {"role": "user", "content": "你好！"}
    ]
  }'`

const LLM_PYTHON = `from openai import OpenAI

client = OpenAI(
    api_key="YOUR_API_KEY",
    base_url="${BASE_URL}",
)

resp = client.chat.completions.create(
    model="DeepSeek-V4-Flash-0731",
    messages=[{"role": "user", "content": "你好！"}],
)
print(resp.choices[0].message.content)`

const LLM_NODE = `import OpenAI from "openai";

const client = new OpenAI({
  apiKey: "YOUR_API_KEY",
  baseURL: "${BASE_URL}",
});

const resp = await client.chat.completions.create({
  model: "DeepSeek-V4-Flash-0731",
  messages: [{ role: "user", content: "你好！" }],
});
console.log(resp.choices[0].message.content);`

// 图像生成
const IMAGE_CURL = `curl ${BASE_URL}/images/generations \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer $YOUR_API_KEY" \\
  -d '{
    "model": "FLUX.2-klein-4B",
    "prompt": "一只在森林里奔跑的橙色小猫，高清",
    "n": 1
  }'`

const IMAGE_PYTHON = `from openai import OpenAI

client = OpenAI(api_key="YOUR_API_KEY", base_url="${BASE_URL}")

resp = client.images.generate(
    model="FLUX.2-klein-4B",
    prompt="一只在森林里奔跑的橙色小猫，高清",
    n=1,
)
# resp.data[0].url 或 resp.data[0].b64_json 获取图像
print(resp.data[0])`

// 语音合成 (TTS)
const TTS_CURL = `curl ${BASE_URL}/audio/speech \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer $YOUR_API_KEY" \\
  -d '{
    "model": "cosyvoice-v3",
    "input": "你好，欢迎使用川邮星语",
    "voice": "7bfd2603e70f"
  }' \\
  --output output.wav`

const TTS_PYTHON = `from openai import OpenAI

client = OpenAI(api_key="YOUR_API_KEY", base_url="${BASE_URL}")

resp = client.audio.speech.create(
    model="cosyvoice-v3",
    voice="7bfd2603e70f",   # 需要使用 voice ID（查询 /v1/voices）
    input="你好，欢迎使用川邮星语",
)
resp.write_to_file("output.wav")`

// 语音识别 (ASR)
const ASR_CURL = `curl ${BASE_URL}/audio/transcriptions \\
  -H "Authorization: Bearer $YOUR_API_KEY" \\
  -F "model=Qwen3-ASR-1.7B" \\
  -F "file=@audio.wav"`

function CodeBlock({ label, code }: { label: string; code: string }) {
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
        <span className='text-xs font-medium text-foreground/80'>{label}</span>
        <Button variant='ghost' size='sm' className='h-7 gap-1.5 text-xs' onClick={copy}>
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

function ApiCard({
  icon: Icon,
  title,
  description,
  endpoint,
  children,
}: {
  icon: typeof MessagesSquare
  title: string
  description: string
  endpoint: string
  children: React.ReactNode
}) {
  return (
    <Card data-card-hover='false' className='gap-0 overflow-hidden'>
      <CardHeader>
        <CardTitle className='flex items-center justify-between gap-2 text-base'>
          <span className='flex items-center gap-2'>
            <Icon className='h-4 w-4 text-[#378ADD]' />
            {title}
          </span>
          <Badge variant='outline' className='font-mono text-[10px] normal-case'>
            {endpoint}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className='space-y-3'>
        <p className='text-sm text-muted-foreground'>{description}</p>
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
            接入川邮·星语 API，全部接口为 OpenAI 兼容格式，输入 API Key 即可调用。
          </p>
          <div className='mt-3 flex flex-wrap gap-2'>
            <Badge>OpenAI Compatible</Badge>
            <Badge className='font-mono'>Base URL: {BASE_URL}</Badge>
            <Badge variant='outline'>{t('文本 / 视觉 / 语音 / 图像 多模态')}</Badge>
          </div>
        </div>

        {/* 认证 */}
        <Card data-card-hover='false' className='gap-0'>
          <CardHeader>
            <CardTitle className='flex items-center gap-2 text-base'>
              <KeyRound className='h-4 w-4 text-[#378ADD]' />
              {t('认证方式')}
            </CardTitle>
          </CardHeader>
          <CardContent className='space-y-3 text-sm text-muted-foreground'>
            <p>
              登录后在「API Keys」页创建令牌，将生成的 <code className='rounded bg-white/10 px-1.5 py-0.5 font-mono text-xs'>sk-&lt;key&gt;</code> 作为
              <code className='rounded bg-white/10 px-1.5 py-0.5 font-mono text-xs'>Authorization: Bearer &lt;key&gt;</code>{' '}
              HTTP 请求头传入。价格与余额详见「价格」页与「钱包」。
            </p>
            <CodeBlock label='Base URL' code={BASE_URL_LINE} />
          </CardContent>
        </Card>

        {/* 模式 1：文本对话 / LLM */}
        <ApiCard
          icon={MessagesSquare}
          title={t('模式 1 · 文本对话 (LLM)')}
          endpoint='POST /chat/completions'
          description={t('适用 DeepSeek / Qwen / GLM 等文本大模型，输入 messages 对话，返回模型回复。')}
        >
          <CodeBlock label='curl' code={LLM_CURL} />
          <CodeBlock label='Python SDK' code={LLM_PYTHON} />
          <CodeBlock label='Node.js SDK' code={LLM_NODE} />
        </ApiCard>

        {/* 模式 2：图像生成 */}
        <ApiCard
          icon={ImageIcon}
          title={t('模式 2 · 图像生成')}
          endpoint='POST /images/generations'
          description={t('适用 FLUX 等图像生成模型，输入 prompt 文本，返回生成的图像。')}
        >
          <CodeBlock label='curl' code={IMAGE_CURL} />
          <CodeBlock label='Python SDK' code={IMAGE_PYTHON} />
        </ApiCard>

        {/* 模式 3：语音合成 (TTS) */}
        <ApiCard
          icon={Music}
          title={t('模式 3 · 语音合成 (TTS)')}
          endpoint='POST /audio/speech'
          description={t('适用 cosyvoice 等语音合成模型，输入文本，返回音频（wav/mp3）。注意 voice 需使用 voice ID 而非名称。')}
        >
          <CodeBlock label='curl' code={TTS_CURL} />
          <CodeBlock label='Python SDK' code={TTS_PYTHON} />
        </ApiCard>

        {/* 模式 4：语音识别 (ASR) */}
        <ApiCard
          icon={Mic}
          title={t('模式 4 · 语音识别 (ASR)')}
          endpoint='POST /audio/transcriptions'
          description={t('适用 Qwen3-ASR 等语音识别模型，上传音频文件，返回转录文本。')}
        >
          <CodeBlock label='curl' code={ASR_CURL} />
        </ApiCard>

        {/* 模型总览 */}
        <Card data-card-hover='false' className='gap-0'>
          <CardHeader>
            <CardTitle className='flex items-center gap-2 text-base'>
              <KeyRound className='h-4 w-4 text-[#378ADD]' />
              {t('模型总览')}
            </CardTitle>
          </CardHeader>
          <CardContent className='space-y-4'>
            {Object.entries(MODELS).map(([cat, list]) => (
              <div key={cat}>
                <div className='mb-2 text-xs font-medium text-muted-foreground'>{cat}</div>
                <div className='flex flex-wrap gap-2'>
                  {list.map((m) => (
                    <Badge key={m} variant='outline' className='font-mono text-xs'>
                      {m}
                    </Badge>
                  ))}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </PublicLayout>
  )
}
