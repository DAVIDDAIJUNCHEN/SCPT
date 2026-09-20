package ratio_setting

import (
	"fmt"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/setting/config"
)

// TimeRatioRule 单个时段规则。
// 区间语义为左闭右开 [StartHour, EndHour)，24 小时制，按 Location 指定的时区判定。
// 支持跨零点区间（StartHour > EndHour，例如 23 → 6 表示 23:00-06:00）。
type TimeRatioRule struct {
	Name      string  `json:"name"`       // 时段标识，如 PEAK / VALLEY / NORMAL
	StartHour int     `json:"start_hour"` // 起始小时（含），0-23
	EndHour   int     `json:"end_hour"`   // 结束小时（不含），0-24
	Ratio     float64 `json:"ratio"`      // 计费倍率，<=0 视为无效规则被跳过

	// Days 限定规则生效的星期，留空表示每天都生效。
	// 取值 0=周日, 1=周一 … 6=周六（与 Go time.Weekday 一致）。
	// 用途：对标商业平台「周末全天按低谷计价」的规则。
	Days []int `json:"days,omitempty"`
}

// matchesDay 判断给定星期是否在规则生效范围内（Days 为空表示不限）。
func (r TimeRatioRule) matchesDay(w time.Weekday) bool {
	if len(r.Days) == 0 {
		return true
	}
	for _, d := range r.Days {
		if d == int(w) {
			return true
		}
	}
	return false
}

// TimeRatioSetting 时段倍率配置（星语第二批 4.2）。
//
// 设计目标：对标商业大模型平台的峰谷定价机制，用价格杠杆把非实时流量
// （批量任务、离线推理、科研跑批）从高峰挤到低谷，平抑算力峰值。
// 未命中任何规则的时段按 1.0 计，即不改变原有计费结果。
type TimeRatioSetting struct {
	Enabled  bool            `json:"enabled"`  // 总开关，关闭时全局倍率为 1.0
	Location string          `json:"location"` // 时区，默认 Asia/Shanghai
	Rules    []TimeRatioRule `json:"rules"`    // 时段规则，按声明顺序首个命中者生效
}

// 计费基准口径（重要）
//
// 星语把**官方空闲时段单价**锚定为 1.0x 基准（ModelRatio 直接照官方空闲价
// 换算），再由本模块叠加峰谷：高峰 2.0x、周末与夜间 0.5x。
// 这样处理之后，用户在工作日高峰之外调用星语，价格与官方**完全一致**；
// 工作日高峰则是官方的 2 倍——与官方同价竞争关系保持一致。
//
// 默认配置对标商业平台现行收费标准（2026-09-20 核实）：
//
//	DeepSeek 官方是国内首个采用峰谷分时计价的平台，规则历经两次调整：
//	  1) 2026-08-17 生效：工作日高峰（北京时间 09:00-12:00、14:00-18:00）
//	     价格为空闲时段的 2 倍；
//	  2) 2026-08-23 加码：周六、周日全天不再区分峰谷，统一按空闲价计价。
//
//	另有两家平台采用「夜间折扣」而非「高峰加价」，方向相反但效果相同：
//	  阿里云百炼：每日 22:00-08:00 五折；百度千帆：每日 21:00-08:00 二折。
//	  本配置取百炼口径（0.5x）作为夜间档，与 DeepSeek 空闲价基准自洽。
//
// 规则匹配「按声明顺序首个命中者生效」，因此顺序即优先级：
// 夜间低谷（22-次日08）必须排在 PEAK 之前，否则 08:00-12:00 的 PEAK
// 会先于跨零点的 VALLEY 命中而给出错误倍率。
//
// 所有值均可在「系统设置」中热改，无需重启。
var (
	satSun = []int{0, 6} // 周六、周日
)

