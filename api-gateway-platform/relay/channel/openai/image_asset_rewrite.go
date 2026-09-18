package openai

import (
	"strconv"

	"github.com/QuantumNous/new-api/logger"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
	"github.com/tidwall/gjson"
	"github.com/tidwall/sjson"
)

// rewriteRelativeImageURLs makes upstream image responses usable by API clients.
//
// Some image backends (SGLang serving FLUX, and other OpenAI-compatible image
// servers that materialize files on disk) answer with a *relative* URL:
//
//	{"data":[{"url":"/v1/images/90e0eba5-.../content","b64_json":null}]}
//
// A relative URL is meaningless to a caller — Open WebUI, an SDK, or curl all
// resolve it against their own origin, which is why generated images appeared
// broken (404) even though the bytes were produced successfully. The gateway
// therefore rewrites every such URL into an absolute gateway URL that proxies
// the bytes back from the owning channel.
//
// Rules:
//   - b64_json responses and absolute http(s) URLs are left untouched.
//   - data: URIs are left untouched.
//   - Only relative absolute-path URLs are rewritten; anything else (protocol
//     relative "//host", garbage) is dropped so a client never receives an
//     unusable URL.
//
// The rewrite is best-effort: if no public base address is configured the
// original body is returned unchanged rather than failing an otherwise
// successful generation.
func rewriteRelativeImageURLs(c *gin.Context, info *relaycommon.RelayInfo, responseBody []byte) []byte {
	if info == nil || len(responseBody) == 0 {
		return responseBody
	}
	data := gjson.GetBytes(responseBody, "data")
	if !data.IsArray() {
		return responseBody
	}

	channelID := info.ChannelId
	if channelID <= 0 {
		return responseBody
	}
	channelIDText := strconv.Itoa(channelID)

	rewritten := responseBody
	changed := false
	for i, item := range data.Array() {
		rawURL := item.Get("url")
		if rawURL.Type != gjson.String {
			continue
		}
		urlValue := rawURL.String()
		if !service.IsRelativeImageAssetURL(urlValue) {
			continue
		}

		assetID := imageAssetIDFromContentPath(urlValue)
		if assetID == "" {
			continue
		}

		absolute, err := service.BuildImageAssetContentURL(channelIDText, assetID)
		if err != nil {
			logger.LogWarn(c.Request.Context(), "failed to build image asset URL for "+assetID+": "+err.Error())
			continue
		}

		next, err := sjson.SetBytes(rewritten, "data."+strconv.Itoa(i)+".url", absolute)
		if err != nil {
			logger.LogWarn(c.Request.Context(), "failed to rewrite image URL for "+assetID+": "+err.Error())
			continue
		}
		rewritten = next
		changed = true
	}
	if !changed {
		return responseBody
	}
	return rewritten
}

// imageAssetIDFromContentPath extracts the asset id from an upstream relative
// content path such as "/v1/images/{id}/content". Returns "" when the path does
// not have that shape, so unrelated relative URLs are not rewritten.
func imageAssetIDFromContentPath(path string) string {
	const prefix = "/v1/images/"
	const suffix = "/content"
	if len(path) <= len(prefix)+len(suffix) {
		return ""
	}
	if path[:len(prefix)] != prefix || path[len(path)-len(suffix):] != suffix {
		return ""
	}
	assetID := path[len(prefix) : len(path)-len(suffix)]
	if assetID == "" || containsSlash(assetID) {
		return ""
	}
	return assetID
}

func containsSlash(value string) bool {
	for i := 0; i < len(value); i++ {
		if value[i] == '/' {
			return true
		}
	}
	return false
}