package service

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"net/url"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/system_setting"
)

// ImageAsset* implements capability URLs for generated image assets.
//
// Why this exists: some upstream image backends (e.g. SGLang serving FLUX)
// return a *relative* URL in `data[].url` such as
// "/v1/images/{id}/content" instead of an absolute URL or an inline b64 blob.
// A relative URL is meaningless to an API client (Open WebUI, SDK callers,
// curl), so the gateway must (a) rewrite it into an absolute URL pointing back
// at itself and (b) serve the bytes on that route.
//
// The URL is the only thing the client keeps, so it must be self-contained:
// the asset id alone is not enough to find the owning channel. The signature
// below binds the asset id to the channel id, and only holders of
// common.CryptoSecret can mint one. Reading an asset therefore requires no
// user session — matching how upstream serves these paths — while still
// preventing a caller from probing arbitrary channel/asset pairs.
const (
	// ImageAssetAccessQueryParameter is the capability token query key.
	ImageAssetAccessQueryParameter = "access"

	imageAssetAccessVersion = "image-asset-access-v1"

	// Base64 raw (unpadded) of a 32-byte HMAC-SHA256 digest is 43 characters:
	// ceil(32 / 3) * 4 = 44, minus 1 padding character = 43. Keep this in sync
	// with sha256.Size; deriving it wrong makes verification reject every
	// legitimate token.
	imageAssetAccessLength = (sha256.Size*8 + 5) / 6
)

// ErrImageAssetAccessInvalid is returned when an asset capability cannot be
// issued or verified.
var ErrImageAssetAccessInvalid = errors.New("image asset access is invalid")

const (
	maxImageAssetIDLength      = 200
	maxImageAssetChannelIDText = 20
)

func imageAssetAccessMessage(channelID, assetID string) []byte {
	return []byte(imageAssetAccessVersion + "\x00" + channelID + "\x00" + assetID)
}

// IssueImageAssetAccess creates a stable capability bound to exactly one asset
// id and the channel that owns it.
func IssueImageAssetAccess(channelID, assetID string) (string, error) {
	canonicalChannelID, ok := CanonicalImageAssetChannelID(channelID)
	if !ok {
		return "", ErrImageAssetAccessInvalid
	}
	assetID = strings.TrimSpace(assetID)
	if assetID == "" || len(assetID) > maxImageAssetIDLength || common.CryptoSecret == "" {
		return "", ErrImageAssetAccessInvalid
	}

	mac := hmac.New(sha256.New, []byte(common.CryptoSecret))
	_, _ = mac.Write(imageAssetAccessMessage(canonicalChannelID, assetID))
	return base64.RawURLEncoding.EncodeToString(mac.Sum(nil)), nil
}

// VerifyImageAssetAccess verifies the capability without touching any state.
// Signature comparison is constant-time.
func VerifyImageAssetAccess(access, channelID, assetID string) bool {
	canonicalChannelID, ok := CanonicalImageAssetChannelID(channelID)
	if !ok {
		return false
	}
	assetID = strings.TrimSpace(assetID)
	if len(access) != imageAssetAccessLength ||
		assetID == "" || len(assetID) > maxImageAssetIDLength ||
		common.CryptoSecret == "" {
		return false
	}

	actualSignature, err := base64.RawURLEncoding.Strict().DecodeString(access)
	if err != nil || len(actualSignature) != sha256.Size {
		return false
	}

	expectedSignature, err := IssueImageAssetAccess(canonicalChannelID, assetID)
	if err != nil {
		return false
	}
	expectedBytes, err := base64.RawURLEncoding.Strict().DecodeString(expectedSignature)
	if err != nil {
		return false
	}
	return hmac.Equal(actualSignature, expectedBytes)
}

// CanonicalImageAssetChannelID normalises a channel id to its canonical decimal
// text form. Callers MUST use this on both the signing and the verifying side,
// otherwise forms like "07" sign and verify differently.
func CanonicalImageAssetChannelID(channelID string) (string, bool) {
	channelID = strings.TrimSpace(channelID)
	if channelID == "" || len(channelID) > maxImageAssetChannelIDText {
		return "", false
	}
	parsed, err := strconv.Atoi(channelID)
	if err != nil || parsed <= 0 {
		return "", false
	}
	return strconv.Itoa(parsed), true
}

// BuildImageAssetContentURL returns the absolute URL a client should use to
// fetch a generated image served by the given channel.
//
// TaskPublicAddress wins when configured (it is the address end users can
// reach); ServerAddress is the fallback. The incoming request Host is
// deliberately not used: generated URLs are cached by clients and must stay
// valid regardless of which address the original call arrived on.
func BuildImageAssetContentURL(channelID, assetID string) (string, error) {
	canonicalChannelID, ok := CanonicalImageAssetChannelID(channelID)
	if !ok {
		return "", ErrImageAssetAccessInvalid
	}
	channelID = canonicalChannelID
	assetID = strings.TrimSpace(assetID)
	if assetID == "" {
		return "", ErrImageAssetAccessInvalid
	}

	baseAddress := strings.TrimSpace(system_setting.TaskPublicAddress)
	if baseAddress == "" {
		baseAddress = strings.TrimSpace(system_setting.ServerAddress)
	}
	if err := ValidateTaskArtifactBaseURL(baseAddress); err != nil {
		return "", err
	}
	baseURL, err := url.Parse(baseAddress)
	if err != nil {
		return "", err
	}

	access, err := IssueImageAssetAccess(channelID, assetID)
	if err != nil {
		return "", err
	}

	basePath := strings.TrimRight(baseURL.Path, "/")
	escapedBasePath := strings.TrimRight(baseURL.EscapedPath(), "/")
	suffixPath := "/v1/images/" + assetID + "/content"
	escapedSuffixPath := "/v1/images/" + url.PathEscape(assetID) + "/content"

	baseURL.Path = basePath + suffixPath
	baseURL.RawPath = escapedBasePath + escapedSuffixPath
	query := baseURL.Query()
	query.Set(ImageAssetAccessQueryParameter, access)
	// The owning channel is part of the URL so the content route can resolve an
	// upstream without a database lookup by asset id.
	query.Set("channel", channelID)
	baseURL.RawQuery = query.Encode()
	return baseURL.String(), nil
}

// IsRelativeImageAssetURL reports whether an image URL returned by an upstream
// needs gateway rewriting: it must be an absolute-path reference to an image
// content endpoint. Absolute URLs (http/https) and data URIs are left alone.
func IsRelativeImageAssetURL(raw string) bool {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return false
	}
	if strings.HasPrefix(raw, "data:") {
		return false
	}
	if strings.HasPrefix(raw, "//") {
		return false
	}
	return strings.HasPrefix(raw, "/") && !strings.Contains(raw, "://")
}