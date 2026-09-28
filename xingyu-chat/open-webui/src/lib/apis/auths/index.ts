import { WEBUI_API_BASE_URL } from '$lib/constants';

export const getAdminDetails = async (token: string) => {
	let error = null;

	const res = await fetch(`${WEBUI_API_BASE_URL}/auths/admin/details`, {
		method: 'GET',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${token}`
		}
	})
		.then(async (res) => {
			if (!res.ok) throw await res.json();
			return res.json();
		})
		.catch((err) => {
			console.error(err);
			error = err.detail;
			return null;
		});

	if (error) {
		throw error;
	}

	return res;
};

export const getAdminConfig = async (token: string) => {
	let error = null;

	const res = await fetch(`${WEBUI_API_BASE_URL}/auths/admin/config`, {
		method: 'GET',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${token}`
		}
	})
		.then(async (res) => {
			if (!res.ok) throw await res.json();
			return res.json();
		})
		.catch((err) => {
			console.error(err);
			error = err.detail;
			return null;
		});

	if (error) {
		throw error;
	}

	return res;
};

export const updateAdminConfig = async (token: string, body: object) => {
	let error = null;

	const res = await fetch(`${WEBUI_API_BASE_URL}/auths/admin/config`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${token}`
		},
		body: JSON.stringify(body)
	})
		.then(async (res) => {
			if (!res.ok) throw await res.json();
			return res.json();
		})
		.catch((err) => {
			console.error(err);
			error = err.detail;
			return null;
		});

	if (error) {
		throw error;
	}

	return res;
};

export const getSessionUser = async (token: string) => {
	let error = null;

	const res = await fetch(`${WEBUI_API_BASE_URL}/auths/`, {
		method: 'GET',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${token}`
		},
		credentials: 'include'
	})
		.then(async (res) => {
			if (!res.ok) throw await res.json();
			return res.json();
		})
		.catch((err) => {
			console.error(err);
			error = err.detail;
			return null;
		});

	if (error) {
		throw error;
	}

	return res;
};

export const ldapUserSignIn = async (user: string, password: string) => {
	let error = null;

	const res = await fetch(`${WEBUI_API_BASE_URL}/auths/ldap`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json'
		},
		credentials: 'include',
		body: JSON.stringify({
			user: user,
			password: password
		})
	})
		.then(async (res) => {
			if (!res.ok) throw await res.json();
			return res.json();
		})
		.catch((err) => {
			console.error(err);

			error = err.detail;
			return null;
		});

	if (error) {
		throw error;
	}

	return res;
};

export const getLdapConfig = async (token: string = '') => {
	let error = null;

	const res = await fetch(`${WEBUI_API_BASE_URL}/auths/admin/config/ldap`, {
		method: 'GET',
		headers: {
			'Content-Type': 'application/json',
			...(token && { authorization: `Bearer ${token}` })
		}
	})
		.then(async (res) => {
			if (!res.ok) throw await res.json();
			return res.json();
		})
		.catch((err) => {
			console.error(err);
			error = err.detail;
			return null;
		});

	if (error) {
		throw error;
	}

	return res;
};

export const updateLdapConfig = async (token: string = '', enable_ldap: boolean) => {
	let error = null;

	const res = await fetch(`${WEBUI_API_BASE_URL}/auths/admin/config/ldap`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			...(token && { authorization: `Bearer ${token}` })
		},
		body: JSON.stringify({
			enable_ldap: enable_ldap
		})
	})
		.then(async (res) => {
			if (!res.ok) throw await res.json();
			return res.json();
		})
		.catch((err) => {
			console.error(err);
			error = err.detail;
			return null;
		});

	if (error) {
		throw error;
	}

	return res;
};

export const getLdapServer = async (token: string = '') => {
	let error = null;

	const res = await fetch(`${WEBUI_API_BASE_URL}/auths/admin/config/ldap/server`, {
		method: 'GET',
		headers: {
			'Content-Type': 'application/json',
			...(token && { authorization: `Bearer ${token}` })
		}
	})
		.then(async (res) => {
			if (!res.ok) throw await res.json();
			return res.json();
		})
		.catch((err) => {
			console.error(err);
			error = err.detail;
			return null;
		});

	if (error) {
		throw error;
	}

	return res;
};

