package model

import (
	"time"

	"gorm.io/gorm"
)

// UsageStatsRow 用量聚合单行（按模型/用户/渠道维度）
type UsageStatsRow struct {
	Key              string `json:"key"`
	Count            int64  `json:"count"`
	TotalQuota       int64  `json:"total_quota"`
	PromptTokens     int64  `json:"prompt_tokens"`
	CompletionTokens int64  `json:"completion_tokens"`
	TotalTokens      int64  `json:"total_tokens"`
	UseTime          int64  `json:"use_time"`
}

// UsageOverview 用量总览
type UsageOverview struct {
	TotalCalls       int64 `json:"total_calls"`
	TotalQuota       int64 `json:"total_quota"`
	TotalTokens      int64 `json:"total_tokens"`
	ActiveUsers      int64 `json:"active_users"`
	ActiveModels     int64 `json:"active_models"`
	ActiveChannels   int64 `json:"active_channels"`
	AvgUseTimeMillis int64 `json:"avg_use_time_millis"`
}

// usageStatsBaseTx 返回 type=消费 且带时间过滤的查询
func usageStatsBaseTx(startTs int64, endTs int64) *gorm.DB {
	tx := LOG_DB.Table("logs").Where("type = ?", LogTypeConsume)
	if startTs != 0 {
		tx = tx.Where("created_at >= ?", startTs)
	}
	if endTs != 0 {
		tx = tx.Where("created_at <= ?", endTs)
	}
	return tx
}

func scanUsageStats(rows []struct {
	Key              string
	Count            int64
	TotalQuota       int64
	PromptTokens     int64
	CompletionTokens int64
	UseTime          int64
}) []UsageStatsRow {
	out := make([]UsageStatsRow, 0, len(rows))
	for _, r := range rows {
		out = append(out, UsageStatsRow{
			Key:              r.Key,
			Count:            r.Count,
			TotalQuota:       r.TotalQuota,
			PromptTokens:     r.PromptTokens,
			CompletionTokens: r.CompletionTokens,
			TotalTokens:      r.PromptTokens + r.CompletionTokens,
			UseTime:          r.UseTime,
		})
	}
	return out
}

// GetUsageOverview 用量总览
func GetUsageOverview(startTs int64, endTs int64) (*UsageOverview, error) {
	overview := &UsageOverview{}
	err := usageStatsBaseTx(startTs, endTs).
		Select("count(DISTINCT username) AS active_users, count(DISTINCT model_name) AS active_models, count(DISTINCT channel_name) AS active_channels").
		Scan(&overview).Error
	if err != nil {
		return nil, err
	}
	err = usageStatsBaseTx(startTs, endTs).
		Select("count(*) AS total_calls, COALESCE(sum(quota),0) AS total_quota, COALESCE(sum(prompt_tokens + completion_tokens),0) AS total_tokens, COALESCE(ROUND(avg(use_time))::bigint,0) AS avg_use_time_millis").
		Scan(&overview).Error
	return overview, err
}

// GetUsageStatsByModel 按模型聚合
func GetUsageStatsByModel(startTs int64, endTs int64) ([]UsageStatsRow, error) {
	rows := []struct {
		Key              string
		Count            int64
		TotalQuota       int64
		PromptTokens     int64
		CompletionTokens int64
		UseTime          int64
	}{}
	err := usageStatsBaseTx(startTs, endTs).
		Select("COALESCE(model_name,'-') AS key, count(*) AS count, COALESCE(sum(quota),0) AS total_quota, COALESCE(sum(prompt_tokens),0) AS prompt_tokens, COALESCE(sum(completion_tokens),0) AS completion_tokens, COALESCE(sum(use_time),0) AS use_time").
		Group("model_name").Order("count DESC").Scan(&rows).Error
	if err != nil {
		return nil, err
	}
	return scanUsageStats(rows), nil
}

// GetUsageStatsByUser 按用户聚合
func GetUsageStatsByUser(startTs int64, endTs int64) ([]UsageStatsRow, error) {
	rows := []struct {
		Key              string
		Count            int64
		TotalQuota       int64
		PromptTokens     int64
		CompletionTokens int64
		UseTime          int64
	}{}
	err := usageStatsBaseTx(startTs, endTs).
		Select("COALESCE(username,'-') AS key, count(*) AS count, COALESCE(sum(quota),0) AS total_quota, COALESCE(sum(prompt_tokens),0) AS prompt_tokens, COALESCE(sum(completion_tokens),0) AS completion_tokens, COALESCE(sum(use_time),0) AS use_time").
		Group("username").Order("count DESC").Scan(&rows).Error
	if err != nil {
		return nil, err
	}
	return scanUsageStats(rows), nil
}

// GetUsageStatsByChannel 按渠道聚合
func GetUsageStatsByChannel(startTs int64, endTs int64) ([]UsageStatsRow, error) {
	rows := []struct {
		Key              string
		Count            int64
		TotalQuota       int64
		PromptTokens     int64
		CompletionTokens int64
		UseTime          int64
	}{}
	err := usageStatsBaseTx(startTs, endTs).
		Select("COALESCE(channel_name,'-') AS key, count(*) AS count, COALESCE(sum(quota),0) AS total_quota, COALESCE(sum(prompt_tokens),0) AS prompt_tokens, COALESCE(sum(completion_tokens),0) AS completion_tokens, COALESCE(sum(use_time),0) AS use_time").
		Group("channel_name").Order("count DESC").Scan(&rows).Error
	if err != nil {
		return nil, err
	}
	return scanUsageStats(rows), nil
}

// GetUsageTrend 按天趋势（最近 n 天）
func GetUsageTrend(days int) ([]UsageStatsRow, error) {
	if days <= 0 {
		days = 7
	}
	start := time.Now().AddDate(0, 0, -days).Unix()
	rows := []struct {
		Key              string
		Count            int64
		TotalQuota       int64
		PromptTokens     int64
		CompletionTokens int64
		UseTime          int64
	}{}
	// 按天聚合: created_at 是秒级 Unix
	err := usageStatsBaseTx(start, 0).
		Select("to_char(to_timestamp(created_at), 'YYYY-MM-DD') AS key, count(*) AS count, COALESCE(sum(quota),0) AS total_quota, COALESCE(sum(prompt_tokens),0) AS prompt_tokens, COALESCE(sum(completion_tokens),0) AS completion_tokens, COALESCE(sum(use_time),0) AS use_time").
		Group("key").Order("key ASC").Scan(&rows).Error
	if err != nil {
		return nil, err
	}
	return scanUsageStats(rows), nil
}
