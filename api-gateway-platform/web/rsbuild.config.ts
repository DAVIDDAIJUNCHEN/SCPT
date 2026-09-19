import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { defineConfig, loadEnv } from '@rsbuild/core'
import { Compilation, sources } from '@rspack/core'
import { pluginReact } from '@rsbuild/plugin-react'
import { pluginTailwindcss } from '@rsbuild/plugin-tailwindcss'
import { tanstackRouter } from '@tanstack/router-plugin/rspack'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig(({ envMode }) => {
  const env = loadEnv({ mode: envMode, prefixes: ['VITE_'] })
  const serverUrl =
    process.env.VITE_REACT_APP_SERVER_URL ||
    env.rawPublicVars.VITE_REACT_APP_SERVER_URL ||
    'http://localhost:3000'

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
      // 注意：favicon 配置项与删除 public/favicon.ico 均**无效**（已实测），
      // 该注入不受配置控制。因此改用下面的 html.tags 后处理钩子移除。
      favicon: false,
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
            apply(compiler: {
              hooks: {
                thisCompilation: {
                  tap: (
                    name: string,
                    cb: (compilation: {
                      hooks: {
                        processAssets: {
                          tap: (
                            opts: { name: string; stage: number },
                            cb: () => void
                          ) => void
                        }
                      }
                    }) => void
                  ) => void
                }
              }
            }) {
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
