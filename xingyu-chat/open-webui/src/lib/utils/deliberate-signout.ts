// 川邮·星语（2026-09-19）：区分「用户主动登出」与「会话被动失效」。
//
// 问题：用户在 Chat 里点「退出登录」时，signout 请求会把服务端会话吊销，
// 此时页面上任何在途/后续的受保护请求都会拿到 401。`+layout.svelte` 的全局
// fetch 包装器看到「401 + 本地仍有 token + /auths/ 探测也是 401」就判定会话过期，
// 触发 clearExpiredSession() → 弹「Session expired. Please sign in again.」。
// 结果：用户明明是自己点的退出，却被提示「会话已过期」，观感像被踢下线或报错。
//
// 解法：登出流程开始前把标志位置 true，让 fetch 包装器在收到 401 时直接放行
// （不清理会话、不弹提示），由登出流程自己负责清理与跳转。跳转到 Portal 会整页
// 卸载脚本，因此无需复位；但保留 reset 以便登出失败时可以恢复。

let deliberateSignOut = false;

export function markDeliberateSignOut(): void {
	deliberateSignOut = true;
}

export function clearDeliberateSignOut(): void {
	deliberateSignOut = false;
}

export function isDeliberateSignOut(): boolean {
	return deliberateSignOut;
}