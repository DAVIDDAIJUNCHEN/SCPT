package model

// SmsLog 短信发送记录（AlloMax 二次开发）
// mock 模式下验证码在此表可查，便于开发与教学演示；生产环境仍建议保留用于审计。
type SmsLog struct {
	Id        int    `json:"id" gorm:"primaryKey;autoIncrement"`
	Phone     string `json:"phone" gorm:"type:varchar(20);index"`
	Code      string `json:"code" gorm:"type:varchar(10)"`
	Purpose   string `json:"purpose" gorm:"type:varchar(10)"`
	Provider  string `json:"provider" gorm:"type:varchar(20)"`
	Status    int    `json:"status" gorm:"default:1"` // 1=成功 0=失败
	CreatedAt int64  `json:"created_at" gorm:"autoCreateTime"`
}

func (SmsLog) TableName() string { return "sms_logs" }

func RecordSmsLog(phone, code, purpose, provider string, status int) {
	entry := SmsLog{
		Phone: phone, Code: code, Purpose: purpose,
		Provider: provider, Status: status,
	}
	if err := DB.Create(&entry).Error; err != nil {
		_ = err // 日志写入失败不阻塞主流程
	}
}
