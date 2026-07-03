package todo

import (
	"encoding/json"
	"os"
)

// DefaultNotifyTimes は todo_settings.json が存在しない場合のフォールバック。
var DefaultNotifyTimes = []string{"13:00", "17:00"}

func defaultSettings() Settings {
	return Settings{
		NotifyTimes:   append([]string{}, DefaultNotifyTimes...),
		DetailPattern: "inline",
		RecurringDisplayDays: map[string]int{
			"weekly":  3,
			"monthly": 7,
			"yearly":  14,
		},
		TodoNearDeadlineDays: DefaultNearDeadlineWorkdays,
	}
}

// LoadSettings は設定JSONを読み込んで返す。欠けているキーはデフォルト値で補完する。
func (s *Store) LoadSettings() (Settings, error) {
	def := defaultSettings()

	data, err := os.ReadFile(s.settingsPath)
	if err != nil {
		if os.IsNotExist(err) {
			return def, nil
		}
		return def, nil // 読み込み失敗時はデフォルト値を使用する
	}

	var raw struct {
		NotifyTimes          []string       `json:"notify_times"`
		DetailPattern        string         `json:"detail_pattern"`
		RecurringDisplayDays map[string]int `json:"recurring_display_days"`
		TodoNearDeadlineDays int            `json:"todo_near_deadline_days"`
	}
	if err := json.Unmarshal(data, &raw); err != nil {
		return def, nil
	}

	merged := def
	if raw.NotifyTimes != nil {
		merged.NotifyTimes = raw.NotifyTimes
	}
	if raw.DetailPattern != "" {
		merged.DetailPattern = raw.DetailPattern
	}
	for k, v := range raw.RecurringDisplayDays {
		merged.RecurringDisplayDays[k] = v
	}
	if raw.TodoNearDeadlineDays > 0 {
		merged.TodoNearDeadlineDays = raw.TodoNearDeadlineDays
	}
	return merged, nil
}

// SettingsUpdate は設定の部分更新に使うフィールド（nilなら未指定）。
type SettingsUpdate struct {
	NotifyTimes          []string
	DetailPattern        *string
	RecurringDisplayDays map[string]int
	TodoNearDeadlineDays *int
}

// SaveSettings は設定を保存する（既存設定にマージ）。
func (s *Store) SaveSettings(u SettingsUpdate) (Settings, error) {
	current, err := s.LoadSettings()
	if err != nil {
		return Settings{}, err
	}
	if u.NotifyTimes != nil {
		current.NotifyTimes = u.NotifyTimes
	}
	if u.DetailPattern != nil {
		current.DetailPattern = *u.DetailPattern
	}
	for k, v := range u.RecurringDisplayDays {
		current.RecurringDisplayDays[k] = v
	}
	if u.TodoNearDeadlineDays != nil {
		current.TodoNearDeadlineDays = *u.TodoNearDeadlineDays
	}

	data, err := json.MarshalIndent(current, "", "  ")
	if err != nil {
		return Settings{}, err
	}
	if err := os.WriteFile(s.settingsPath, data, 0o644); err != nil {
		return Settings{}, err
	}
	return current, nil
}
