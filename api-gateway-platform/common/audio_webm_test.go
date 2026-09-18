package common

import (
	"bytes"
	"encoding/binary"
	"math"
	"testing"
)

// ─────────────────────────────────────────────────────────────────────
// 测试数据构造：手工拼 EBML/WebM 结构
//
// 为什么要手写而不用现成文件：需要精确模拟**浏览器 MediaRecorder 的输出特征**
// —— 有 EBML 头、有 Segment（unknown size）、有 Cluster(Timecode + SimpleBlock)，
// 但**没有 SeekHead / 没有 Duration 元素**（流式录制的典型形态）。
// 这正是 2026-09-18 语音输入失败的场景。
// ─────────────────────────────────────────────────────────────────────

// ebmlVint 把数值编码为 EBML 变长整数（长度由 width 指定）
func ebmlVint(v uint64, width int) []byte {
	out := make([]byte, width)
	for i := width - 1; i >= 0; i-- {
		out[i] = byte(v & 0xFF)
		v >>= 8
	}
	// 设置长度标记位：width=1 → 0x80, width=2 → 0x40, ...
	out[0] |= 1 << (8 - width)
	return out
}

// ebmlID 编码元素 ID（ID 本身自带长度标记，直接按字节写）
func ebmlID(id uint32) []byte {
	switch {
	case id > 0xFFFFFF:
		return []byte{byte(id >> 24), byte(id >> 16), byte(id >> 8), byte(id)}
	case id > 0xFFFF:
		return []byte{byte(id >> 16), byte(id >> 8), byte(id)}
	case id > 0xFF:
		return []byte{byte(id >> 8), byte(id)}
	default:
		return []byte{byte(id)}
	}
}

// ebmlElem 拼一个「ID + 长度 + 数据」的元素
func ebmlElem(id uint32, payload []byte) []byte {
	out := append(ebmlID(id), ebmlVint(uint64(len(payload)), 4)...)
	return append(out, payload...)
}

// uintBytes 把整数转成大端字节（最小长度）
func uintBytes(v uint64) []byte {
	if v == 0 {
		return []byte{0}
	}
	var buf [8]byte
	binary.BigEndian.PutUint64(buf[:], v)
	i := 0
	for i < 7 && buf[i] == 0 {
		i++
	}
	return buf[i:]
}

// makeMediaRecorderWebM 造一个「类 MediaRecorder」webm：
// 无 SeekHead、无 Duration，只有 Cluster 的时间戳。
// durationMs 为期望时长（毫秒），会被写成最后一个 Cluster 的 Timecode。
func makeMediaRecorderWebM(durationMs uint64) []byte {
	// EBML 头（DocType = webm）
	ebmlHeader := ebmlElem(0x1A45DFA3, concat(
		ebmlElem(0x4286, []byte{1}),       // EBMLVersion
		ebmlElem(0x42F7, []byte{1}),       // EBMLReadVersion
		ebmlElem(0x42F2, []byte{4}),       // EBMLMaxIDLength
		ebmlElem(0x42F3, []byte{8}),       // EBMLMaxSizeLength
		ebmlElem(0x4282, []byte("webm")),  // DocType
		ebmlElem(0x4287, []byte{4}),       // DocTypeVersion
		ebmlElem(0x4285, []byte{2}),       // DocTypeReadVersion
	))

	// Info：只有 TimecodeScale = 1000000（1ms），**故意不写 Duration**
	info := ebmlElem(0x1549A966, concat(
		ebmlElem(0x2AD7B1, uintBytes(1000000)), // TimecodeScale
		ebmlElem(0x4D80, []byte("xingyu-test")),
	))

	// 两个 Cluster，模拟分段写入；最后一个的 Timecode 就是总时长
	cluster1 := makeCluster(0, 1)
	cluster2 := makeCluster(durationMs, 1)

	// Segment：用「未知长度」（0x01FFFFFFFFFFFFFF），MediaRecorder 就是这样写的
	segmentPayload := concat(info, cluster1, cluster2)
	segment := append(ebmlID(0x18538067), 0x01, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF)
	segment = append(segment, segmentPayload...)

	return concat(ebmlHeader, segment)
}

// makeCluster 造一个 Cluster：Timecode + 一个 SimpleBlock
func makeCluster(timecodeMs uint64, trackNum uint64) []byte {
	// SimpleBlock：track number(vint) + int16 相对时间戳 + flags + 假数据
	block := concat(
		ebmlVint(trackNum, 1), // track number
		[]byte{0x00, 0x00},    // relative timecode = 0
		[]byte{0x80},          // flags（keyframe）
		[]byte{0xDE, 0xAD, 0xBE, 0xEF},
	)
	cluster := concat(
		ebmlElem(0xE7, uintBytes(timecodeMs)), // Cluster Timecode
		ebmlElem(0xA3, block),                 // SimpleBlock
	)
	return ebmlElem(0x1F43B675, cluster)
}

func concat(parts ...[]byte) []byte {
	var out []byte
	for _, p := range parts {
		out = append(out, p...)
	}
	return out
}

// ─────────────────────────────────────────────────────────────────────
// 测试
// ─────────────────────────────────────────────────────────────────────

// 核心用例：MediaRecorder 风格 webm（无 Duration）必须能解析出正确时长。
// 这条以前是**必然失败**的——旧实现只要识别出 EBML 就直接返回错误。
func TestGetWebMDuration_MediaRecorderNoDuration(t *testing.T) {
	for _, wantMs := range []uint64{500, 1500, 3200, 12500} {
		data := makeMediaRecorderWebM(wantMs)
		got, err := getWebMDuration(bytes.NewReader(data))
		if err != nil {
			t.Fatalf("时长 %dms：解析失败：%v", wantMs, err)
		}
		wantSec := float64(wantMs) / 1000.0
		if math.Abs(got-wantSec) > 0.001 {
			t.Errorf("时长 %dms：got %.4fs, want %.4fs", wantMs, got, wantSec)
		}
	}
}

