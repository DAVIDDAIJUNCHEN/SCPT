package common

import (
	"context"
	"encoding/binary"
	"fmt"
	"io"
	"math"
	"strings"

	"github.com/abema/go-mp4"
	"github.com/go-audio/aiff"
	"github.com/go-audio/wav"
	"github.com/jfreymuth/oggvorbis"
	"github.com/mewkiz/flac"
	"github.com/pkg/errors"
	"github.com/tcolgate/mp3"
	"github.com/yapingcat/gomedia/go-codec"
)

// GetAudioDuration 使用纯 Go 库获取音频文件的时长（秒）。
// 它不再依赖外部的 ffmpeg 或 ffprobe 程序。
func GetAudioDuration(ctx context.Context, f io.ReadSeeker, ext string) (duration float64, err error) {
	// 扩展名兜底：调用方可能拿到空扩展名（浏览器上传时文件名不带后缀）或
	// 错误的扩展名（前端把 webm 数据命名为 .wav）。
	// 这里嗅探文件头魔数纠正，而不是直接报 "unsupported audio format"。
	// 背景：2026-09-18 语音输入 500 的两个触发路径之一就是
	// 「error getting audio duration: unsupported audio format: (空)」。
	if _, seekErr := f.Seek(0, io.SeekStart); seekErr == nil {
		head := make([]byte, 16)
		if n, readErr := io.ReadFull(f, head); readErr == nil || n >= 4 {
			head = head[:n]
			if sniffed := sniffAudioExt(head); sniffed != "" {
				ext = sniffed
			}
		}
		if _, seekErr = f.Seek(0, io.SeekStart); seekErr != nil {
			return 0, errors.Wrap(seekErr, "failed to rewind audio stream")
		}
	}

	ext = strings.ToLower(ext)
	SysLog(fmt.Sprintf("GetAudioDuration: ext=%s", ext))
	// 根据文件扩展名选择解析器
	switch ext {
	case ".mp3":
		duration, err = getMP3Duration(f)
	case ".wav":
		duration, err = getWAVDuration(f)
	case ".flac":
		duration, err = getFLACDuration(f)
	case ".m4a", ".mp4":
		duration, err = getM4ADuration(f)
	case ".ogg", ".oga", ".opus":
		duration, err = getOGGDuration(f)
		if err != nil {
			duration, err = getOpusDuration(f)
		}
	case ".aiff", ".aif", ".aifc":
		duration, err = getAIFFDuration(f)
	case ".webm", ".weba", ".mkv":
		duration, err = getWebMDuration(f)
	case ".aac":
		duration, err = getAACDuration(f)
	default:
		return 0, fmt.Errorf("unsupported audio format: %s", ext)
	}
	SysLog(fmt.Sprintf("GetAudioDuration: duration=%f", duration))
	return duration, err
}

// sniffAudioExt 通过文件头魔数推断音频格式，返回带点的扩展名。
// 识别不出来返回空串，由调用方走原有逻辑。
func sniffAudioExt(head []byte) string {
	// 最短可判定长度：MP3/AAC 只需 2 字节同步字，其余格式需 4 字节以上。
	if len(head) < 2 {
		return ""
	}
	switch {
	case head[0] == 0x1A && head[1] == 0x45 && head[2] == 0xDF && head[3] == 0xA3:
		return ".webm" // EBML / Matroska / WebM（浏览器录音）
	case string(head[0:4]) == "RIFF":
		// RIFF 容器：偏移 8 处为真实类型
		if len(head) >= 12 {
			switch string(head[8:12]) {
			case "WAVE":
				return ".wav"
			case "AIFF":
				return ".aiff"
			}
		}
		return ".wav"
	case string(head[0:4]) == "fLaC":
		return ".flac"
	case string(head[0:4]) == "OggS":
		return ".ogg"
	case len(head) >= 3 && string(head[0:3]) == "ID3":
		return ".mp3"
	case len(head) >= 12 && string(head[4:8]) == "ftyp":
		return ".m4a" // ISO-BMFF（m4a/mp4）
	case head[0] == 0xFF && head[1]&0xE0 == 0xE0:
		// MPEG 音频帧同步：111xxxxx xxxxxxxx
		//
		// MP3 与 AAC(ADTS) 的同步字**看起来一样**（都是 0xFFEx/Fx），
		// 无法只看前两字节区分。判别方法：
		//   MP3 帧头：11 位同步 + 2 位版本(≠01) + 2 位层(≠00) + 1 位保护
		//   ADTS 头：12 位同步 + 1 位 ID + 2 位层(必为 00) + 1 位保护
		// 关键差异：ADTS 的 layer 两位恒为 00；MP3 的 layer 两位恒非 00。
		layer := (head[1] >> 1) & 0x03
		if layer == 0 {
			return ".aac" // ADTS
		}
		return ".mp3"
	}
	return ""
}

