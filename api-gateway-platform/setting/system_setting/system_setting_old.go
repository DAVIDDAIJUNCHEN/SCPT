package system_setting

// ServerAddress 平台对外访问地址（后台「系统设置 → 服务器地址」可配）。
//
// 这里留空、而不是写死 "http://localhost:3000"：
// 默认值一旦是 localhost，所有「拿不到浏览器地址就回退到后端配置」的分支，
// 都会把外网使用者不可达的 http://localhost:3000 发给学生（示例代码、分享链接、
// CC Switch 导出配置），学生照抄必然连不上。
//
// 留空后由各消费方按「浏览器地址优先 → 本配置兜底」的顺序解析。
var ServerAddress = ""
var TaskPublicAddress = ""
var WorkerUrl = ""
var WorkerValidKey = ""
var WorkerAllowHttpImageRequestEnabled = false

func EnableWorker() bool {
	return WorkerUrl != ""
}
