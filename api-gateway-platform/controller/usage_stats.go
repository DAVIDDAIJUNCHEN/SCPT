package controller

import (
	"strconv"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"

	"github.com/gin-gonic/gin"
)

// 用量分析（B4-3）
// 管理员维度：总览 + 按模型/用户/渠道聚合 + 按天趋势
// 数据源: logs 表 type=LogTypeConsume(2)

func nowUnix() int64 {
	return time.Now().Unix()
}

// parseStatWindow 解析时间窗口: ?days=N(最近N天) 或 ?start=&end=(秒级Unix)
// 返回 (startTs, endTs)
func parseStatWindow(c *gin.Context) (int64, int64) {
	daysStr := c.Query("days")
	if daysStr != "" {
		days, err := strconv.Atoi(daysStr)
		if err == nil && days > 0 {
			now := nowUnix()
			return now - int64(days)*86400, 0
		}
	}
	start, _ := strconv.ParseInt(c.Query("start"), 10, 64)
	end, _ := strconv.ParseInt(c.Query("end"), 10, 64)
	return start, end
}

// GetUsageOverview GET /api/usage-stats/overview?days=7
func GetUsageOverview(c *gin.Context) {
	start, end := parseStatWindow(c)
	ov, err := model.GetUsageOverview(start, end)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, ov)
}

// GetUsageByModel GET /api/usage-stats/by-model?days=7
func GetUsageByModel(c *gin.Context) {
	start, end := parseStatWindow(c)
	rows, err := model.GetUsageStatsByModel(start, end)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, rows)
}

// GetUsageByUser GET /api/usage-stats/by-user?days=7
func GetUsageByUser(c *gin.Context) {
	start, end := parseStatWindow(c)
	rows, err := model.GetUsageStatsByUser(start, end)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, rows)
}

// GetUsageByChannel GET /api/usage-stats/by-channel?days=7
func GetUsageByChannel(c *gin.Context) {
	start, end := parseStatWindow(c)
	rows, err := model.GetUsageStatsByChannel(start, end)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, rows)
}

// GetUsageTrend GET /api/usage-stats/trend?days=7
func GetUsageTrend(c *gin.Context) {
	days, _ := strconv.Atoi(c.Query("days"))
	if days <= 0 {
		days = 7
	}
	rows, err := model.GetUsageTrend(days)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, rows)
}