// getMP3Duration 解析 MP3 文件以获取时长。
// 注意：对于 VBR (Variable Bitrate) MP3，这个估算可能不完全精确，但通常足够好。
// FFmpeg 在这种情况下会扫描整个文件来获得精确值，但这里的库提供了快速估算。
func getMP3Duration(r io.Reader) (float64, error) {
	d := mp3.NewDecoder(r)
	var f mp3.Frame
	skipped := 0
	duration := 0.0

	for {
		if err := d.Decode(&f, &skipped); err != nil {
			if err == io.EOF {
				break
			}
			return 0, errors.Wrap(err, "failed to decode mp3 frame")
		}
		duration += f.Duration().Seconds()
	}
	return duration, nil
}

// getWAVDuration 解析 WAV 文件头以获取时长。
func getWAVDuration(r io.ReadSeeker) (float64, error) {
	// 1. 强制复位指针
	r.Seek(0, io.SeekStart)

	dec := wav.NewDecoder(r)

	// IsValidFile 会读取 fmt 块
	if !dec.IsValidFile() {
		return 0, errors.New("invalid wav file")
	}

	// 尝试寻找 data 块
	if err := dec.FwdToPCM(); err != nil {
		return 0, errors.Wrap(err, "failed to find PCM data chunk")
	}

	pcmSize := int64(dec.PCMSize)

	// 如果读出来的 Size 是 0，尝试用文件大小反推
	if pcmSize == 0 {
		// 获取文件总大小
		currentPos, _ := r.Seek(0, io.SeekCurrent) // 当前通常在 data chunk header 之后
		endPos, _ := r.Seek(0, io.SeekEnd)
		fileSize := endPos

		// 恢复位置（虽然如果不继续读也没关系）
		r.Seek(currentPos, io.SeekStart)

		// 数据区大小 ≈ 文件总大小 - 当前指针位置(即Header大小)
		// 注意：FwdToPCM 成功后，CurrentPos 应该刚好指向 Data 区数据的开始
		// 或者是 Data Chunk ID + Size 之后。
		// WAV Header 一般 44 字节。
		if fileSize > 44 {
			// 如果 FwdToPCM 成功，Reader 应该位于 data 块的数据起始处
			// 所以剩余的所有字节理论上都是音频数据
			pcmSize = fileSize - currentPos

			// 简单的兜底：如果算出来还是负数或0，强制按文件大小-44计算
			if pcmSize <= 0 {
				pcmSize = fileSize - 44
			}
		}
	}

	numChans := int64(dec.NumChans)
	bitDepth := int64(dec.BitDepth)
	sampleRate := float64(dec.SampleRate)

	if sampleRate == 0 || numChans == 0 || bitDepth == 0 {
		return 0, errors.New("invalid wav header metadata")
	}

	bytesPerFrame := numChans * (bitDepth / 8)
	if bytesPerFrame == 0 {
		return 0, errors.New("invalid byte depth calculation")
	}

	totalFrames := pcmSize / bytesPerFrame

	durationSeconds := float64(totalFrames) / sampleRate
	return durationSeconds, nil
}

