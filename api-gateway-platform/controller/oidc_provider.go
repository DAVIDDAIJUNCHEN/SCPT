package controller

import (
	"fmt"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
)

// AlloMax S2.1a: 星语作为 OIDC Provider 的端点实现。
// 客户端凭据走环境变量（当前唯一客户端 = OWUI / xingyu-chat）：
//   OIDC_PROVIDER_ISSUER / OIDC_PROVIDER_CLIENT_ID / OIDC_PROVIDER_CLIENT_SECRET / OIDC_PROVIDER_REDIRECT_URIS（逗号分隔）
//
// 授权码复用 AuthFlow（purpose=oidc_code，HMAC 防伪 + 一次性原子消费 + TTL）。
// 签名 RS256 + JWKS：OWUI 的 authlib 客户端要求非对称验签（见 /api/oidc/jwks）。

const oidcAuthCodeTTL = 5 * time.Minute

// AssetsIndexPage SPA 首页（index.html），由 router 层初始化时注入，
// 供 OIDCAuthorizeRedirect 不满足直通条件时放行到 SPA 授权页（保留原 URL query）。
var AssetsIndexPage []byte

// oidcEmailFallbackDomain 无 email 用户（手机号注册）的合成 email 域，
// OWUI 默认无 email 即拒绝登录（ENABLE_OAUTH_EMAIL_FALLBACK 才有兜底，不可依赖），
// 因此星语侧永远返回 email。
const oidcEmailFallbackDomain = "oidc.xingyu.local"

type oidcAuthorizeRequest struct {
	ClientID            string `json:"client_id"`
	RedirectURI         string `json:"redirect_uri"`
	State               string `json:"state"`
	Scope               string `json:"scope"`
	Nonce               string `json:"nonce"`
	ResponseType        string `json:"response_type"`
	CodeChallenge       string `json:"code_challenge"`
	CodeChallengeMethod string `json:"code_challenge_method"`
}

type oidcCodePayload struct {
	ClientID    string `json:"client_id"`
	RedirectURI string `json:"redirect_uri"`
	Scope       string `json:"scope"`
	Nonce       string `json:"nonce,omitempty"`
	SessionID   string `json:"session_id,omitempty"`
}

// oidcOAuthError 按 RFC 6749 返回标准 OAuth 错误格式（非星语包裹格式）
func oidcOAuthError(c *gin.Context, status int, code, description string) {
	c.JSON(status, gin.H{
		"error":             code,
		"error_description": description,
	})
}

func oidcClientID() string {
	return strings.TrimSpace(common.GetEnvOrDefaultString("OIDC_PROVIDER_CLIENT_ID", ""))
}

func oidcClientSecret() string {
	return strings.TrimSpace(common.GetEnvOrDefaultString("OIDC_PROVIDER_CLIENT_SECRET", ""))
}

func oidcRedirectURIs() []string {
	raw := common.GetEnvOrDefaultString("OIDC_PROVIDER_REDIRECT_URIS", "")
	var uris []string
	for _, uri := range strings.Split(raw, ",") {
		uri = strings.TrimSpace(uri)
		if uri != "" {
			uris = append(uris, uri)
		}
	}
	return uris
}

// OIDCProviderConfigured GET /api/oidc/config — 前端授权页探测 Provider 是否启用
func OIDCProviderConfigured(c *gin.Context) {
	enabled := service.OIDCProviderIssuer() != "" && oidcClientID() != "" && oidcClientSecret() != ""
	common.ApiSuccess(c, gin.H{"enabled": enabled})
}

