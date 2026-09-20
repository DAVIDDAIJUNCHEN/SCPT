package ratio_setting

import (
	"testing"
	"time"
)

// mustLoad 载入时区，失败直接终止用例。
func mustLoad(loc string) *time.Location {
	l, err := time.LoadLocation(loc)
	if err != nil {
		panic(err)
	}
	return l
}

// TestTimeRatioBoundaries 覆盖默认配置下工作日（周一 2026-09-21）的关键边界：
// 区间语义为左闭右开，必须验证每个时段的首尾小时归属。
// 注：必须用工作日，否则会先命中「周末全天」规则。
func TestTimeRatioBoundaries(t *testing.T) {
	loc := mustLoad("Asia/Shanghai")

	cases := []struct {
		hour      int
		wantRatio float64
		wantName  string
	}{
		// 夜间低谷 22:00-次日 08:00（跨零点）
		{0, 0.5, "VALLEY"},
		{3, 0.5, "VALLEY"},
		{6, 0.5, "VALLEY"},
		{7, 0.5, "VALLEY"}, // 右开边界：07:00 仍在低谷
		{8, 1.0, ""},       // 低谷结束，回到空闲价

		// 早间空档
		{9, 2.0, "PEAK"},

		// 高峰 09:00-12:00
		{10, 2.0, "PEAK"},
		{11, 2.0, "PEAK"},
		{12, 1.0, ""}, // 右开边界

		// 午间平峰
		{13, 1.0, ""},

		// 高峰 14:00-18:00
		{14, 2.0, "PEAK"},
		{17, 2.0, "PEAK"},
		{18, 1.0, ""}, // 右开边界

		// 晚间平峰
		{19, 1.0, ""},
		{21, 1.0, ""},

		// 夜间低谷起点
		{22, 0.5, "VALLEY"},
		{23, 0.5, "VALLEY"},
	}

	for _, c := range cases {
		at := time.Date(2026, 9, 21, c.hour, 30, 0, 0, loc)
		got, name := GetTimeRatioAt(at)
		if got != c.wantRatio || name != c.wantName {
			t.Errorf("hour=%02d:00 期望 (%.2f, %q)，实际 (%.2f, %q)",
				c.hour, c.wantRatio, c.wantName, got, name)
		}
	}
}

// TestTimeRatioDisabled 关闭开关后应恒为 1.0。
func TestTimeRatioDisabled(t *testing.T) {
	backup := timeRatioSetting
	defer func() { timeRatioSetting = backup }()

	timeRatioSetting.Enabled = false
	loc := mustLoad("Asia/Shanghai")
	at := time.Date(2026, 9, 21, 10, 0, 0, 0, loc)

	if got, name := GetTimeRatioAt(at); got != 1.0 || name != "" {
		t.Errorf("关闭状态下期望 (1.0, \"\")，实际 (%.2f, %q)", got, name)
	}
}

// TestTimeRatioNoRule 规则为空时应恒为 1.0。
func TestTimeRatioNoRule(t *testing.T) {
	backup := timeRatioSetting
	defer func() { timeRatioSetting = backup }()

	timeRatioSetting.Rules = nil
	loc := mustLoad("Asia/Shanghai")
	at := time.Date(2026, 9, 21, 10, 0, 0, 0, loc)

	if got, _ := GetTimeRatioAt(at); got != 1.0 {
		t.Errorf("无规则时期望 1.0，实际 %.2f", got)
	}
}

// TestTimeRatioCrossMidnight 验证跨零点区间（23 -> 6）。
func TestTimeRatioCrossMidnight(t *testing.T) {
	backup := timeRatioSetting
	defer func() { timeRatioSetting = backup }()

	timeRatioSetting.Enabled = true
	timeRatioSetting.Rules = []TimeRatioRule{
		{Name: "NIGHT", StartHour: 23, EndHour: 6, Ratio: 0.3},
	}
	loc := mustLoad("Asia/Shanghai")

	cases := []struct {
		hour      int
		wantRatio float64
	}{
		{23, 0.3}, // 左闭
		{0, 0.3},
		{5, 0.3},
		{6, 1.0}, // 右开
		{12, 1.0},
		{22, 1.0},
	}
	for _, c := range cases {
		at := time.Date(2026, 9, 21, c.hour, 0, 0, 0, loc)
		if got, _ := GetTimeRatioAt(at); got != c.wantRatio {
			t.Errorf("跨零点 hour=%02d:00 期望 %.2f，实际 %.2f", c.hour, c.wantRatio, got)
		}
	}
}