export const updateLdapServer = async (token: string = '', body: object) => {
	let error = null;

	const res = await fetch(`${WEBUI_API_BASE_URL}/auths/admin/config/ldap/server`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			...(token && { authorization: `Bearer ${token}` })
		},
		body: JSON.stringify(body)
	})
		.then(async (res) => {
			if (!res.ok) throw await res.json();
			return res.json();
		})
		.catch((err) => {
			console.error(err);
			error = err.detail;
			return null;
		});

	if (error) {
		throw error;
	}

	return res;
};

export const getOAuthConfig = async (token: string) => {
	let error = null;

	const res = await fetch(`${WEBUI_API_BASE_URL}/auths/admin/config/oauth`, {
		method: 'GET',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${token}`
		}
	})
		.then(async (res) => {
			if (!res.ok) throw await res.json();
			return res.json();
		})
		.catch((err) => {
			console.error(err);
			error = err.detail;
			return null;
		});

	if (error) {
		throw error;
	}

	return res;
};

export const updateOAuthConfig = async (token: string, body: object) => {
	let error = null;

	const res = await fetch(`${WEBUI_API_BASE_URL}/auths/admin/config/oauth`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${token}`
		},
		body: JSON.stringify(body)
	})
		.then(async (res) => {
			if (!res.ok) throw await res.json();
			return res.json();
		})
		.catch((err) => {
			console.error(err);
			error = err.detail;
			return null;
		});

	if (error) {
		throw error;
	}

	return res;
};

export const userSignIn = async (email: string, password: string) => {
	let error = null;

	const res = await fetch(`${WEBUI_API_BASE_URL}/auths/signin`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json'
		},
		credentials: 'include',
		body: JSON.stringify({
			email: email,
			password: password
		})
	})
		.then(async (res) => {
			if (!res.ok) throw await res.json();
			return res.json();
		})
		.catch((err) => {
			console.error(err);

			error = err.detail;
			return null;
		});

	if (error) {
		throw error;
	}

	return res;
};

export const userSignUp = async (
	name: string,
	email: string,
	password: string,
	profile_image_url: string
) => {
	let error = null;

	const res = await fetch(`${WEBUI_API_BASE_URL}/auths/signup`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json'
		},
		credentials: 'include',
		body: JSON.stringify({
			name: name,
			email: email,
			password: password,
			profile_image_url: profile_image_url
		})
	})
		.then(async (res) => {
			if (!res.ok) throw await res.json();
			return res.json();
		})
		.catch((err) => {
			console.error(err);
			error = err.detail;
			return null;
		});

	if (error) {
		throw error;
	}

	return res;
};

export const userSignOut = async () => {
	let error = null;

	const res = await fetch(`${WEBUI_API_BASE_URL}/auths/signout`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json'
		},
		credentials: 'include'
	})
		.then(async (res) => {
			if (!res.ok) throw await res.json();
			return res.json();
		})
		.catch((err) => {
			console.error(err);
			error = err.detail;
			return null;
		});

	if (error) {
		throw error;
	}

	sessionStorage.clear();
	return res;
};

/**
 * 川邮·星语定制：登出后的归宿。
 *
 * 上游默认把 post_logout_redirect_uri 指向 '/auth'，而本部署的 '/auth' 有一条
 * 「有 token cookie 就自动跳回聊天」的脚本；登出后 cookie 已清，页面便停在
 * OWUI 自己的登录/跳转态，用户感觉「被踢到了登录页」。
 *
 * 这里改为指向站点根路径 '/'，即与 Chat 同源部署的 Portal 主页（nginx 443 的
 * `location = /` 交给 Portal 静态页，并在带 post_logout_redirect_uri 参数时转交
 * 星语 /oidc/logout 完成两端会话吊销）。
 *
 * 防打转（关键）：Portal 主页上有「进入 Chat」入口，若 OWUI 无法区分「用户主动
 * 登出」与「其他原因落到 /auth」，就会形成 Portal → Chat → /auth → Portal 的死循环。
 * 因此用 sessionStorage 一次性标记：
 *   · OWUI 登录成功后写入标记，表示本会话确实是从 Chat 走出来的；
 *   · 登出时若标记存在 → 去 Portal 根路径（正常用户路径）；
 *   · 标记不存在（或本次已消费过）→ 退回上游默认行为（留在 /auth），
 *     绝不再往外跳，彻底断开环形跳转的可能。
 * 标记在 sessionStorage 而非 localStorage：关掉标签页即失效，语义上等价于
 * 「本次导航会话」。
 */