// OIDCDiscovery GET /.well-known/openid-configuration — OIDC Discovery 文档。
// authlib 用 urljoin(base_url, '/.well-known/openid-configuration') 探测，必须挂根路径。
func OIDCDiscovery(c *gin.Context) {
	if service.OIDCProviderIssuer() == "" || oidcClientID() == "" {
		oidcOAuthError(c, http.StatusNotFound, "not_configured", "OIDC Provider 未启用")
		return
	}
	issuer := service.OIDCProviderIssuer()
	c.JSON(http.StatusOK, gin.H{
		"issuer":                                issuer,
		"authorization_endpoint":                issuer + "/oidc/authorize",
		"token_endpoint":                        issuer + "/api/oidc/token",
		"userinfo_endpoint":                     issuer + "/api/oidc/userinfo",
		"jwks_uri":                              issuer + "/api/oidc/jwks",
		"registration_endpoint":                 "",
		"scopes_supported":                      []string{"openid", "profile", "email"},
		"response_types_supported":              []string{"code"},
		"response_modes_supported":              []string{"query"},
		"grant_types_supported":                 []string{"authorization_code"},
		"subject_types_supported":               []string{"public"},
		"id_token_signing_alg_values_supported": []string{"RS256"},
		"token_endpoint_auth_methods_supported": []string{"client_secret_post", "client_secret_basic"},
		"claims_supported":                      []string{"sub", "iss", "aud", "exp", "iat", "nonce", "preferred_username", "name", "email", "email_verified"},
	})
}

// OIDCJWKS GET /api/oidc/jwks — RSA 公钥曝光（authlib 验 id_token 签名用）。
func OIDCJWKS(c *gin.Context) {
	jwk, err := service.OIDCJWK()
	if err != nil {
		oidcOAuthError(c, http.StatusInternalServerError, "server_error", "签名密钥不可用")
		return
	}
	c.JSON(http.StatusOK, gin.H{"keys": []gin.H{jwk}})
}

// OIDCAuthorize POST /api/oidc/authorize — UserAuth 鉴权，用户已登录并确认授权后签发授权码
func OIDCAuthorize(c *gin.Context) {
	var request oidcAuthorizeRequest
	if err := common.DecodeJson(c.Request.Body, &request); err != nil {
		common.ApiErrorI18n(c, "参数错误")
		return
	}
	request.ClientID = strings.TrimSpace(request.ClientID)
	request.RedirectURI = strings.TrimSpace(request.RedirectURI)
	request.Scope = strings.TrimSpace(request.Scope)
	request.Nonce = strings.TrimSpace(request.Nonce)

	if request.ClientID == "" || service.OIDCProviderIssuer() == "" || oidcClientID() == "" || oidcClientSecret() == "" {
		common.ApiErrorMsg(c, "OIDC Provider 未启用")
		return
	}
	if request.ClientID != oidcClientID() {
		common.ApiErrorMsg(c, "client_id 不匹配")
		return
	}
	allowed := false
	for _, uri := range oidcRedirectURIs() {
		if uri == request.RedirectURI {
			allowed = true
			break
		}
	}
	if !allowed {
		common.ApiErrorMsg(c, "redirect_uri 未注册")
		return
	}
	if request.ResponseType != "" && request.ResponseType != "code" {
		oidcOAuthError(c, http.StatusBadRequest, "unsupported_response_type", "仅支持 response_type=code")
		return
	}

	identity, ok := middleware.GetSessionAuthIdentity(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"success": false, "message": "请先登录"})
		return
	}

	scopes := parseOIDCScopes(request.Scope)
	payload, err := common.Marshal(oidcCodePayload{
		ClientID:    request.ClientID,
		RedirectURI: request.RedirectURI,
		Scope:       strings.Join(scopes, " "),
		Nonce:       request.Nonce,
		SessionID:   identity.SessionID,
	})
	if err != nil {
		common.ApiError(c, err)
		return
	}
	expiresAt := time.Now().Add(oidcAuthCodeTTL)
	code, _, err := model.CreateAuthFlow(model.AuthFlowCreate{
		Purpose:   model.AuthFlowPurposeOIDCCode,
		Provider:  request.ClientID,
		Intent:    model.AuthFlowIntentLogin,
		UserId:    identity.UserID,
		SessionId: identity.SessionID,
		Payload:   string(payload),
		ExpiresAt: expiresAt,
	})
	if err != nil {
		common.ApiError(c, err)
		return
	}
	// AlloMax S2.x B1: 授权码签发成功即视为用户同意（首次）或复用既有授权，
	// 落库授权记忆，后续登录前端查询到 consent 后自动跳过同意页。
	if err := model.SaveOIDCConsent(identity.UserID, request.ClientID, strings.Join(scopes, " ")); err != nil {
		// 授权记忆落库失败不影响登录主流程，仅记日志
		logger.LogError(c.Request.Context(), fmt.Sprintf("[OIDC-Provider] save consent failed: %s", err.Error()))
	} else {
		model.TouchOIDCConsent(identity.UserID, request.ClientID)
	}
	common.ApiSuccess(c, gin.H{
		"code":       code,
		"state":      request.State,
		"expires_at": expiresAt.Unix(),
	})
}