// 有 Duration 元素时应优先/同样能解析
func TestGetWebMDuration_WithDurationElement(t *testing.T) {
	ebmlHeader := ebmlElem(0x1A45DFA3, concat(
		ebmlElem(0x4286, []byte{1}),
		ebmlElem(0x42F7, []byte{1}),
		ebmlElem(0x42F2, []byte{4}),
		ebmlElem(0x42F3, []byte{8}),
		ebmlElem(0x4282, []byte("webm")),
		ebmlElem(0x4287, []byte{4}),
		ebmlElem(0x4285, []byte{2}),
	))
	// Duration = 2500 ticks，TimecodeScale = 1e6 → 2.5s
	durBits := make([]byte, 4)
	binary.BigEndian.PutUint32(durBits, math.Float32bits(2500.0))
	info := ebmlElem(0x1549A966, concat(
		ebmlElem(0x2AD7B1, uintBytes(1000000)),
		ebmlElem(0x4489, durBits),
	))
	segmentPayload := info
	segment := append(ebmlID(0x18538067), 0x01, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF)
	segment = append(segment, segmentPayload...)
	data := concat(ebmlHeader, segment)

	got, err := getWebMDuration(bytes.NewReader(data))
	if err != nil {
		t.Fatalf("解析失败：%v", err)
	}
	if math.Abs(got-2.5) > 0.001 {
		t.Errorf("got %.4fs, want 2.5s", got)
	}
}

// 非 webm 内容必须明确报错，而不是返回 0 或 panic
func TestGetWebMDuration_RejectsNonEBML(t *testing.T) {
	_, err := getWebMDuration(bytes.NewReader([]byte("this is not a webm file at all")))
	if err == nil {
		t.Error("非 EBML 文件应该报错，但没有")
	}
	// 空文件也不能 panic
	_, err = getWebMDuration(bytes.NewReader(nil))
	if err == nil {
		t.Error("空文件应该报错，但没有")
	}
	// 截断的 EBML 头不能 panic
	_, err = getWebMDuration(bytes.NewReader([]byte{0x1A, 0x45, 0xDF, 0xA3}))
	if err == nil {
		t.Error("截断文件应该报错，但没有")
	}
}

// 没有 Cluster 也没有 Duration → 应报错而不是静默返回 0
func TestGetWebMDuration_EmptySegment(t *testing.T) {
	ebmlHeader := ebmlElem(0x1A45DFA3, concat(
		ebmlElem(0x4282, []byte("webm")),
	))
	segment := append(ebmlID(0x18538067), 0x01, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF)
	data := concat(ebmlHeader, segment)

	_, err := getWebMDuration(bytes.NewReader(data))
	if err == nil {
		t.Error("无时长信息应该报错，但没有")
	}
}

// 扩展名嗅探：三种真实场景都要能纠正
func TestSniffAudioExt(t *testing.T) {
	cases := []struct {
		name string
		head []byte
		want string
	}{
		{"webm (EBML)", []byte{0x1A, 0x45, 0xDF, 0xA3, 0x00}, ".webm"},
		{"wav (RIFF/WAVE)", append([]byte("RIFF\x00\x00\x00\x00WAVE"), 0x00), ".wav"},
		{"flac", append([]byte("fLaC"), 0x00), ".flac"},
		{"ogg", append([]byte("OggS"), 0x00), ".ogg"},
		{"mp3 (ID3)", append([]byte("ID3"), 0x00), ".mp3"},
		{"mp3 (sync)", []byte{0xFF, 0xFB, 0x90, 0x00, 0x00, 0x00}, ".mp3"},
		{"m4a (ftyp)", append([]byte{0, 0, 0, 0x20}, []byte("ftypM4A \x00\x00\x02\x00")...), ".m4a"},
		{"unknown", []byte{0x00, 0x01, 0x02, 0x03}, ""},
		{"too short", []byte{0x01}, ""},
	}
	for _, c := range cases {
		if got := sniffAudioExt(c.head); got != c.want {
			t.Errorf("%s: got %q, want %q", c.name, got, c.want)
		}
	}
}

// 端到端：空扩展名的 webm 也要能走通（这是 500 错误的第二个触发路径）
func TestGetAudioDuration_EmptyExtSniffedAsWebM(t *testing.T) {
	data := makeMediaRecorderWebM(2000)
	got, err := GetAudioDuration(t.Context(), bytes.NewReader(data), "")
	if err != nil {
		t.Fatalf("空扩展名应被嗅探为 webm 并成功解析，但报错：%v", err)
	}
	if math.Abs(got-2.0) > 0.001 {
		t.Errorf("got %.4fs, want 2.0s", got)
	}
}

// 扩展名与内容不符时（前端把 webm 命名为 .wav）也要能纠正
func TestGetAudioDuration_WrongExtCorrected(t *testing.T) {
	data := makeMediaRecorderWebM(3000)
	got, err := GetAudioDuration(t.Context(), bytes.NewReader(data), ".wav")
	if err != nil {
		t.Fatalf("扩展名错误时应按魔数纠正，但报错：%v", err)
	}
	if math.Abs(got-3.0) > 0.001 {
		t.Errorf("got %.4fs, want 3.0s", got)
	}
}