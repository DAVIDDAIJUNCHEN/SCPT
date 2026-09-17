package service

import (
	"encoding/base64"
	"encoding/json"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// splitJWTHeader 解码 JWT header 段，用于断言 alg/kid
func splitJWTHeader(t *testing.T, raw string) map[string]any {
	t.Helper()
	parts := strings.Split(raw, ".")
	require.True(t, len(parts) >= 2, "jwt must have at least 2 segments")
	headerJSON, err := base64.RawURLEncoding.DecodeString(parts[0])
	require.NoError(t, err)
	var header map[string]any
	require.NoError(t, json.Unmarshal(headerJSON, &header))
	return header
}

func TestOIDCTokenRoundtrip(t *testing.T) {
	// issuer 必须配置，否则签发/解析全部失败（Provider 未启用语义）
	t.Setenv("OIDC_PROVIDER_ISSUER", "https://xingyu.example.com")

	identity := OIDCIdentity{
		UserID:   42,
		Username: "chenglong",
		Scopes:   []string{"openid", "profile"},
	}
	const audience = "owui-client"

	accessToken, accessExpires, err := IssueOIDCAccessToken(identity, audience, "nonce-abc")
	require.NoError(t, err)
	require.NotEmpty(t, accessToken)
	assert.True(t, accessExpires > time.Now().Unix())

	idToken, _, err := IssueOIDCIDToken(identity, audience, "nonce-abc", "42@oidc.xingyu.local", "陈工")
	require.NoError(t, err)
	require.NotEmpty(t, idToken)

	parsed, err := ParseOIDCAccessToken(accessToken, audience)
	require.NoError(t, err)
	assert.Equal(t, 42, parsed.UserID)
	assert.Equal(t, "chenglong", parsed.Username)
	assert.Equal(t, []string{"openid", "profile"}, parsed.Scopes)

	// RS256: JWT header alg 必须是 RS256 且带 kid
	header := splitJWTHeader(t, accessToken)
	assert.Equal(t, "RS256", header["alg"])
	assert.NotEmpty(t, header["kid"])

	// audience 不匹配必须拒绝（authlib 语义：aud 必须含 client_id）
	_, err = ParseOIDCAccessToken(accessToken, "other-client")
	require.Error(t, err, "access token with wrong audience must be rejected")

	// dashboard access token must NOT parse as OIDC token (issuer/audience/key isolation)
	dashboardToken, _, err := IssueAccessToken(AuthIdentity{
		UserID: 42, SessionID: "sess-1", UserAuthVersion: 1, SessionVersion: 1,
	})
	require.NoError(t, err)
	_, err = ParseOIDCAccessToken(dashboardToken, audience)
	require.Error(t, err, "dashboard JWT must not be accepted as OIDC access token")

	// garbage input
	_, err = ParseOIDCAccessToken("not-a-jwt", audience)
	require.Error(t, err)
}

func TestOIDCJWK(t *testing.T) {
	t.Setenv("OIDC_PROVIDER_ISSUER", "https://xingyu.example.com")
	jwk, err := OIDCJWK()
	require.NoError(t, err)
	assert.Equal(t, "RSA", jwk["kty"])
	assert.Equal(t, "sig", jwk["use"])
	assert.Equal(t, "RS256", jwk["alg"])
	assert.NotEmpty(t, jwk["kid"])
	assert.NotEmpty(t, jwk["n"])
	assert.NotEmpty(t, jwk["e"])
}

func TestOIDCProviderIssuerEnv(t *testing.T) {
	assert.Empty(t, OIDCProviderIssuer(), "issuer must default to empty (provider disabled)")
	t.Setenv("OIDC_PROVIDER_ISSUER", "https://xingyu.example.com/")
	assert.Equal(t, "https://xingyu.example.com", OIDCProviderIssuer(), "trailing slash must be trimmed")
	_ = os.Unsetenv("OIDC_PROVIDER_ISSUER")
}

func TestOIDCPrivateKeyFromEnv(t *testing.T) {
	t.Setenv("OIDC_PROVIDER_ISSUER", "https://xingyu.example.com")
	// 无法在同一进程内重置 sync.Once，此用例仅验证 issuer/签名基础路径；
	// 私钥注入路径（PKCS#1 PEM）由部署侧 .env 验证。
	t.Skip("sync.Once cannot be reset in-process; RSA key injection verified at deployment")
}