// getFLACDuration 解析 FLAC 文件的 STREAMINFO 块。
func getFLACDuration(r io.Reader) (float64, error) {
	stream, err := flac.Parse(r)
	if err != nil {
		return 0, errors.Wrap(err, "failed to parse flac stream")
	}
	defer stream.Close()

	// 时长 = 总采样数 / 采样率
	duration := float64(stream.Info.NSamples) / float64(stream.Info.SampleRate)
	return duration, nil
}

// getM4ADuration 解析 M4A/MP4 文件的 'mvhd' box。
func getM4ADuration(r io.ReadSeeker) (float64, error) {
	// go-mp4 库需要 ReadSeeker 接口
	info, err := mp4.Probe(r)
	if err != nil {
		return 0, errors.Wrap(err, "failed to probe m4a/mp4 file")
	}
	// 时长 = Duration / Timescale
	return float64(info.Duration) / float64(info.Timescale), nil
}

// getOGGDuration 解析 OGG/Vorbis 文件以获取时长。
func getOGGDuration(r io.ReadSeeker) (float64, error) {
	// 重置 reader 到开头
	if _, err := r.Seek(0, io.SeekStart); err != nil {
		return 0, errors.Wrap(err, "failed to seek ogg file")
	}

	reader, err := oggvorbis.NewReader(r)
	if err != nil {
		return 0, errors.Wrap(err, "failed to create ogg vorbis reader")
	}

	// 计算时长 = 总采样数 / 采样率
	// 需要读取整个文件来获取总采样数
	channels := reader.Channels()
	sampleRate := reader.SampleRate()

	// 估算方法：读取到文件结尾
	var totalSamples int64
	buf := make([]float32, 4096*channels)
	for {
		n, err := reader.Read(buf)
		if err == io.EOF {
			break
		}
		if err != nil {
			return 0, errors.Wrap(err, "failed to read ogg samples")
		}
		totalSamples += int64(n / channels)
	}

	duration := float64(totalSamples) / float64(sampleRate)
	return duration, nil
}

// getOpusDuration 解析 Opus 文件（在 OGG 容器中）以获取时长。
func getOpusDuration(r io.ReadSeeker) (float64, error) {
	// Opus 通常封装在 OGG 容器中
	// 我们需要解析 OGG 页面来获取时长信息
	if _, err := r.Seek(0, io.SeekStart); err != nil {
		return 0, errors.Wrap(err, "failed to seek opus file")
	}

	// 读取 OGG 页面头部
	var totalGranulePos int64
	buf := make([]byte, 27) // OGG 页面头部最小大小

	for {
		n, err := r.Read(buf)
		if err == io.EOF {
			break
		}
		if err != nil {
			return 0, errors.Wrap(err, "failed to read opus/ogg page")
		}
		if n < 27 {
			break
		}

		// 检查 OGG 页面标识 "OggS"
		if string(buf[0:4]) != "OggS" {
			// 跳过一些字节继续寻找
			if _, err := r.Seek(-26, io.SeekCurrent); err != nil {
				break
			}
			continue
		}

		// 读取 granule position (字节 6-13, 小端序)
		granulePos := int64(binary.LittleEndian.Uint64(buf[6:14]))
		if granulePos > totalGranulePos {
			totalGranulePos = granulePos
		}

		// 读取段表大小
		numSegments := int(buf[26])
		segmentTable := make([]byte, numSegments)
		if _, err := io.ReadFull(r, segmentTable); err != nil {
			break
		}

		// 计算页面数据大小并跳过
		var pageSize int
		for _, segSize := range segmentTable {
			pageSize += int(segSize)
		}
		if _, err := r.Seek(int64(pageSize), io.SeekCurrent); err != nil {
			break
		}
	}

	// Opus 的采样率固定为 48000 Hz
	duration := float64(totalGranulePos) / 48000.0
	return duration, nil
}

// getAIFFDuration 解析 AIFF 文件头以获取时长。
func getAIFFDuration(r io.ReadSeeker) (float64, error) {
	if _, err := r.Seek(0, io.SeekStart); err != nil {
		return 0, errors.Wrap(err, "failed to seek aiff file")
	}

	dec := aiff.NewDecoder(r)
	if !dec.IsValidFile() {
		return 0, errors.New("invalid aiff file")
	}

	d, err := dec.Duration()
	if err != nil {
		return 0, errors.Wrap(err, "failed to get aiff duration")
	}

	return d.Seconds(), nil
}

