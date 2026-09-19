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
/**
 * 川邮·星语（2026-09-19）：认证路由的懒加载包装。
 *
 * 背景：主包 `index.js` 达 3.5MB（br 后 1.03MB），因为整个管理后台
 * （仪表盘 / 渠道 / 令牌 / 日志 / 模型广场 / 系统设置 / 用户管理…）
 * 都被静态 import 进了首屏主包。而 Portal 跳转过来的第一个页面只是登录页，
 * 却要等这 3.5MB 下载+解析完才能渲染 —— 体感就是「很慢、不丝滑」。
 *
 * 做法：认证相关页面（登录 / 注册 / 忘记密码 / 重置 / 验证码）改为按需加载，
 * 各自成为独立 async chunk。首屏只加载框架 + 路由骨架。
 *
 * 关键体验细节：懒加载期间用**与登录页同款的深空底色**占满视口作为兜底。
 * 若不铺底色，会出现「白屏 → 深色内容」的跳变，这种跳变本身就是体感上
 * 「不丝滑」的主要来源。铺底色后视觉连续，几乎察觉不到加载过程。
 */
import { Suspense, lazy, type FunctionComponent } from 'react'

/** 认证页统一的加载兜底：与登录页同色，避免白屏跳变 */
export function AuthRouteFallback() {
  return <div className='min-h-svh w-full bg-[#0e1538]' aria-busy='true' />
}

/**
 * 把一个具名导出的认证组件包成可懒加载的路由组件。
 *
 * 返回类型用 FunctionComponent 而非 ComponentType：TanStack Router 的
 * RouteComponent 只接受函数组件，ComponentType 会把 class 组件也算进来导致类型不兼容。
 *
 * @param loader 动态 import 函数，形如 `() => import('@/features/auth/sign-in')`
 * @param exportName 该模块中要取用的导出名，如 `'SignIn'`
 */
export function lazyAuthRoute<T extends Record<string, unknown>>(
  loader: () => Promise<T>,
  exportName: keyof T & string
): FunctionComponent {
  const LazyComponent = lazy(async () => {
    const mod = await loader()
    return { default: mod[exportName] as FunctionComponent }
  })

  return function LazyAuthRoute() {
    return (
      <Suspense fallback={<AuthRouteFallback />}>
        <LazyComponent />
      </Suspense>
    )
  }
}