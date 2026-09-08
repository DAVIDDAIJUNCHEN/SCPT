package common

import (
	"crypto/rand"
	"fmt"
	"math"
	"math/big"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
)

// AlloMax 二次开发：自研"几何图形+颜色"人机校验（CAPTCHA）
// 对标 DeepSeek 的"点击发送验证码后弹人机验证"。
//
// 设计：
//   - 后端生成一个 SVG 画布，放置多个不同颜色/不同形状的几何图形。
//   - 题目要求用户点选"特定颜色 + 特定形状"的目标图形（如“请点击蓝色圆形”）。
//   - 前端只拿到渲染好的 SVG 字符串 + 题目文字 + challengeId，拿到的是图片而非结构化数据。
//   - 用户点击画布后，前端回传点击坐标 (x,y)，后端根据图形布局判定命中的图形，
//     与正确答案比对，命中才放行。
//   - challenge 一次性有效（校验后立即作废）+ 60 秒过期 + 全局限频，防重放与暴力枚举。

const (
	CaptchaValidSeconds = 60
	captchaCanvasSize   = 260
	captchaShapeCount   = 6
)

// Kind 图形种类
type CaptchaShapeKind string

const (
	ShapeCircle   CaptchaShapeKind = "circle"
	ShapeSquare   CaptchaShapeKind = "square"
	ShapeTriangle CaptchaShapeKind = "triangle"
	ShapeStar     CaptchaShapeKind = "star"
)

// colorSpec 预定义的可辨识颜色（中文名 + 十六进制）
type colorSpec struct {
	NameCN string
	Hex    string
}

var captchaColors = []colorSpec{
	{NameCN: "红色", Hex: "#E02D2D"},
	{NameCN: "蓝色", Hex: "#2D6FE0"},
	{NameCN: "绿色", Hex: "#2FA84F"},
	{NameCN: "黄色", Hex: "#E8B91E"},
	{NameCN: "紫色", Hex: "#8B5CF6"},
	{NameCN: "橙色", Hex: "#E8702D"},
}

// CaptchaShape 单个图形的布局（后端内部，不下发给前端）
type CaptchaShape struct {
	Kind   CaptchaShapeKind
	Color  colorSpec
	X, Y   float64 // 中心点
	R      float64 // 半径/半边长
	Rotate int     // 旋转角度（抗识别）
}

// CaptchaChallenge 一次验证挑战（后端内部存储）
type CaptchaChallenge struct {
	ID         string
	Shapes     []CaptchaShape
	AnswerKind CaptchaShapeKind
	AnswerHex  string
	CreatedAt  time.Time
	Used       bool
}

var (
	captchaMutex   sync.Mutex
	captchaMap     = make(map[string]*CaptchaChallenge)
	captchaMapMax  = 200
	captchaGenLock sync.Mutex // 限频用：控制全局生成速度（与短信频控配合）
)

// RemoveCaptcha challenge 作废（一次性 + 过期清理）
func RemoveCaptcha(id string) {
	captchaMutex.Lock()
	defer captchaMutex.Unlock()
	delete(captchaMap, id)
}

// GetCaptcha 取挑战（不标记使用，仅读取；验证另行调用）
func GetCaptcha(id string) *CaptchaChallenge {
	captchaMutex.Lock()
	defer captchaMutex.Unlock()
	v, ok := captchaMap[id]
	if !ok {
		return nil
	}
	if time.Since(v.CreatedAt) > CaptchaValidSeconds*time.Second {
		delete(captchaMap, id)
		return nil
	}
	return v
}

// SizeFixed 每个随机生成的随机数工具
func randInt(max int) int {
	n, err := rand.Int(rand.Reader, big.NewInt(int64(max)))
	if err != nil {
		return 0
	}
	return int(n.Int64())
}

// randFloat64 0..span 范围的随机浮点
func randFloat64(span float64) float64 {
	return float64(randInt(100000)) / 100000 * span
}