// OIDCAuthorizeRedirect GET /oidc/authorize — B1+ 服务端直通。
// 顶层导航（登录后整页跳转 / 用户直接访问授权 URL）时，若会话有效且已有
// 覆盖请求 scope 的授权记忆，直接签发授权码并 302 回 callback，浏览器零页面
// 渲染，彻底消除授权页闪现。任一条件不满足则放行到 SPA 授权页（原流程）。
func OIDCAuthorizeRedirect(c *gin.Context) {
	// 放行到 SPA 授权页（登录页/同意页流程由前端路由接管）
	spaFallback := func() {
		c.Header("Cache-Control", "no-cache")
		c.Data(http.StatusOK, "text/html; charset=utf-8", AssetsIndexPage)
	}

	// 基本参数校验（与 POST authorize 同口径）
	clientID := strings.TrimSpace(c.Query("client_id"))
	redirectURI := strings.TrimSpace(c.Query("redirect_uri"))
	scope := strings.TrimSpace(c.Query("scope"))
	if clientID == "" || redirectURI == "" || service.OIDCProviderIssuer() == "" || oidcClientID() == "" || oidcClientSecret() == "" {
		spaFallback()
		return
	}
	if clientID != oidcClientID() {
		spaFallback()
		return
	}
	allowed := false
	for _, uri := range oidcRedirectURIs() {
		if uri == redirectURI {
			allowed = true
			break
		}
	}
	if !allowed {
		spaFallback()
		return
	}

	// 会话识别：顶层 GET 无 Authorization 头，从 refresh cookie 提取 sid。
	// 只验证 sid 对应 session 活性（refresh secret 不参与，避免轮换竞态）。
	rawRefreshToken, cookieErr := c.Cookie(service.RefreshCookieName)
	if cookieErr != nil || rawRefreshToken == "" {
		spaFallback()
		return
	}
	sid, ok := service.RefreshTokenSID(rawRefreshToken)
	if !ok {
		spaFallback()
		return
	}
	session, err := model.GetUserSessionCached(sid)
	if err != nil || session.Status != model.UserSessionStatusActive || session.RevokedAt != 0 || session.ExpiresAt <= time.Now().Unix() {
		spaFallback()
		return
	}
	identity, err := service.ValidateSessionReference(session.UserID, sid)
	if err != nil {
		spaFallback()
		return
	}

	// 授权记忆判定：scope 覆盖才直通，否则仍需用户显式同意
	if !model.HasOIDCConsent(identity.UserID, clientID, scope) {
		spaFallback()
		return
	}

	// 全部条件满足：签发授权码 + 302 callback（零页面渲染直通）
	scopes := parseOIDCScopes(scope)
	payload, err := common.Marshal(oidcCodePayload{
		ClientID:    clientID,
		RedirectURI: redirectURI,
		Scope:       strings.Join(scopes, " "),
		Nonce:       strings.TrimSpace(c.Query("nonce")),
		SessionID:   identity.SessionID,
	})
	if err != nil {
		spaFallback()
		return
	}
	code, _, err := model.CreateAuthFlow(model.AuthFlowCreate{
		Purpose:   model.AuthFlowPurposeOIDCCode,
		Provider:  clientID,
		Intent:    model.AuthFlowIntentLogin,
		UserId:    identity.UserID,
		SessionId: identity.SessionID,
		Payload:   string(payload),
		ExpiresAt: time.Now().Add(oidcAuthCodeTTL),
	})
	if err != nil {
		spaFallback()
		return
	}
	model.TouchOIDCConsent(identity.UserID, clientID)

	callback, err := url.Parse(redirectURI)
	if err != nil {
		spaFallback()
		return
	}
	q := callback.Query()
	q.Set("code", code)
	if state := c.Query("state"); state != "" {
		q.Set("state", state)
	}
	callback.RawQuery = q.Encode()
	c.Redirect(http.StatusFound, callback.String())
}

