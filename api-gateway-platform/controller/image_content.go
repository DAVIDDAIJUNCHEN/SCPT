package controller

import (
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/model"
	relaychannel "github.com/QuantumNous/new-api/relay/channel"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
)

// GetImageContent serves a generated image that lives on a channel's upstream.
//
// Upstreams such as SGLang (FLUX) return a relative URL in `data[].url`
// ("/v1/images/{id}/content") rather than an absolute URL or inline b64. The
// relay rewrites that to an absolute gateway URL carrying a signed capability
// (see service.BuildImageAssetContentURL) and this handler fetches the bytes
// from the owning channel on the client's behalf.
//
// The route is intentionally reachable without a user session: the signed
// capability is the authority, exactly as the upstream behaves. A caller
// cannot enumerate assets because the signature binds asset id to channel id
// and only the gateway holds CryptoSecret.
func GetImageContent(c *gin.Context) {
	assetID := strings.TrimSpace(c.Param("asset_id"))
	channelIDText := strings.TrimSpace(c.Query("channel"))
	access := strings.TrimSpace(c.Query(service.ImageAssetAccessQueryParameter))

	if assetID == "" || channelIDText == "" || access == "" {
		writeImageAssetError(c, http.StatusNotFound, "image_not_found", "Image not found")
		return
	}
	channelID, err := strconv.Atoi(channelIDText)
	if err != nil || channelID <= 0 {
		writeImageAssetError(c, http.StatusNotFound, "image_not_found", "Image not found")
		return
	}
	// VerifyImageAssetAccess takes the canonical channel id text; strconv.Itoa
	// normalises forms like "07" or "+7" so the signature check matches whatever
	// the URL carried.
	if !service.VerifyImageAssetAccess(access, strconv.Itoa(channelID), assetID) {
		// Deliberately identical to the not-found response: a caller must not be
		// able to distinguish "bad signature" from "asset does not exist".
		writeImageAssetError(c, http.StatusNotFound, "image_not_found", "Image not found")
		return
	}

	channel, err := model.CacheGetChannel(channelID)
	if err != nil || channel == nil {
		logger.LogError(c.Request.Context(), "image content channel unavailable: "+strconv.Itoa(channelID))
		writeImageAssetError(c, http.StatusServiceUnavailable, "image_channel_unavailable", "Image is no longer available")
		return
	}

	baseURL := strings.TrimRight(strings.TrimSpace(channel.GetBaseURL()), "/")
	if baseURL == "" {
		writeImageAssetError(c, http.StatusServiceUnavailable, "image_channel_unavailable", "Image is no longer available")
		return
	}

	descriptor := &relaychannel.TaskContentRequest{
		URL:            baseURL + "/v1/images/" + assetID + "/content",
		Method:         http.MethodGet,
		Credentialless: true,
	}

	// proxyMedia owns SSRF validation, redirect hardening, response header
	// filtering and streaming; reuse it instead of re-implementing that chain.
	if err := proxyMediaForChannel(c, channelID, descriptor); err != nil {
		writeImageAssetProxyError(c, err)
	}
}

func writeImageAssetError(c *gin.Context, status int, code, message string) {
	c.Header("Cache-Control", "private, no-store")
	c.JSON(status, gin.H{
		"error": gin.H{
			"message": message,
			"type":    code,
		},
	})
}

func writeImageAssetProxyError(c *gin.Context, err error) {
	if c.Writer.Written() {
		logger.LogError(c.Request.Context(), err.Error())
		return
	}
	// Upstream asset expiry and unreadable content are both "gone" from the
	// client's point of view; surface a 404 so clients know to regenerate rather
	// than retry. Everything else is an upstream/transport problem.
	if isImageAssetGone(err) {
		writeImageAssetError(c, http.StatusNotFound, "image_not_found", "Image not found")
		return
	}
	writeImageAssetError(c, http.StatusBadGateway, "image_upstream_error", "Failed to fetch image content")
}

// isImageAssetGone reports whether a proxy failure means the image bytes are
// permanently unavailable (expired upstream, or never existed), as opposed to a
// transient transport failure the client may retry.
//
// proxyMedia never returns http.StatusNotFound itself: it maps upstream 404/410
// to StatusGone, and uses 400 for a channel that no longer resolves. Both mean
// "these bytes are not coming back".
func isImageAssetGone(err error) bool {
	var proxyErr *taskMediaProxyError
	if !errors.As(err, &proxyErr) {
		return false
	}
	return proxyErr.status == http.StatusGone || proxyErr.status == http.StatusBadRequest
}