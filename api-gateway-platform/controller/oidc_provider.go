package controller

import (
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
)

// AlloMax S2.1a: 星语作为 OIDC Provider 的三端点实现。
// 客户端凭据走环境变量（当前唯一客户端 = OWUI / xingyu-chat）：
//   OIDC_PROVIDER_CLIENT_ID / OIDC_PROVIDER_CLIENT_SECRET / OIDC_PROVIDER_REDIRECT_URIS（逗号分隔）
//
// 授权码复用 AuthFlow（purpose=oidc_code，HMAC 防伪 + 一次性原子消费 + TTL）。

const oidcAuthCodeTTL = 5 * time.Minute

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
	enabled := oidcClientID() != "" && oidcClientSecret() != ""
	common.ApiSuccess(c, gin.H{"enabled": enabled})
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

	if request.ClientID == "" || oidcClientID() == "" || oidcClientSecret() == "" {
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
	common.ApiSuccess(c, gin.H{
		"code":       code,
		"state":      request.State,
		"expires_at": expiresAt.Unix(),
	})
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
	accessToken, accessExpires, err := service.IssueOIDCAccessToken(identity, payload.Nonce)
	if err != nil {
		oidcOAuthError(c, http.StatusInternalServerError, "server_error", "签发访问令牌失败")
		return
	}
	idToken, _, err := service.IssueOIDCIDToken(identity, payload.Nonce)
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

// OIDCUserinfo GET /api/oidc/userinfo — Bearer access_token → 标准声明
func OIDCUserinfo(c *gin.Context) {
	authHeader := c.GetHeader("Authorization")
	if !strings.HasPrefix(authHeader, "Bearer ") {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid_token", "error_description": "缺少 Bearer 令牌"})
		return
	}
	identity, err := service.ParseOIDCAccessToken(strings.TrimPrefix(authHeader, "Bearer "))
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
	}
	if user.DisplayName != "" {
		claims["name"] = user.DisplayName
	}
	if user.Email != "" {
		claims["email"] = user.Email
	}
	c.JSON(http.StatusOK, claims)
}
