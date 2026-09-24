import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { defineConfig, loadEnv, type ConfigParams, type RsbuildConfig } from '@rsbuild/core'
import { Compilation, Compiler, sources } from '@rspack/core'
import { pluginReact } from '@rsbuild/plugin-react'
import { pluginTailwindcss } from '@rsbuild/plugin-tailwindcss'
import { tanstackRouter } from '@tanstack/router-plugin/rspack'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig(({ envMode }: ConfigParams): RsbuildConfig => {
  const env = loadEnv({ mode: envMode, prefixes: ['VITE_'] })
  const serverUrl =
    process.env.VITE_REACT_APP_SERVER_URL ||
    env.rawPublicVars.VITE_REACT_APP_SERVER_URL ||
    // 川邮·星语本地开发：后端为 OrbStack 内 starx-local-gw（生产版网关，
    // 占 127.0.0.1:3001）；3000 常被残留 dev 进程/其他服务占用，勿回退到 3000
    'http://127.0.0.1:3001'

  const isProd = envMode === 'production'
  const devProxy = Object.fromEntries(
    (['/api', '/v1', '/mj', '/pg'] as const).map((key) => [
      key,
      { target: serverUrl, changeOrigin: true },
    ])
  ) as Record<string, { target: string; changeOrigin: boolean }>

  return {
    plugins: [pluginReact(), pluginTailwindcss({ optimize: false })],
    // Rsbuild 2: replaces deprecated `performance.chunkSplit` (RSPack 2 aligned)
    splitChunks: {
      preset: 'default',
      cacheGroups: {
        'vendor-react': {
          test: /node_modules[\\/](react|react-dom)[\\/]/,
          name: 'vendor-react',
          chunks: 'all',
          priority: 0,
          enforce: true,
        },
        'vendor-ui-primitives': {
          test: /node_modules[\\/](@base-ui|@radix-ui)[\\/]/,
          name: 'vendor-ui-primitives',
          chunks: 'all',
          priority: 0,
          enforce: true,
        },
        'vendor-tanstack': {
          test: /node_modules[\\/]@tanstack[\\/]/,
          name: 'vendor-tanstack',
          chunks: 'all',
          priority: 0,
          enforce: true,
        },
        // ── 结论备忘（2026-09-19 实测，非配置）───────────────────────────
        // 不要再尝试用 cacheGroup 拆离 TanStack 路由引用表，已验证无效。
        //
        // 现象：产物中有一个 ~800KB raw / ~240KB gzip 的 initial chunk
        // （示例构建中名为 4146.js），被 index.js 同步依赖。它内部的模块
        // **全部**是 @tanstack/router-plugin 经 unplugin loader 生成的虚拟
        // 模块：
        //   unplugin/dist/rspack/loaders/transform.mjs
        //     ??tanstack-router:code-splitter:compile-reference-file!<真实文件>
        //
        // 为何 cacheGroup 拆不动：cacheGroup.test 匹配的是模块的**资源路径**
        // （即 `!` 之后的真实文件），而这类虚拟模块的资源路径各异、模块本体
        // 由 loader 合成。先后用 chunks:'all'/priority:40 与
        // chunks:'async'/priority:30 两组配置实验，产物哈希三次完全一致
        // （4146.2e23e4b9dc 未变），确认该 chunk 不参与 splitChunks 分组。
        //
        // 该体积是 autoCodeSplitting 的固有成本：autoCodeSplitting 只把路由的
        // **组件实现**拆成异步 chunk，而路由**定义与引用表**必须留在 entry 才能
        // 在启动时构建出完整路由树。要消除它需改造路由架构（routeTree 整体
        // 懒加载 + 延迟 createRouter），属高风险重构，本轮不做。
      },
    },
    source: {
      entry: {
        index: './src/main.tsx',
      },
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    html: {
      template: './index.html',
      // 川邮·星语（2026-09-19）：rsbuild 2.x 会**硬编码**注入
      //   <link rel="icon" href="/favicon.ico">
      // 与模板里已有的 favicon-round.png 声明并存 → 页面上两个 rel="icon"，
      // 浏览器两个都请求，实测 /favicon.ico 在 930/966ms 各请求一次、36KB。
      //
      // 注意：html.favicon 配置项类型只接受 string（无 false 开关）且实测
      // 无法关闭注入、删除 public/favicon.ico 也无效（已实测），该注入不受
      // 配置控制。因此改用下面的 html.tags 后处理钩子移除。
    },
    server: {
      host: '0.0.0.0',
      strictPort: false,
      proxy: devProxy,
    },
    output: {
      // Production optimizations
      minify: isProd,
      target: 'web',
      distPath: {
        root: 'dist',
      },
      // Rely on Rsbuild default legalComments ("linked" → per-chunk *.LICENSE.txt) in all modes.
      // Do not set "none" in production: that strips minifier-preserved third-party notices and
      // extracted license files, which some distributions require for open-source compliance.
    },
    performance: {
      // Remove console in production
      removeConsole: isProd ? ['log'] : false,
      buildCache: false,
    },
    tools: {
      rspack: {
        // 川邮·星语（2026-09-23）：/docs 文档站 13 页 Markdown 以原文内联。
        // RSPack 无 Vite 的 ?raw 语法，用 asset/source 把 .md 直接作为字符串模块导入。
        module: {
          rules: [
            {
              test: /\.md$/i,
              type: 'asset/source',
            },
          ],
        },
        plugins: [
          tanstackRouter({
            target: 'react',
            // Dev: avoid per-route async chunks (reduces white flash on navigation + faster HMR feedback).
            // Prod: keep route-based code splitting.
            autoCodeSplitting: isProd,
          }),
          /**
           * 川邮·星语（2026-09-19）：移除 rsbuild 硬编码注入的 favicon.ico 声明。
           *
           * rsbuild 2.x 无条件下发 `<link rel="icon" href="/favicon.ico">`：
           *   · favicon 配置项置空/置 false —— 实测无效
           *   · 删掉 public/favicon.ico —— 实测无效（本来项目里就没有这个文件）
           * 该注入与模板里已有的 favicon-round.png 并存，导致浏览器请求两个图标。
           *
           * 这里用 processAssets 在 HTML 产物落盘前做一次字符串替换把它摘掉。
           * 只精确匹配 rsbuild 自己生成的那一行（无 type 属性、单引号→双引号的形态），
           * 不会误伤模板里的 `<link rel="icon" type="image/png" ...>`。
           */
          {
            apply(compiler: Compiler) {
              compiler.hooks.thisCompilation.tap(
                'XingyuStripRedundantFavicon',
                (compilation) => {
                  compilation.hooks.processAssets.tap(
                    {
                      name: 'XingyuStripRedundantFavicon',
                      // 必须用最后阶段：rsbuild 的 HtmlRspackPlugin 在
                      // PROCESS_ASSETS_STAGE_OPTIMIZE_INLINE 之后还会往 HTML 里
                      // 追加 favicon 声明，用更早的 stage 拿不到最终产物。
                      stage: Compilation.PROCESS_ASSETS_STAGE_REPORT,
                    },
                    () => {
                      for (const name of compilation.getAssets().map((a: { name: string }) => a.name)) {
                        if (!name.endsWith('.html')) continue

                        const asset = compilation.getAsset(name)
                        if (!asset) continue

                        const before: string = asset.source.source().toString()
                        // rsbuild 会按 public/ 下的实际文件择一注入（favicon.ico 优先，
                        // 其次 favicon.png），本项目两者都在，故两条都需清理。
                        const after = before
                          .replace(/<link rel="icon" href="\/favicon\.ico">/g, '')
                          .replace(/<link rel="icon" href="\/favicon\.png">/g, '')

                        if (after !== before) {
                          compilation.updateAsset(name, new sources.RawSource(after))
                        }
                      }
                    }
                  )
                }
              )
            },
          },
        ],
      },
    },
  }
})