// OIDCConsentStatus GET /api/oidc/consent?client_id=&scope= — 前端授权页查询
// 当前用户对该 client 是否已有覆盖请求 scope 的授权记忆（有则自动跳过同意页）。
func OIDCConsentStatus(c *gin.Context) {
	clientId := strings.TrimSpace(c.Query("client_id"))
	scope := strings.TrimSpace(c.Query("scope"))
	if clientId == "" {
		common.ApiErrorMsg(c, "缺少 client_id")
		return
	}
	identity, ok := middleware.GetSessionAuthIdentity(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"success": false, "message": "请先登录"})
		return
	}
	if clientId != oidcClientID() {
		// 未知 client 一律要求显式同意
		common.ApiSuccess(c, gin.H{"granted": false})
		return
	}
	granted := model.HasOIDCConsent(identity.UserID, clientId, scope)
	common.ApiSuccess(c, gin.H{"granted": granted})
}

func parseOIDCScopes(scope string) []string {
	allowed := map[string]bool{"openid": true, "profile": true, "email": true}
	var result []string
	seen := map[string]bool{}
	for _, s := range strings.Fields(scope) {
		if allowed[s] && !seen[s] {
			seen[s] = true
			result = append(result, s)
		}
	}
	if len(result) == 0 {
		result = []string{"openid"}
	}
	return result
}

type oidcTokenRequest struct {
	GrantType    string `json:"grant_type" form:"grant_type"`
	Code         string `json:"code" form:"code"`
	RedirectURI  string `json:"redirect_uri" form:"redirect_uri"`
	ClientID     string `json:"client_id" form:"client_id"`
	ClientSecret string `json:"client_secret" form:"client_secret"`
}