const XINGYU_CHAT_SESSION_KEY = 'xingyu:chat-session-active';
const XINGYU_PORTAL_EXIT_MARK = 'xingyu:portal-exit-done';

/**
 * Portal 的访问源（登出的最终归宿）。
 *
 * 为什么不能直接用当前 origin：Chat 跑在 `:8443`，Portal 跑在 `:443`（同一 host、
 * 不同端口）。若回跳写成 `https://host:8443/`，虽然星语的白名单按 host 比对会放行，
 * 但落地的却是 OWUI 首页而不是 Portal —— 用户会发现「登出后又被送回聊天页」。
 * 因此这里把端口剥掉，固定回到 Portal 源。
 * 也兼容将来切换到域名（ai-chat. / ai-platform. 子域名）的场景：届时只需改这个常量。
 */
const XINGYU_PORTAL_ORIGIN = 'https://10.255.12.210';

function resolvePortalOrigin(): string {
	if (typeof window === 'undefined') return XINGYU_PORTAL_ORIGIN;
	// 部署在标准端口（80/443）时，当前源就已经是 Portal 源，直接复用更稳
	// （避免硬编码常量在换域名后失效）。
	if (window.location.port === '' || window.location.port === '443') {
		return window.location.origin;
	}
	return XINGYU_PORTAL_ORIGIN;
}

function canExitToPortal(): boolean {
	if (typeof window === 'undefined' || typeof sessionStorage === 'undefined') return false;
	// 开发环境没有 Portal（根路径就是 OWUI 自己），不接管
	if (import.meta.env.DEV) return false;
	try {
		if (sessionStorage.getItem(XINGYU_PORTAL_EXIT_MARK) === '1') return false;
		return sessionStorage.getItem(XINGYU_CHAT_SESSION_KEY) === '1';
	} catch {
		return false;
	}
}

function markPortalExitDone(): void {
	try {
		sessionStorage.setItem(XINGYU_PORTAL_EXIT_MARK, '1');
	} catch {
		// sessionStorage 不可用时忽略：下次仍按 Portal 处理，最坏是多重定向一次。
	}
}

/** OWUI 登录成功后调用，标记本会话为「Chat 会话」，允许登出时回 Portal。 */
export const markXingyuChatSession = () => {
	if (typeof window === 'undefined' || typeof sessionStorage === 'undefined') return;
	try {
		sessionStorage.setItem(XINGYU_CHAT_SESSION_KEY, '1');
		sessionStorage.removeItem(XINGYU_PORTAL_EXIT_MARK);
	} catch {
		// 忽略
	}
};

export const getLogoutRedirectUrl = (redirectUrl?: string | null) => {
	const logoutUrl = new URL('/auth?state=logout', window.location.origin);
	// 川邮·星语：默认登出去向改为 Portal 主页（详见上方注释）；不可达时退回 /auth。
	const portalExit = canExitToPortal();
	const postLogoutUrl = portalExit
		? new URL('/', resolvePortalOrigin())
		: new URL('/auth', window.location.origin);
	if (portalExit) {
		markPortalExitDone();
	}
	if (!redirectUrl) {
		return logoutUrl.href;
	}

	const url = new URL(redirectUrl, window.location.origin);
	if (url.origin === window.location.origin && url.pathname === '/auth') {
		url.searchParams.set('state', 'logout');
		return url.href;
	}

	const postLogoutRedirectUri = url.searchParams.get('post_logout_redirect_uri');
	if (postLogoutRedirectUri) {
		// 川邮·星语：end_session_endpoint 已带 post_logout_redirect_uri（后端
		// WEBUI_AUTH_SIGNOUT_REDIRECT_URL 或 discovery）。若它是本站源（含 Portal 源），
		// 就按「回 Portal」处理，不要因为路径不是 /auth 就悄悄改回聊天页。
		const configuredPostLogoutUrl = new URL(postLogoutRedirectUri, window.location.origin);
		const isOwnOrigin = configuredPostLogoutUrl.origin === window.location.origin;
		if (portalExit && isOwnOrigin && configuredPostLogoutUrl.pathname === '/auth') {
			url.searchParams.set('post_logout_redirect_uri', postLogoutUrl.href);
		}
		if (isOwnOrigin) {
			url.searchParams.set('state', 'logout');
		}
		return url.href;
	}

	url.searchParams.set('post_logout_redirect_uri', postLogoutUrl.href);
	url.searchParams.set('state', 'logout');
	return url.href;
};

