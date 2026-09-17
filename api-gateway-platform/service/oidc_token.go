package service

import (
	"bytes"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/binary"
	"encoding/hex"
	"encoding/pem"
	"errors"
	"fmt"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

// AlloMax S2.1a: OIDC Provider token 体系。
// 与 dashboard JWT（issuer=new-api, audience=new-api-dashboard）严格隔离：
// 独立 issuer/audience + RS256 非对称签名（JWKS 对外曝光公钥，私钥不出进程）。
//
// RS256 是硬要求：OWUI 的 authlib 客户端用 jwks_uri 验 id_token 签名，
// 对称密钥（HS256）无法安全暴露给验证方。
const (
	OIDCAccessTokenTTL = 30 * time.Minute
	OIDCIDTokenTTL     = 10 * time.Minute
)

var ErrOIDCTokenInvalid = errors.New("oidc token is invalid")

// OIDCProviderIssuer 返回 OIDC issuer（同时用于 discovery 文档与 JWT iss claim）。
// authlib 会严格校验 id_token.iss == discovery.issuer，两者必须同源。
// 必须通过 OIDC_PROVIDER_ISSUER 显式配置（如 https://10.255.12.210），
// 缺省时 OIDC Provider 视为未启用。
func OIDCProviderIssuer() string {
	return strings.TrimSuffix(strings.TrimSpace(os.Getenv("OIDC_PROVIDER_ISSUER")), "/")
}

var (
	oidcRSAOnce sync.Once
	oidcRSAKey  *rsa.PrivateKey
	oidcKeyID   string
	oidcRSAErr  error
)

// oidcRSAKeyPair 懒加载 RSA 签名密钥：
//  1. 优先读 OIDC_PROVIDER_RSA_PRIVATE_KEY（PEM PKCS#1/PKCS#8，支持 \n 转义），保证重启后 kid 稳定
//  2. 缺省临时生成 2048 位密钥（重启轮换；OWUI authlib 已处理 JWKS key rotation，会自动重取）
//
// kid 取公钥 SHA256 指纹前 16 hex，JWKS 与 JWT header 一致。
func oidcRSAKeyPair() (*rsa.PrivateKey, string, error) {
	oidcRSAOnce.Do(func() {
		pemStr := strings.TrimSpace(os.Getenv("OIDC_PROVIDER_RSA_PRIVATE_KEY"))
		if pemStr != "" {
			pemStr = strings.ReplaceAll(pemStr, "\\n", "\n")
			block, _ := pem.Decode([]byte(pemStr))
			if block == nil {
				oidcRSAErr = errors.New("OIDC_PROVIDER_RSA_PRIVATE_KEY is not a valid PEM block")
				return
			}
			var key *rsa.PrivateKey
			if k, err := x509.ParsePKCS1PrivateKey(block.Bytes); err == nil {
				key = k
			} else {
				k8, err8 := x509.ParsePKCS8PrivateKey(block.Bytes)
				if err8 != nil {
					oidcRSAErr = fmt.Errorf("OIDC_PROVIDER_RSA_PRIVATE_KEY parse failed: %v/%v", err, err8)
					return
				}
				rsaKey, ok := k8.(*rsa.PrivateKey)
				if !ok {
					oidcRSAErr = errors.New("OIDC_PROVIDER_RSA_PRIVATE_KEY is not an RSA key")
					return
				}
				key = rsaKey
			}
			oidcRSAKey = key
			common.SysLog("OIDC provider: loaded RSA signing key from OIDC_PROVIDER_RSA_PRIVATE_KEY")
		} else {
			key, err := rsa.GenerateKey(rand.Reader, 2048)
			if err != nil {
				oidcRSAErr = fmt.Errorf("generate RSA key failed: %v", err)
				return
			}
			oidcRSAKey = key
			common.SysLog("OIDC provider: generated ephemeral RSA signing key (set OIDC_PROVIDER_RSA_PRIVATE_KEY for a stable key across restarts)")
		}
		fingerprint := sha256.Sum256(oidcKeyDER(oidcRSAKey.PublicKey))
		oidcKeyID = hex.EncodeToString(fingerprint[:8])
	})
	return oidcRSAKey, oidcKeyID, oidcRSAErr
}

func oidcKeyDER(pub rsa.PublicKey) []byte {
	// PKCS#1 公钥 DER 作为 kid 指纹源（n+e 唯一确定公钥）
	data := pub.N.Bytes()
	data = append(data, byte(pub.E>>24), byte(pub.E>>16), byte(pub.E>>8), byte(pub.E))
	return data
}

// OIDCJWK 返回当前公钥的 JWK（RFC 7517）表示，用于 /api/oidc/jwks。
func OIDCJWK() (map[string]any, error) {
	key, kid, err := oidcRSAKeyPair()
	if err != nil {
		return nil, err
	}
	// RFC 7518 §6.3.1.2: exponent 编码为不含符号位的**大端二进制**的 base64url
	// （65537 -> b'\x01\x00\x01' -> "AQAB"），绝不能编码 "65537" 的 ASCII 字节串。
	eBytes := make([]byte, 4)
	binary.BigEndian.PutUint32(eBytes, uint32(key.PublicKey.E))
	eBytes = bytes.TrimLeft(eBytes, "\x00")
	return map[string]any{
		"kty": "RSA",
		"use": "sig",
		"alg": "RS256",
		"kid": kid,
		"n":   base64.RawURLEncoding.EncodeToString(key.PublicKey.N.Bytes()),
		"e":   base64.RawURLEncoding.EncodeToString(eBytes),
	}, nil
}

type OIDCClaims struct {
	Nonce            string   `json:"nonce,omitempty"`
	Scopes           []string `json:"scopes,omitempty"`
	Username         string   `json:"preferred_username,omitempty"`
	Name             string   `json:"name,omitempty"`
	Email            string   `json:"email,omitempty"`
	EmailVerified    bool     `json:"email_verified,omitempty"`
	jwt.RegisteredClaims
}

type OIDCIdentity struct {
	UserID   int
	Username string
	Scopes   []string
}

// oidcSignedClaims 用 RS256 统一签发（access/id token 共用；差异只在 TTL 与 claims 内容，
// 签名密钥相同、aud/iss 相同，由 OIDC 端点语义区分用途，符合常见 Provider 实践）。
func oidcSignedClaims(claims OIDCClaims, ttl time.Duration) (string, int64, error) {
	key, kid, err := oidcRSAKeyPair()
	if err != nil {
		return "", 0, fmt.Errorf("%w: %v", ErrOIDCTokenInvalid, err)
	}
	now := time.Now()
	expiresAt := now.Add(ttl)
	claims.Issuer = OIDCProviderIssuer()
	claims.ExpiresAt = jwt.NewNumericDate(expiresAt)
	claims.NotBefore = jwt.NewNumericDate(now.Add(-5 * time.Second))
	claims.IssuedAt = jwt.NewNumericDate(now)
	claims.ID = uuid.NewString()
	token := jwt.NewWithClaims(jwt.SigningMethodRS256, claims)
	token.Header["kid"] = kid
	signed, err := token.SignedString(key)
	return signed, expiresAt.Unix(), err
}

// IssueOIDCAccessToken issues the OIDC access_token (Bearer, userinfo 端点消费).
func IssueOIDCAccessToken(identity OIDCIdentity, audience, nonce string) (string, int64, error) {
	if identity.UserID <= 0 || audience == "" {
		return "", 0, ErrOIDCTokenInvalid
	}
	claims := OIDCClaims{
		Nonce:    nonce,
		Scopes:   identity.Scopes,
		Username: identity.Username,
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:  strconv.Itoa(identity.UserID),
			Audience: jwt.ClaimStrings{audience},
		},
	}
	return oidcSignedClaims(claims, OIDCAccessTokenTTL)
}

