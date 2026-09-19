package router

import (
	"embed"
	"net/http"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/controller"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/gin-contrib/gzip"
	"github.com/gin-contrib/static"
	"github.com/gin-gonic/gin"
)

// WebAssets holds the embedded dashboard frontend assets.
type WebAssets struct {
	BuildFS   embed.FS
	IndexPage []byte
}

func SetWebRouter(router *gin.Engine, assets WebAssets, pluginDispatcher gin.HandlerFunc) {
	frontendFS := common.EmbedFolder(assets.BuildFS, "web/dist")

	// ⚠️ Handler 顺序对限流语义有实质影响，不要随意调整：
	//
	// GlobalWebRateLimit 必须排在 static.Serve **之后**。给静态资源套限流会
	// 造成真实的可用性事故：前端一次首屏就有十几到几十个 /static/* 请求，
	// 而这些请求全部走 NoRoute，会一个不落地计入按 IP 的固定窗口配额。
	// 配额耗尽后浏览器拿不到 JS/CSS → 白屏或转圈，且报错在 Network 面板里
	// 是个 429，用户只会说「点了没反应」，极难定位。
	//
	// 更致命的是本平台部署在机房 NAT 之后：所有校外访问在网关侧都是同一个
	// ClientIP，配额是全校师生共享的，并发一上来必然击穿。
	//
	// static.Serve 命中时会 c.Abort()，因此把限流放在它后面，静态资源天然
	// 短路跳过，而 SPA fallback（返回 index.html）与 /api、/v1 的 404 分支
	// 依然受到限流保护——需要限流的正是这些，而不是构建产物。
	router.NoRoute(
		pluginDispatcher,
		middleware.RouteTag("web"),
		gzip.Gzip(gzip.DefaultCompression),
		middleware.Cache(),
		static.Serve("/", frontendFS),
		middleware.GlobalWebRateLimit(),
		func(c *gin.Context) {
			if strings.HasPrefix(c.Request.RequestURI, "/v1") || strings.HasPrefix(c.Request.RequestURI, "/api") || strings.HasPrefix(c.Request.RequestURI, "/assets") {
				controller.RelayNotFound(c)
				return
			}
			c.Header("Cache-Control", "no-cache")
			c.Data(http.StatusOK, "text/html; charset=utf-8", assets.IndexPage)
		},
	)
}