export const addUser = async (
	token: string,
	name: string,
	email: string,
	password: string,
	role: string = 'pending',
	profile_image_url: null | string = null
) => {
	let error = null;

	const res = await fetch(`${WEBUI_API_BASE_URL}/auths/add`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			...(token && { authorization: `Bearer ${token}` })
		},
		body: JSON.stringify({
			name: name,
			email: email,
			password: password,
			role: role,
			...(profile_image_url && { profile_image_url: profile_image_url })
		})
	})
		.then(async (res) => {
			if (!res.ok) throw await res.json();
			return res.json();
		})
		.catch((err) => {
			console.error(err);
			error = err.detail;
			return null;
		});

	if (error) {
		throw error;
	}

	return res;
};

export const updateUserProfile = async (token: string, profile: object) => {
	let error = null;

	const res = await fetch(`${WEBUI_API_BASE_URL}/auths/update/profile`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			...(token && { authorization: `Bearer ${token}` })
		},
		body: JSON.stringify({
			...profile
		})
	})
		.then(async (res) => {
			if (!res.ok) throw await res.json();
			return res.json();
		})
		.catch((err) => {
			console.error(err);
			error = err.detail;
			if (Array.isArray(error)) {
				error = error.map((e: { msg?: string }) => e.msg).join('; ');
			}
			return null;
		});

	if (error) {
		throw error;
	}

	return res;
};

export const updateUserTimezone = async (token: string, timezone: string) => {
	await fetch(`${WEBUI_API_BASE_URL}/auths/update/timezone`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			...(token && { authorization: `Bearer ${token}` })
		},
		body: JSON.stringify({ timezone })
	}).catch((err) => {
		console.error('Failed to update timezone:', err);
	});
};

export const updateUserPassword = async (token: string, password: string, newPassword: string) => {
	let error = null;

	const res = await fetch(`${WEBUI_API_BASE_URL}/auths/update/password`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			...(token && { authorization: `Bearer ${token}` })
		},
		body: JSON.stringify({
			password: password,
			new_password: newPassword
		})
	})
		.then(async (res) => {
			if (!res.ok) throw await res.json();
			return res.json();
		})
		.catch((err) => {
			console.error(err);
			error = err.detail;
			return null;
		});

	if (error) {
		throw error;
	}

	return res;
};

export const createAPIKey = async (token: string) => {
	let error = null;

	const res = await fetch(`${WEBUI_API_BASE_URL}/auths/api_key`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${token}`
		}
	})
		.then(async (res) => {
			if (!res.ok) throw await res.json();
			return res.json();
		})
		.catch((err) => {
			console.error(err);
			error = err.detail;
			return null;
		});
	if (error) {
		throw error;
	}
	return res.api_key;
};

export const getAPIKey = async (token: string) => {
	let error = null;

	const res = await fetch(`${WEBUI_API_BASE_URL}/auths/api_key`, {
		method: 'GET',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${token}`
		}
	})
		.then(async (res) => {
			if (!res.ok) throw await res.json();
			return res.json();
		})
		.catch((err) => {
			console.error(err);
			error = err.detail;
			return null;
		});
	if (error) {
		throw error;
	}
	return res.api_key;
};

export const deleteAPIKey = async (token: string) => {
	let error = null;

	const res = await fetch(`${WEBUI_API_BASE_URL}/auths/api_key`, {
		method: 'DELETE',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${token}`
		}
	})
		.then(async (res) => {
			if (!res.ok) throw await res.json();
			return res.json();
		})
		.catch((err) => {
			console.error(err);
			error = err.detail;
			return null;
		});
	if (error) {
		throw error;
	}
	return res;
};

export const deleteOAuthSession = async (token: string, provider: string) => {
	let error = null;

	const res = await fetch(
		`${WEBUI_API_BASE_URL}/auths/oauth/sessions/${encodeURIComponent(provider)}`,
		{
			method: 'DELETE',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${token}`
			}
		}
	)
		.then(async (res) => {
			if (!res.ok) throw await res.json();
			return res.json();
		})
		.catch((err) => {
			console.error(err);
			error = err.detail;
			return null;
		});

	if (error) {
		throw error;
	}

	return res;
};