// WebM / Matroska 元素 ID（EBML Variable Size Integer 编码的原始字节）
const (
	webmIDEBML       = 0x1A45DFA3 // EBML 头
	webmIDSegment    = 0x18538067 // Segment
	webmIDInfo       = 0x1549A966 // Info
	webmIDDuration   = 0x4489     // Duration（浮点，单位 = TimecodeScale）
	webmIDTimecodeSc = 0x2AD7B1   // TimecodeScale（整数，默认 1e6 纳秒）
	webmIDCluster    = 0x1F43B675 // Cluster
	webmIDTimecode   = 0xE7       // Cluster Timecode（整数，单位 = TimecodeScale）
	webmIDSimpleBlk  = 0xA3       // SimpleBlock
	webmIDBlockGroup = 0xA0       // BlockGroup
	webmIDBlock      = 0xA1       // Block
	webmIDVoid       = 0xEC       // Void（填充）
	webmIDCRC32      = 0xBF       // CRC-32（跳过）
	webmIDTracks     = 0x1654AE6B // Tracks
	webmIDTrackEntry = 0xAE       // TrackEntry
)

// getWebMDuration 解析 WebM/Matroska 文件以获取时长。
//
// 为什么不用 Duration 元素：浏览器 MediaRecorder 录制的 WebM 是**流式写入**的，
// 通常没有 SeekHead，Duration（0x4489）往往缺失或为 0 —— 只读 Duration 会得到 0。
// 因此这里改为解析 Cluster 的 Timecode + SimpleBlock 时间戳，取最大时间戳作为时长，
// 对「MediaRecorder 边录边写」的文件同样有效。
//
// 背景：2026-09-18 语音输入不可用的根因就是这个函数此前**直接返回错误**
// （只要识别出是 EBML 就报 "requires full EBML parser"），
// 而浏览器录音恰好全是 webm → 全部录音必然失败。
func getWebMDuration(r io.ReadSeeker) (float64, error) {
	if _, err := r.Seek(0, io.SeekStart); err != nil {
		return 0, errors.Wrap(err, "failed to seek webm file")
	}

	// 文件可能较大（长录音），整体读入内存简单可靠；录音场景通常 < 数十 MB。
	data, err := io.ReadAll(r)
	if err != nil {
		return 0, errors.Wrap(err, "failed to read webm file")
	}
	if len(data) < 4 || binary.BigEndian.Uint32(data[0:4]) != webmIDEBML {
		return 0, errors.New("not a valid EBML/WebM file")
	}

	st := &webmScanState{timecodeScale: 1_000_000} // 默认 1ms
	st.scan(data, 0, len(data), 0)

	if st.durationSec <= 0 {
		return 0, errors.New("webm duration not found (no Duration element and no Cluster timecodes)")
	}
	return st.durationSec, nil
}

// webmScanState 保存解析过程中的累计状态
type webmScanState struct {
	timecodeScale uint64
	durationSec   float64 // 由 Duration 元素得到
	maxClusterMs  float64 // 由 Cluster Timecode 得到（单位已换为秒）
}

// maxScanDepth 限制递归深度，防畸形文件导致栈溢出
const maxScanDepth = 16

