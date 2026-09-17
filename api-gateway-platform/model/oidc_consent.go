package model

import (
	"errors"
	"sort"
	"strings"
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// AlloMax S2.x B1: OIDC 授权记忆。
// 用户对某 client 首次「同意并继续」后落库，后续登录自动跳过授权同意页。
// scope 以空格分隔存储；请求 scope 不被已存 scope 完全覆盖时视为 scope 升级，
// 需重新展示同意页（OAuth 标准语义）。

var ErrOIDCConsentNotFound = errors.New("oidc consent not found")

// OIDCConsent 记录用户对某 OIDC client 的授权同意。
type OIDCConsent struct {
	Id         int64     `json:"id" gorm:"primaryKey"`
	UserId     int       `json:"user_id" gorm:"not null;uniqueIndex:idx_oidc_consent_user_client,priority:1"`
	ClientId   string    `json:"client_id" gorm:"type:varchar(64);not null;uniqueIndex:idx_oidc_consent_user_client,priority:2"`
	Scope      string    `json:"scope" gorm:"type:varchar(255);not null;default:'openid'"`
	CreatedAt  time.Time `json:"created_at"`
	LastUsedAt time.Time `json:"last_used_at"`
}

func (OIDCConsent) TableName() string {
	return "oidc_consents"
}

func oidcScopeSet(scope string) map[string]bool {
	set := map[string]bool{}
	for _, s := range strings.Fields(scope) {
		set[s] = true
	}
	return set
}

// GetOIDCConsent 查询用户对某 client 的授权记录。
func GetOIDCConsent(userId int, clientId string) (*OIDCConsent, error) {
	var consent OIDCConsent
	err := DB.Where("user_id = ? AND client_id = ?", userId, clientId).First(&consent).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrOIDCConsentNotFound
		}
		return nil, err
	}
	return &consent, nil
}

// HasOIDCConsent 判断已存授权是否覆盖请求 scope（scope 升级返回 false）。
func HasOIDCConsent(userId int, clientId, requestedScope string) bool {
	consent, err := GetOIDCConsent(userId, clientId)
	if err != nil {
		return false
	}
	granted := oidcScopeSet(consent.Scope)
	for s := range oidcScopeSet(requestedScope) {
		if !granted[s] {
			// scope 升级：已存授权未覆盖请求的全部 scope，需重新同意
			return false
		}
	}
	return true
}

// SaveOIDCConsent 落库授权（首次插入，重复则合并 scope 并刷新 last_used_at）。
func SaveOIDCConsent(userId int, clientId, scope string) error {
	if userId <= 0 || strings.TrimSpace(clientId) == "" {
		return errors.New("invalid oidc consent")
	}
	now := time.Now()
	scope = strings.Join(normalizeOIDCScopes(scope), " ")
	if scope == "" {
		scope = "openid"
	}
	var existing OIDCConsent
	err := DB.Where("user_id = ? AND client_id = ?", userId, clientId).First(&existing).Error
	if err == nil {
		// 合并 scope（并集）+ 刷新时间
		merged := oidcScopeSet(existing.Scope)
		for s := range oidcScopeSet(scope) {
			merged[s] = true
		}
		list := make([]string, 0, len(merged))
		for s := range merged {
			list = append(list, s)
		}
		sort.Strings(list)
		return DB.Model(&existing).Updates(map[string]interface{}{
			"scope":        strings.Join(list, " "),
			"last_used_at": now,
		}).Error
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return err
	}
	return DB.Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "user_id"}, {Name: "client_id"}},
		DoNothing: true,
	}).Create(&OIDCConsent{
		UserId:     userId,
		ClientId:   clientId,
		Scope:      scope,
		LastUsedAt: now,
	}).Error
}

// TouchOIDCConsent 刷新 last_used_at（授权码签发成功后调用）。
func TouchOIDCConsent(userId int, clientId string) {
	DB.Model(&OIDCConsent{}).
		Where("user_id = ? AND client_id = ?", userId, clientId).
		Update("last_used_at", time.Now())
}

func normalizeOIDCScopes(scope string) []string {
	allowed := map[string]bool{"openid": true, "profile": true, "email": true}
	var result []string
	seen := map[string]bool{}
	for _, s := range strings.Fields(scope) {
		if allowed[s] && !seen[s] {
			seen[s] = true
			result = append(result, s)
		}
	}
	return result
}