// OIDCToken POST /api/oidc/token — 授权码换 access_token + id_token（标准 OAuth 错误格式）
func OIDCToken(c *gin.Context) {
	var request oidcTokenRequest
	// RFC 6749: form 或 JSON 双解析（OWUI 部分版本用 JSON POST）
	contentType := c.GetHeader("Content-Type")
	if strings.Contains(contentType, "application/json") {
		if err := common.DecodeJson(c.Request.Body, &request); err != nil {
			oidcOAuthError(c, http.StatusBadRequest, "invalid_request", "请求体解析失败")
			return
		}
	} else {
		if err := c.ShouldBind(&request); err != nil {
			oidcOAuthError(c, http.StatusBadRequest, "invalid_request", "请求体解析失败")
			return
		}
	}

	// 客户端凭据：form body 或 Basic auth 二选一
	clientID, clientSecret := strings.TrimSpace(request.ClientID), strings.TrimSpace(request.ClientSecret)
	if clientID == "" || clientSecret == "" {
		bid, bsecret, hasBasic := c.Request.BasicAuth()
		if hasBasic {
			clientID, clientSecret = strings.TrimSpace(bid), strings.TrimSpace(bsecret)
		}
	}
	if clientID == "" || clientSecret == "" {
		oidcOAuthError(c, http.StatusUnauthorized, "invalid_client", "缺少客户端凭据")
		return
	}
	if clientID != oidcClientID() || clientSecret != oidcClientSecret() {
		oidcOAuthError(c, http.StatusUnauthorized, "invalid_client", "客户端凭据不匹配")
		return
	}
	if request.GrantType != "authorization_code" {
		oidcOAuthError(c, http.StatusBadRequest, "unsupported_grant_type", "仅支持 authorization_code")
		return
	}
	if strings.TrimSpace(request.Code) == "" {
		oidcOAuthError(c, http.StatusBadRequest, "invalid_request", "缺少授权码")
		return
	}

	// 原子消费授权码（一次性，防重放）
	flow, err := model.ConsumeAuthFlow(strings.TrimSpace(request.Code), model.AuthFlowMatch{
		Purpose:  model.AuthFlowPurposeOIDCCode,
		Provider: clientID,
		Intent:   model.AuthFlowIntentLogin,
	})
	if err != nil {
		oidcOAuthError(c, http.StatusBadRequest, "invalid_grant", "授权码无效或已使用")
		return
	}

	var payload oidcCodePayload
	if err := common.UnmarshalJsonStr(flow.Payload, &payload); err != nil {
		oidcOAuthError(c, http.StatusBadRequest, "invalid_grant", "授权码负载损坏")
		return
	}
	// redirect_uri 必须与授权时一致（RFC 6749 §4.1.3）
	if payload.RedirectURI != "" && strings.TrimSpace(request.RedirectURI) != payload.RedirectURI {
		oidcOAuthError(c, http.StatusBadRequest, "invalid_grant", "redirect_uri 与授权请求不一致")
		return
	}

	user, err := model.GetUserById(flow.UserId, false)
	if err != nil || user == nil || user.Status != common.UserStatusEnabled {
		oidcOAuthError(c, http.StatusBadRequest, "invalid_grant", "用户不存在或已禁用")
		return
	}

	identity := service.OIDCIdentity{
		UserID:   user.Id,
		Username: user.Username,
		Scopes:   strings.Fields(payload.Scope),
	}
	// audience = client_id（authlib 校验 id_token.aud 含 client_id）
	accessToken, accessExpires, err := service.IssueOIDCAccessToken(identity, clientID, payload.Nonce)
	if err != nil {
		oidcOAuthError(c, http.StatusInternalServerError, "server_error", "签发访问令牌失败")
		return
	}
	// id_token 携带身份 claim（OWUI 从 id_token backfill userinfo 缺失项，email 必须有）
	idToken, _, err := service.IssueOIDCIDToken(identity, clientID, payload.Nonce, oidcUserEmail(user), oidcUserDisplayName(user))
	if err != nil {
		oidcOAuthError(c, http.StatusInternalServerError, "server_error", "签发身份令牌失败")
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"access_token":  accessToken,
		"id_token":      idToken,
		"token_type":    "Bearer",
		"expires_in":    int64(time.Until(time.Unix(accessExpires, 0)).Seconds()),
		"scope":         payload.Scope,
	})
}

// oidcUserEmail 返回用户 email；无 email 用户（手机号注册）合成占位 email，
// 保证 OWUI（默认无 email 即拒）始终可登录。
func oidcUserEmail(user *model.User) string {
	if user.Email != "" {
		return user.Email
	}
	return fmt.Sprintf("%d@%s", user.Id, oidcEmailFallbackDomain)
}

func oidcUserDisplayName(user *model.User) string {
	if user.DisplayName != "" {
		return user.DisplayName
	}
	return user.Username
}

// OIDCUserinfo GET /api/oidc/userinfo — Bearer access_token → 标准声明
func OIDCUserinfo(c *gin.Context) {
	authHeader := c.GetHeader("Authorization")
	if !strings.HasPrefix(authHeader, "Bearer ") {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid_token", "error_description": "缺少 Bearer 令牌"})
		return
	}
	identity, err := service.ParseOIDCAccessToken(strings.TrimPrefix(authHeader, "Bearer "), oidcClientID())
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid_token", "error_description": "令牌无效或已过期"})
		return
	}
	user, err := model.GetUserById(identity.UserID, false)
	if err != nil || user == nil || user.Status != common.UserStatusEnabled {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid_token", "error_description": "用户不存在或已禁用"})
		return
	}

	claims := gin.H{
		"sub":                strconv.Itoa(user.Id),
		"preferred_username": user.Username,
		"name":               oidcUserDisplayName(user),
		"email":              oidcUserEmail(user),
		"email_verified":     user.Email != "",
	}
	c.JSON(http.StatusOK, claims)
}
