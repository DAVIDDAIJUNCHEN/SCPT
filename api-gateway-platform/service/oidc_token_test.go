package service

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestOIDCTokenRoundtrip(t *testing.T) {
	identity := OIDCIdentity{
		UserID:   42,
		Username: "chenglong",
		Scopes:   []string{"openid", "profile"},
	}

	accessToken, accessExpires, err := IssueOIDCAccessToken(identity, "nonce-abc")
	require.NoError(t, err)
	require.NotEmpty(t, accessToken)
	assert.True(t, accessExpires > time.Now().Unix())

	idToken, _, err := IssueOIDCIDToken(identity, "nonce-abc")
	require.NoError(t, err)
	require.NotEmpty(t, idToken)

	parsed, err := ParseOIDCAccessToken(accessToken)
	require.NoError(t, err)
	assert.Equal(t, 42, parsed.UserID)
	assert.Equal(t, "chenglong", parsed.Username)
	assert.Equal(t, []string{"openid", "profile"}, parsed.Scopes)

	// dashboard access token must NOT parse as OIDC token (issuer/audience/key isolation)
	dashboardToken, _, err := IssueAccessToken(AuthIdentity{
		UserID: 42, SessionID: "sess-1", UserAuthVersion: 1, SessionVersion: 1,
	})
	require.NoError(t, err)
	_, err = ParseOIDCAccessToken(dashboardToken)
	require.Error(t, err, "dashboard JWT must not be accepted as OIDC access token")

	// id_token must NOT parse as access token (different key use)
	_, err = ParseOIDCAccessToken(idToken)
	require.Error(t, err, "id_token must not be accepted as access token")

	// garbage input
	_, err = ParseOIDCAccessToken("not-a-jwt")
	require.Error(t, err)
}
