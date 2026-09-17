package service

import (
	"crypto/hmac"
	"crypto/sha256"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

// AlloMax S2.1a: OIDC Provider token 体系。
// 与 dashboard JWT（issuer=new-api, audience=new-api-dashboard）严格隔离：
// 独立 issuer/audience + 独立派生密钥，两者互不可冒用。
const (
	OIDCAccessTokenTTL = 30 * time.Minute
	OIDCTokenIssuer    = "new-api-oidc"
	OIDCTokenAudience  = "new-api-oidc-client"
	oidcAccessUse      = "oidc_access"
)

var ErrOIDCTokenInvalid = errors.New("oidc token is invalid")

func oidcSigningKey(use string) []byte {
	// 派生链与 dashboard 不同（new-api/oidc/ 前缀），即使 SessionSecret 相同也互不可解
	mac := hmac.New(sha256.New, []byte(common.SessionSecret))
	_, _ = mac.Write([]byte("new-api/oidc/" + use + "/v1"))
	return mac.Sum(nil)
}

type OIDCClaims struct {
	Nonce    string   `json:"nonce,omitempty"`
	Scopes   []string `json:"scopes,omitempty"`
	Username string   `json:"preferred_username,omitempty"`
	jwt.RegisteredClaims
}

type OIDCIdentity struct {
	UserID   int
	Username string
	Scopes   []string
}

// IssueOIDCAccessToken issues the OIDC access_token (also used as id_token carrier
// base: caller embeds nonce for id_token variant).
func IssueOIDCAccessToken(identity OIDCIdentity, nonce string) (string, int64, error) {
	if identity.UserID <= 0 {
		return "", 0, ErrOIDCTokenInvalid
	}
	now := time.Now()
	expiresAt := now.Add(OIDCAccessTokenTTL)
	claims := OIDCClaims{
		Nonce:    nonce,
		Scopes:   identity.Scopes,
		Username: identity.Username,
		RegisteredClaims: jwt.RegisteredClaims{
			Issuer:    OIDCTokenIssuer,
			Subject:   strconv.Itoa(identity.UserID),
			Audience:  jwt.ClaimStrings{OIDCTokenAudience},
			ExpiresAt: jwt.NewNumericDate(expiresAt),
			NotBefore: jwt.NewNumericDate(now.Add(-5 * time.Second)),
			IssuedAt:  jwt.NewNumericDate(now),
			ID:        uuid.NewString(),
		},
	}
	signed, err := jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString(oidcSigningKey(oidcAccessUse))
	return signed, expiresAt.Unix(), err
}

// IssueOIDCIDToken issues the OIDC id_token with standard identity claims.
func IssueOIDCIDToken(identity OIDCIdentity, nonce string) (string, int64, error) {
	if identity.UserID <= 0 {
		return "", 0, ErrOIDCTokenInvalid
	}
	now := time.Now()
	expiresAt := now.Add(OIDCAccessTokenTTL)
	claims := OIDCClaims{
		Nonce:    nonce,
		Scopes:   identity.Scopes,
		Username: identity.Username,
		RegisteredClaims: jwt.RegisteredClaims{
			Issuer:    OIDCTokenIssuer,
			Subject:   strconv.Itoa(identity.UserID),
			Audience:  jwt.ClaimStrings{OIDCTokenAudience},
			ExpiresAt: jwt.NewNumericDate(expiresAt),
			NotBefore: jwt.NewNumericDate(now.Add(-5 * time.Second)),
			IssuedAt:  jwt.NewNumericDate(now),
			ID:        uuid.NewString(),
		},
	}
	signed, err := jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString(oidcSigningKey("oidc_id"))
	return signed, expiresAt.Unix(), err
}

// ParseOIDCAccessToken validates an OIDC access_token (Bearer) and returns identity.
func ParseOIDCAccessToken(raw string) (OIDCIdentity, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return OIDCIdentity{}, ErrOIDCTokenInvalid
	}
	claims := &OIDCClaims{}
	parsed, err := jwt.ParseWithClaims(raw, claims, func(token *jwt.Token) (any, error) {
		if token.Method.Alg() != jwt.SigningMethodHS256.Alg() {
			return nil, fmt.Errorf("%w: unexpected signing method", ErrOIDCTokenInvalid)
		}
		return oidcSigningKey(oidcAccessUse), nil
	}, jwt.WithValidMethods([]string{jwt.SigningMethodHS256.Alg()}), jwt.WithIssuer(OIDCTokenIssuer), jwt.WithAudience(OIDCTokenAudience), jwt.WithExpirationRequired(), jwt.WithLeeway(5*time.Second))
	if err != nil {
		return OIDCIdentity{}, fmt.Errorf("%w: %v", ErrOIDCTokenInvalid, err)
	}
	if !parsed.Valid {
		return OIDCIdentity{}, ErrOIDCTokenInvalid
	}
	userID, err := strconv.Atoi(claims.Subject)
	if err != nil || userID <= 0 {
		return OIDCIdentity{}, ErrOIDCTokenInvalid
	}
	return OIDCIdentity{
		UserID:   userID,
		Username: claims.Username,
		Scopes:   claims.Scopes,
	}, nil
}