// scan 递归遍历 [start, end) 范围内的 EBML 元素。
//
// 设计要点：
//   · 容器元素（Segment/Info/Cluster/BlockGroup/Tracks…）**递归进入内部**；
//   · 叶子元素（TimecodeScale/Duration/Timecode/Block…）按语义取值；
//   · unknown size（全 1 长度，流式写入常见）视为「延伸到父级边界」；
//   · 每次 pos 必须前进，否则中断，避免畸形输入死循环。
func (st *webmScanState) scan(data []byte, start, end, depth int) {
	if depth > maxScanDepth || start >= end || start < 0 {
		return
	}
	if end > len(data) {
		end = len(data)
	}

	pos := start
	for pos < end {
		id, idLen := readEBMLID(data, pos)
		if idLen == 0 {
			return
		}
		size, sizeLen, ok := readEBMLSize(data, pos+idLen)
		if !ok {
			return
		}
		headerEnd := pos + idLen + sizeLen
		if headerEnd > end || headerEnd > len(data) {
			return
		}

		// unknown size → 元素体延伸到父级边界
		bodyEnd := end
		if size != unknownEBMLSize {
			bodyEnd = headerEnd + int(size)
			if bodyEnd > end || bodyEnd < headerEnd {
				bodyEnd = end
			}
		}

		switch id {
		case webmIDTimecodeSc:
			if v, ok := readEBMLUint(data[headerEnd:bodyEnd]); ok && v > 0 {
				st.timecodeScale = v
			}

		case webmIDDuration:
			if v, ok := readEBMLFloat(data[headerEnd:bodyEnd]); ok && v > 0 {
				sec := v * float64(st.timecodeScale) / 1e9
				if sec > st.durationSec {
					st.durationSec = sec
				}
			}

		case webmIDTimecode:
			// Cluster Timecode：单位 = timecodeScale
			if v, ok := readEBMLUint(data[headerEnd:bodyEnd]); ok && v > 0 {
				sec := float64(v) * float64(st.timecodeScale) / 1e9
				if sec > st.maxClusterMs {
					st.maxClusterMs = sec
				}
			}

		case webmIDSimpleBlk, webmIDBlock:
			// Block 内还有相对时间戳，加上当前 Cluster 基线才是绝对时间。
			// 这里只做兜底：Cluster Timecode 通常已足够（同 Cluster 内相对偏移很小）。
			if rel, ok := readBlockRelTimecode(data, headerEnd, bodyEnd); ok && rel > 0 {
				// 相对值单位同 timecodeScale；用 maxClusterMs 做基线（已含本 Cluster Timecode）
				sec := st.maxClusterMs + float64(rel)*float64(st.timecodeScale)/1e9
				if sec > st.maxClusterMs {
					st.maxClusterMs = sec
				}
			}

		case webmIDSegment, webmIDInfo, webmIDCluster, webmIDBlockGroup,
			webmIDTracks, webmIDTrackEntry:
			// 容器：递归进入内部
			st.scan(data, headerEnd, bodyEnd, depth+1)

		default:
			// 其它元素（Void/CRC32/EBML 头/CodecPrivate 等）整体跳过
		}

		// 前进：必须严格递增，否则退出防死循环
		next := bodyEnd
		if next <= pos {
			next = headerEnd
		}
		if next <= pos {
			return
		}
		pos = next
	}

	// Cluster 时间戳通常比缺失/错误的 Duration 更可信，取较大者
	if st.maxClusterMs > st.durationSec {
		st.durationSec = st.maxClusterMs
	}
}

// readEBMLID 读取 EBML 元素 ID（保留原始字节，按 vint 长度决定）。
// 返回 (id, 消耗字节数)；无法解析返回 (0,0)。
func readEBMLID(b []byte, pos int) (uint32, int) {
	if pos >= len(b) {
		return 0, 0
	}
	first := b[pos]
	var length int
	switch {
	case first&0x80 != 0:
		length = 1
	case first&0x40 != 0:
		length = 2
	case first&0x20 != 0:
		length = 3
	case first&0x10 != 0:
		length = 4
	default:
		return 0, 0
	}
	if pos+length > len(b) {
		return 0, 0
	}
	var id uint32
	for i := 0; i < length; i++ {
		id = id<<8 | uint32(b[pos+i])
	}
	return id, length
}

const unknownEBMLSize = ^uint64(0)

