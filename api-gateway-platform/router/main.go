package router

import (
	"fmt"
	"net/http"
	"os"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/controller"
	"github.com/QuantumNous/new-api/middleware"

	"github.com/gin-gonic/gin"
)

func SetRouter(router *gin.Engine, assets WebAssets) {
	SetApiRouter(router)
	SetDashboardRouter(router)
	SetRelayRouter(router)
	SetTaskPluginProtocolRouter(router)
	SetVideoRouter(router)
	SetTaskRouter(router)
	pluginDispatcher := SetPluginRouter(router)
	// AlloMax S2.1a: OIDC Discovery 必须挂根路径
	// （authlib 按 urljoin(base_url, '/.well-known/openid-configuration') 探测）
	router.GET(
		"/.well-known/openid-configuration",
		middleware.RouteTag("api"),
		middleware.CriticalRateLimit(),
		controller.OIDCDiscovery,
	)
	// AlloMax B1+: 登录后 OIDC 授权服务端直通。
	// 原流程 GET /oidc/authorize 是纯 SPA 路由（NoRoute 兜底），必须完整加载
	// SPA 渲染品牌页后才能跳 callback，产生约 1s 的过渡静态页闪现。
	// 此处注册精确路由（优先于 NoRoute）：会话有效 + 授权记忆覆盖 scope 时
	// 直接签发授权码 302 回 callback，零页面渲染；否则放行到 SPA 授权页。
	// 仅内嵌前端模式注册（外置前端模式由 NoRoute 302 到 FRONTEND_BASE_URL，SPA 照常处理）。
	frontendBaseUrl := os.Getenv("FRONTEND_BASE_URL")
	if common.IsMasterNode && frontendBaseUrl != "" {
		frontendBaseUrl = ""
		common.SysLog("FRONTEND_BASE_URL is ignored on master node")
	}
	if frontendBaseUrl == "" {
		controller.AssetsIndexPage = assets.IndexPage
		router.GET(
			"/oidc/authorize",
			middleware.RouteTag("web"),
			middleware.GlobalWebRateLimit(),
			controller.OIDCAuthorizeRedirect,
		)
		SetWebRouter(router, assets, pluginDispatcher)
	} else {
		frontendBaseUrl = strings.TrimSuffix(frontendBaseUrl, "/")
		router.NoRoute(
			pluginDispatcher,
			middleware.RouteTag("web"),
			func(c *gin.Context) {
				c.Redirect(http.StatusMovedPermanently, fmt.Sprintf("%s%s", frontendBaseUrl, c.Request.RequestURI))
			},
		)
	}
}