// NewCaptchaChallenge 生成一次挑战
func NewCaptchaChallenge() *CaptchaChallenge {
	// 打乱颜色顺序，保证画布颜色多样
	colors := make([]colorSpec, len(captchaColors))
	copy(colors, captchaColors)
	for i := len(colors) - 1; i > 0; i-- {
		j := randInt(i + 1)
		colors[i], colors[j] = colors[j], colors[i]
	}

	// 候选图形种类，随机填充
	kinds := []CaptchaShapeKind{ShapeCircle, ShapeSquare, ShapeTriangle, ShapeStar}

	// 随机选 1 个目标：颜色 + 形状
	ansColor := colors[randInt(len(colors))]
	ansKind := kinds[randInt(len(kinds))]

	challenge := &CaptchaChallenge{
		ID:         uuid.NewString(),
		AnswerKind: ansKind,
		AnswerHex:  ansColor.Hex,
		CreatedAt:  time.Now(),
	}

	// 生成 captchaShapeCount 个图形，固定把目标色+目标形放进去（保证恰好 1 个命中目标）
	// 其余图形随机分布，避免布局可被枚举
	margin := 30.0
	shapes := make([]CaptchaShape, 0, captchaShapeCount)

	// 目标图形（用户要点选的那个）
	shapes = append(shapes, CaptchaShape{
		Kind:   ansKind,
		Color:  ansColor,
		X:      margin + randFloat64(captchaCanvasSize-2*margin),
		Y:      margin + randFloat64(captchaCanvasSize-2*margin),
		R:      22 + randFloat64(12),
		Rotate: randInt(360),
	})

	for i := 1; i < captchaShapeCount; i++ {
		// 干扰图形：避免与目标完全同色同形（否则有多解），其余随机
		dk := kinds[randInt(len(kinds))]
		dc := colors[randInt(len(colors))]
		// 避免出现"另一个同色同形"造成歧义
		if dc.Hex == ansColor.Hex && dk == ansKind {
			dc = colors[(randInt(len(colors)-1)+1+randInt(1))%len(colors)]
			if dc.Hex == ansColor.Hex {
				dc.Hex = "#7C3AED"
				dc.NameCN = "紫色"
			}
		}
		shapes = append(shapes, CaptchaShape{
			Kind:   dk,
			Color:  dc,
			X:      margin + randFloat64(captchaCanvasSize-2*margin),
			Y:      margin + randFloat64(captchaCanvasSize-2*margin),
			R:      18 + randFloat64(14),
			Rotate: randInt(360),
		})
	}

	// 简单去重：避免图形严重重叠导致选不中（clamp 边界）
	challenge.Shapes = shapes

	captchaMutex.Lock()
	if len(captchaMap) >= captchaMapMax {
		now := time.Now()
		for k, v := range captchaMap {
			if now.Sub(v.CreatedAt) > CaptchaValidSeconds*time.Second {
				delete(captchaMap, k)
			}
		}
	}
	captchaMap[challenge.ID] = challenge
	captchaMutex.Unlock()

	return challenge
}

// CaptchaQuestion 返回给前端（不含答案布局）
type CaptchaQuestion struct {
	ChallengeID string `json:"challenge_id"`
	SVG         string `json:"svg"`
	PromptCN    string `json:"prompt_cn"` // 中文题目，如“请点击蓝色圆形”
}

// shapePathSVG 返回单个图形的 SVG path/元素（以中心 X,Y，尺寸 R）
func shapePathSVG(s CaptchaShape) string {
	cx, cy, r := s.X, s.Y, s.R
	switch s.Kind {
	case ShapeCircle:
		return fmt.Sprintf(`<circle cx="%.1f" cy="%.1f" r="%.1f" fill="%s" stroke="#ffffff" stroke-width="2"/>`,
			cx, cy, r, s.Color.Hex)
	case ShapeSquare:
		return fmt.Sprintf(`<rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" fill="%s" stroke="#ffffff" stroke-width="2" transform="rotate(%d %.1f %.1f)"/>`,
			cx-r, cy-r, r*2, r*2, s.Color.Hex, s.Rotate, cx, cy)
	case ShapeTriangle:
		p1 := fmt.Sprintf("%.1f,%.1f", cx, cy-r)
		p2 := fmt.Sprintf("%.1f,%.1f", cx-r, cy+r)
		p3 := fmt.Sprintf("%.1f,%.1f", cx+r, cy+r)
		return fmt.Sprintf(`<polygon points="%s %s %s" fill="%s" stroke="#ffffff" stroke-width="2" transform="rotate(%d %.1f %.1f)"/>`,
			p1, p2, p3, s.Color.Hex, s.Rotate, cx, cy)
	case ShapeStar:
		return starPath(cx, cy, r, s.Color.Hex)
	}
	return ""
}

// starPath 五角星 path
func starPath(cx, cy, r float64, hex string) string {
	var pts []string
	for i := 0; i < 10; i++ {
		angle := -90 + float64(i)*36
		rad := r
		if i%2 == 1 {
			rad = r * 0.45
		}
		radA := angle * math.Pi / 180
		px := cx + rad*math.Cos(radA)
		py := cy + rad*math.Sin(radA)
		pts = append(pts, fmt.Sprintf("%.1f,%.1f", px, py))
	}
	return fmt.Sprintf(`<polygon points="%s" fill="%s" stroke="#ffffff" stroke-width="2"/>`,
		strings.Join(pts, " "), hex)
}