var timeRatioSetting = TimeRatioSetting{
	Enabled:  true,
	Location: "Asia/Shanghai",
	Rules: []TimeRatioRule{
		// 1) 周末全天按空闲价（对标 DeepSeek 2026-08-23 规则）。
		//    必须先于所有按小时规则，否则工作日夜间档会在周六日误触发。
		{Name: "WEEKEND", Days: satSun, StartHour: 0, EndHour: 24, Ratio: 1.0},
		// 2) 工作日夜间低谷：22:00-次日 08:00，对标阿里云百炼 Night Plan 五折。
		//    跨零点区间，必须排在 PEAK 之前才不会被 08:00-12:00 抢走。
		{Name: "VALLEY", StartHour: 22, EndHour: 8, Ratio: 0.5},
		// 3) 工作日高峰（对标 DeepSeek 2026-08-17 规则），官方空闲价的 2 倍。
		{Name: "PEAK", StartHour: 9, EndHour: 12, Ratio: 2.0},
		{Name: "PEAK", StartHour: 14, EndHour: 18, Ratio: 2.0},
		// 其余时段（08:00-09:00 / 12:00-14:00 / 18:00-22:00）未命中任何规则，
		// 按 1.0x 计，即官方空闲价——与官方同价。
	},
}

func init() {
	config.GlobalConfig.Register("time_ratio_setting", &timeRatioSetting)
}

// GetTimeRatioSetting 返回时段倍率配置（后台读写与展示用）。
func GetTimeRatioSetting() *TimeRatioSetting {
	return &timeRatioSetting
}

// GetTimeRatio 返回当前时刻应使用的时段倍率。
func GetTimeRatio() float64 {
	ratio, _ := GetTimeRatioAt(time.Now())
	return ratio
}

// GetTimeRatioAt 返回指定时刻的时段倍率与命中的时段名。
// 配置未启用、无规则或未命中任何规则时，返回 (1.0, "")，即保持原价。
func GetTimeRatioAt(t time.Time) (float64, string) {
	s := &timeRatioSetting
	if !s.Enabled || len(s.Rules) == 0 {
		return 1.0, ""
	}
	if s.Location != "" {
		if loc, err := time.LoadLocation(s.Location); err == nil {
			t = t.In(loc)
		}
	}
	hour := t.Hour()
	weekday := t.Weekday()
	for _, r := range s.Rules {
		if r.Ratio <= 0 || r.StartHour == r.EndHour {
			continue
		}
		if !r.matchesDay(weekday) {
			continue
		}
		if r.StartHour >= 0 && r.StartHour < r.EndHour && r.EndHour <= 24 {
			// 同日区间
			if hour >= r.StartHour && hour < r.EndHour {
				return r.Ratio, r.Name
			}
			continue
		}
		// 跨零点区间，例如 23 → 6
		if hour >= r.StartHour || hour < r.EndHour {
			return r.Ratio, r.Name
		}
	}
	return 1.0, ""
}

// DescribeTimeRatioRules 把规则渲染成人类可读的一行文本，供后台与日志展示。
func DescribeTimeRatioRules() string {
	s := &timeRatioSetting
	if !s.Enabled {
		return "时段倍率：已关闭（全局 1.0x）"
	}
	if len(s.Rules) == 0 {
		return "时段倍率：无规则（全局 1.0x）"
	}
	parts := make([]string, 0, len(s.Rules))
	for _, r := range s.Rules {
		scope := ""
		if len(r.Days) > 0 {
			scope = "[" + describeDays(r.Days) + "] "
		}
		parts = append(parts, fmt.Sprintf("%s%s %02d:00-%02d:00 %.2fx", scope, r.Name, r.StartHour, r.EndHour, r.Ratio))
	}
	return "时段倍率：" + strings.Join(parts, " | ")
}

// describeDays 把星期列表渲染为「周六日」这类紧凑文本。
func describeDays(days []int) string {
	names := []string{"周日", "周一", "周二", "周三", "周四", "周五", "周六"}
	parts := make([]string, 0, len(days))
	for _, d := range days {
		if d >= 0 && d < len(names) {
			parts = append(parts, names[d])
		}
	}
	return strings.Join(parts, "")
}