// TestTimeRatioInvalidRule 非法规则（倍率非正、起止相同）应被跳过而非误命中。
func TestTimeRatioInvalidRule(t *testing.T) {
	backup := timeRatioSetting
	defer func() { timeRatioSetting = backup }()

	timeRatioSetting.Enabled = true
	timeRatioSetting.Rules = []TimeRatioRule{
		{Name: "BAD_ZERO", StartHour: 10, EndHour: 10, Ratio: 5.0}, // 起止相同
		{Name: "BAD_NEG", StartHour: 10, EndHour: 11, Ratio: -1.0}, // 负倍率
		{Name: "OK", StartHour: 10, EndHour: 12, Ratio: 1.5},
	}
	loc := mustLoad("Asia/Shanghai")
	at := time.Date(2026, 9, 21, 11, 0, 0, 0, loc)

	got, name := GetTimeRatioAt(at)
	if got != 1.5 || name != "OK" {
		t.Errorf("期望命中 OK(1.5)，实际 (%.2f, %q)", got, name)
	}
}

// TestTimeRatioWeekend 验证周末全天按空闲价（对标 DeepSeek 2026-08-23 规则）：
// 2026-09-19 是周六、2026-09-20 是周日，全天任意时刻都应为 1.0x WEEKEND。
// 周末价即基准价，因此不再打折——打折发生在工作日夜间档。
func TestTimeRatioWeekend(t *testing.T) {
	loc := mustLoad("Asia/Shanghai")

	// 周六（09-19）与周日（09-20），覆盖原高峰时段 10:00 与 15:00 及夜间 23:00
	weekend := []time.Time{
		time.Date(2026, 9, 19, 10, 0, 0, 0, loc), // 周六 10:00（工作日为高峰）
		time.Date(2026, 9, 19, 15, 0, 0, 0, loc), // 周六 15:00（工作日为高峰）
		time.Date(2026, 9, 20, 10, 0, 0, 0, loc), // 周日 10:00
		time.Date(2026, 9, 20, 23, 0, 0, 0, loc), // 周日 23:00
		time.Date(2026, 9, 20, 3, 0, 0, 0, loc),  // 周日 03:00（工作日为夜间低谷）
	}
	for _, at := range weekend {
		if got, name := GetTimeRatioAt(at); got != 1.0 || name != "WEEKEND" {
			t.Errorf("周末 %s 期望 (1.0, WEEKEND)，实际 (%.2f, %q)",
				at.Format("2006-01-02 15:04 Mon"), got, name)
		}
	}

	// 对照：工作日（09-21 周一）同一时刻应命中高峰 2.0x
	monday := time.Date(2026, 9, 21, 10, 0, 0, 0, loc)
	if got, name := GetTimeRatioAt(monday); got != 2.0 || name != "PEAK" {
		t.Errorf("周一 10:00 期望 (2.0, PEAK)，实际 (%.2f, %q)", got, name)
	}
}

// TestTimeRatioValleyPrecedence 验证跨零点低谷规则排在 PEAK 之前时的优先级。
// 这是历史缺陷回归测试：若 PEAK(09:00-12:00) 声明在 VALLEY(22→08) 之前，
// 则 22:00-24:00 会正确命中 VALLEY，但 00:00-08:00 段无所谓，
// 真正的风险是 08:00-12:00 被 PEAK 抢先——此处断言 07:59 与 08:00 的分界。
func TestTimeRatioValleyPrecedence(t *testing.T) {
	loc := mustLoad("Asia/Shanghai")

	// 低谷末端：07:59 仍属低谷，08:00 起回到空闲价
	lastValley := time.Date(2026, 9, 21, 7, 59, 0, 0, loc)
	if got, name := GetTimeRatioAt(lastValley); got != 0.5 || name != "VALLEY" {
		t.Errorf("周一 07:59 期望 (0.5, VALLEY)，实际 (%.2f, %q)", got, name)
	}
	firstIdle := time.Date(2026, 9, 21, 8, 0, 0, 0, loc)
	if got, name := GetTimeRatioAt(firstIdle); got != 1.0 || name != "" {
		t.Errorf("周一 08:00 期望 (1.0, \"\")，实际 (%.2f, %q)", got, name)
	}

	// 低谷起点：21:59 为空闲价，22:00 进入低谷
	lastIdle := time.Date(2026, 9, 21, 21, 59, 0, 0, loc)
	if got, name := GetTimeRatioAt(lastIdle); got != 1.0 || name != "" {
		t.Errorf("周一 21:59 期望 (1.0, \"\")，实际 (%.2f, %q)", got, name)
	}
	firstValley := time.Date(2026, 9, 21, 22, 0, 0, 0, loc)
	if got, name := GetTimeRatioAt(firstValley); got != 0.5 || name != "VALLEY" {
		t.Errorf("周一 22:00 期望 (0.5, VALLEY)，实际 (%.2f, %q)", got, name)
	}
}