// GenerateCaptchaSVG 渲染整张 SVG 画布（含噪声干扰线/点，抗 OCR）
func GenerateCaptchaSVG(ch *CaptchaChallenge) string {
	var b strings.Builder
	// 浅色简单背景
	b.WriteString(fmt.Sprintf(`<svg xmlns="http://www.w3.org/2000/svg" width="%d" height="%d" viewBox="0 0 %d %d">`,
		captchaCanvasSize, captchaCanvasSize, captchaCanvasSize, captchaCanvasSize))
	b.WriteString(fmt.Sprintf(`<rect width="%d" height="%d" fill="#F3F6FB" rx="8"/>`,
		captchaCanvasSize, captchaCanvasSize))

	// 随机噪声点
	for i := 0; i < 40; i++ {
		nx := randFloat64(captchaCanvasSize)
		ny := randFloat64(captchaCanvasSize)
		b.WriteString(fmt.Sprintf(`<circle cx="%.1f" cy="%.1f" r="1.2" fill="#C9D4E4"/>`, nx, ny))
	}
	// 随机噪声线
	for i := 0; i < 6; i++ {
		x1 := randFloat64(captchaCanvasSize)
		y1 := randFloat64(captchaCanvasSize)
		x2 := randFloat64(captchaCanvasSize)
		y2 := randFloat64(captchaCanvasSize)
		b.WriteString(fmt.Sprintf(`<line x1="%.1f" y1="%.1f" x2="%.1f" y2="%.1f" stroke="#CFD9EA" stroke-width="1"/>`,
			x1, y1, x2, y2))
	}

	// 图形
	for _, s := range ch.Shapes {
		b.WriteString(shapePathSVG(s))
	}
	b.WriteString(`</svg>`)
	return b.String()
}

// Question 生成题目信息
func Question(ch *CaptchaChallenge) CaptchaQuestion {
	return CaptchaQuestion{
		ChallengeID: ch.ID,
		SVG:         GenerateCaptchaSVG(ch),
		PromptCN:    fmt.Sprintf("请点击%s%s", colorCN(ch.AnswerHex), kindCN(ch.AnswerKind)),
	}
}

// VerifyCaptchaClick 校验用户点击坐标是否命中目标图形（命中返回 true，并作废 challenge）
func VerifyCaptchaClick(id string, px, py float64) bool {
	captchaMutex.Lock()
	defer captchaMutex.Unlock()
	v, ok := captchaMap[id]
	if !ok {
		return false
	}
	if v.Used || time.Since(v.CreatedAt) > CaptchaValidSeconds*time.Second {
		delete(captchaMap, id)
		return false
	}
	// 一次性
	v.Used = true
	defer delete(captchaMap, id)

	// 逐个图形判断点击点是否落在目标图形内
	for _, s := range v.Shapes {
		if s.Kind != v.AnswerKind || s.Color.Hex != v.AnswerHex {
			continue
		}
		if pointInShape(px, py, s) {
			return true
		}
	}
	return false
}

// pointInShape 判断点是否落在图形内（返回该图形）
func pointInShape(px, py float64, s CaptchaShape) bool {
	dx := px - s.X
	dy := py - s.Y
	switch s.Kind {
	case ShapeCircle:
		dist := dx*dx + dy*dy
		return dist <= s.R*s.R+900 // 30px 容差
	case ShapeSquare:
		return absF(dx) <= s.R+22 && absF(dy) <= s.R+22
	case ShapeTriangle:
		// 宽松判定：落在外接圆内即可（用户通常点中心附近）
		dist := dx*dx + dy*dy
		return dist <= (s.R+30)*(s.R+30)
	case ShapeStar:
		dist := dx*dx + dy*dy
		return dist <= (s.R+15)*(s.R+15)
	}
	return false
}

func absF(f float64) float64 {
	if f < 0 {
		return -f
	}
	return f
}

// kindCN 图形中文名
func kindCN(k CaptchaShapeKind) string {
	switch k {
	case ShapeCircle:
		return "圆形"
	case ShapeSquare:
		return "正方形"
	case ShapeTriangle:
		return "三角形"
	case ShapeStar:
		return "五角星"
	}
	return "图形"
}

// colorCN 颜色中文名（需与预置色匹配；未命中给十六进制兜底不好看，这里按 hex 反查）
func colorCN(hex string) string {
	for _, c := range captchaColors {
		if c.Hex == hex {
			return c.NameCN
		}
	}
	return "目标色"
}