// readEBMLSize 读取 EBML 数据长度（vint，去掉标记位）。
// 全 1 表示「未知长度」（流式写入的 Segment/Cluster 常见）。
func readEBMLSize(b []byte, pos int) (uint64, int, bool) {
	if pos >= len(b) {
		return 0, 0, false
	}
	first := b[pos]
	var length int
	var mask byte
	switch {
	case first&0x80 != 0:
		length, mask = 1, 0x7F
	case first&0x40 != 0:
		length, mask = 2, 0x3F
	case first&0x20 != 0:
		length, mask = 3, 0x1F
	case first&0x10 != 0:
		length, mask = 4, 0x0F
	case first&0x08 != 0:
		length, mask = 5, 0x07
	case first&0x04 != 0:
		length, mask = 6, 0x03
	case first&0x02 != 0:
		length, mask = 7, 0x01
	case first&0x01 != 0:
		length, mask = 8, 0x00
	default:
		return 0, 0, false
	}
	if pos+length > len(b) {
		return 0, 0, false
	}
	value := uint64(first & mask)
	allOnes := first&mask == mask
	for i := 1; i < length; i++ {
		value = value<<8 | uint64(b[pos+i])
		allOnes = allOnes && b[pos+i] == 0xFF
	}
	if allOnes {
		return unknownEBMLSize, length, true
	}
	return value, length, true
}

// readEBMLUint 读取大端无符号整数（1~8 字节）。
func readEBMLUint(b []byte) (uint64, bool) {
	if len(b) == 0 || len(b) > 8 {
		return 0, false
	}
	var v uint64
	for _, c := range b {
		v = v<<8 | uint64(c)
	}
	return v, true
}

// readEBMLFloat 读取 EBML 浮点数（4 或 8 字节大端，IEEE-754）。
func readEBMLFloat(b []byte) (float64, bool) {
	switch len(b) {
	case 4:
		return float64(math.Float32frombits(binary.BigEndian.Uint32(b))), true
	case 8:
		return math.Float64frombits(binary.BigEndian.Uint64(b)), true
	default:
		return 0, false
	}
}

// readBlockRelTimecode 从 (Simple)Block 头部读出相对时间戳（int16 大端）。
// Block 布局：track number(vint) + int16 timecode + flags(1B) + 帧数据
func readBlockRelTimecode(b []byte, start, end int) (int16, bool) {
	if start >= end || start >= len(b) {
		return 0, false
	}
	// 跳过 track number 的 vint
	first := b[start]
	var trackLen int
	switch {
	case first&0x80 != 0:
		trackLen = 1
	case first&0x40 != 0:
		trackLen = 2
	case first&0x20 != 0:
		trackLen = 3
	case first&0x10 != 0:
		trackLen = 4
	default:
		return 0, false
	}
	tcPos := start + trackLen
	if tcPos+2 > end || tcPos+2 > len(b) {
		return 0, false
	}
	return int16(binary.BigEndian.Uint16(b[tcPos : tcPos+2])), true
}

// getAACDuration 解析 AAC (ADTS格式) 文件以获取时长。
// 使用 gomedia 库来解析 AAC ADTS 帧
func getAACDuration(r io.ReadSeeker) (float64, error) {
	if _, err := r.Seek(0, io.SeekStart); err != nil {
		return 0, errors.Wrap(err, "failed to seek aac file")
	}

	// 读取整个文件内容
	data, err := io.ReadAll(r)
	if err != nil {
		return 0, errors.Wrap(err, "failed to read aac file")
	}

	var totalFrames int64
	var sampleRate int

	// 使用 gomedia 的 SplitAACFrame 函数来分割 AAC 帧
	codec.SplitAACFrame(data, func(aac []byte) {
		// 解析 ADTS 头部以获取采样率信息
		if len(aac) >= 7 {
			// 使用 ConvertADTSToASC 来获取音频配置信息
			asc, err := codec.ConvertADTSToASC(aac)
			if err == nil && sampleRate == 0 {
				sampleRate = codec.AACSampleIdxToSample(int(asc.Sample_freq_index))
			}
			totalFrames++
		}
	})

	if sampleRate == 0 || totalFrames == 0 {
		return 0, errors.New("no valid aac frames found")
	}

	// 每个 AAC ADTS 帧包含 1024 个采样
	totalSamples := totalFrames * 1024
	duration := float64(totalSamples) / float64(sampleRate)
	return duration, nil
}