// TestTimeRatioWeekdayFilter 验证 Days 过滤：限定周一生效的规则不应影响周二。
func TestTimeRatioWeekdayFilter(t *testing.T) {
	backup := timeRatioSetting
	defer func() { timeRatioSetting = backup }()

	timeRatioSetting.Enabled = true
	timeRatioSetting.Rules = []TimeRatioRule{
		{Name: "ONLY_MON", Days: []int{1}, StartHour: 0, EndHour: 24, Ratio: 3.0},
	}
	loc := mustLoad("Asia/Shanghai")

	monday := time.Date(2026, 9, 21, 12, 0, 0, 0, loc)
	if got, _ := GetTimeRatioAt(monday); got != 3.0 {
		t.Errorf("周一应命中 3.0，实际 %.2f", got)
	}

	tuesday := time.Date(2026, 9, 22, 12, 0, 0, 0, loc)
	if got, _ := GetTimeRatioAt(tuesday); got != 1.0 {
		t.Errorf("周二不应命中，期望 1.0，实际 %.2f", got)
	}
}

// TestTimeRatioPriority 规则按声明顺序，首个命中者生效。
func TestTimeRatioPriority(t *testing.T) {
	backup := timeRatioSetting
	defer func() { timeRatioSetting = backup }()

	timeRatioSetting.Enabled = true
	timeRatioSetting.Rules = []TimeRatioRule{
		{Name: "FIRST", StartHour: 8, EndHour: 20, Ratio: 1.2},
		{Name: "SECOND", StartHour: 10, EndHour: 12, Ratio: 3.0},
	}
	loc := mustLoad("Asia/Shanghai")
	at := time.Date(2026, 9, 21, 11, 0, 0, 0, loc)

	got, name := GetTimeRatioAt(at)
	if got != 1.2 || name != "FIRST" {
		t.Errorf("期望首个命中 FIRST(1.2)，实际 (%.2f, %q)", got, name)
	}
}

// TestTimeRatioTimezone 验证按配置时区换算：UTC 02:00 = 北京 10:00 → 高峰。
func TestTimeRatioTimezone(t *testing.T) {
	loc := mustLoad("Asia/Shanghai")
	at := time.Date(2026, 9, 21, 10, 0, 0, 0, loc)

	if got, _ := GetTimeRatioAt(at.UTC()); got != 2.0 {
		t.Errorf("UTC 时刻应换算到上海时区命中高峰，实际 %.2f", got)
	}
}

// TestDescribeTimeRatioRules 输出文本合理性（含关闭与无规则两种降级）。
func TestDescribeTimeRatioRules(t *testing.T) {
	backup := timeRatioSetting
	defer func() { timeRatioSetting = backup }()

	timeRatioSetting = TimeRatioSetting{Enabled: false}
	if s := DescribeTimeRatioRules(); s == "" {
		t.Error("关闭状态下描述不应为空")
	}

	timeRatioSetting = TimeRatioSetting{Enabled: true}
	if s := DescribeTimeRatioRules(); s == "" {
		t.Error("无规则状态下描述不应为空")
	}

	timeRatioSetting = TimeRatioSetting{
		Enabled: true,
		Rules:   []TimeRatioRule{{Name: "PEAK", StartHour: 9, EndHour: 12, Ratio: 2.0}},
	}
	if s := DescribeTimeRatioRules(); s == "" || len(s) < 5 {
		t.Errorf("有规则描述异常: %q", s)
	}
}