// IssueOIDCIDToken issues the OIDC id_token with standard identity claims
// (OWUI 从 id_token backfill userinfo 未返回的 claim，email 必须带上).
func IssueOIDCIDToken(identity OIDCIdentity, audience, nonce, email, name string) (string, int64, error) {
	if identity.UserID <= 0 || audience == "" {
		return "", 0, ErrOIDCTokenInvalid
	}
	claims := OIDCClaims{
		Nonce:            nonce,
		Scopes:           identity.Scopes,
		Username:         identity.Username,
		Name:             name,
		Email:            email,
		EmailVerified:    true,
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:  strconv.Itoa(identity.UserID),
			Audience: jwt.ClaimStrings{audience},
		},
	}
	return oidcSignedClaims(claims, OIDCIDTokenTTL)
}

// ParseOIDCAccessToken validates an OIDC access_token (Bearer) and returns identity.
func ParseOIDCAccessToken(raw, audience string) (OIDCIdentity, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" || audience == "" {
		return OIDCIdentity{}, ErrOIDCTokenInvalid
	}
	claims := &OIDCClaims{}
	parsed, err := jwt.ParseWithClaims(raw, claims, func(token *jwt.Token) (any, error) {
		if token.Method.Alg() != jwt.SigningMethodRS256.Alg() {
			return nil, fmt.Errorf("%w: unexpected signing method", ErrOIDCTokenInvalid)
		}
		key, _, err := oidcRSAKeyPair()
		if err != nil {
			return nil, fmt.Errorf("%w: %v", ErrOIDCTokenInvalid, err)
		}
		return &key.PublicKey, nil
	}, jwt.WithValidMethods([]string{jwt.SigningMethodRS256.Alg()}), jwt.WithIssuer(OIDCProviderIssuer()), jwt.WithAudience(audience), jwt.WithExpirationRequired(), jwt.WithLeeway(5*time.Second))
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
