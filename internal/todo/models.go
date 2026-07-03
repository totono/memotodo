package todo

// Todo は1件のメモを表す。
// title: 本文（複数行可・必須）, memo: 詳細メモ（HTML・任意）
type Todo struct {
	ID              int64  `json:"id"`
	Title           string `json:"title"`
	Memo            string `json:"memo"`
	Status          string `json:"status"` // "pending" | "done"
	Deadline        string `json:"deadline"`
	ReminderEnabled bool   `json:"reminder_enabled"`
	ReminderAt      string `json:"reminder_at"`
	Reminded        bool   `json:"reminded"`
	CreatedAt       string `json:"created_at"`
	DoneAt          string `json:"done_at"`
	IsImportant     bool   `json:"is_important"`
	SortOrder       int64  `json:"sort_order"`
	IsOverdue       bool   `json:"is_overdue"`
	IsNear          bool   `json:"is_near"`
	Links           []Link `json:"links,omitempty"`
}

// Link はメモ本文から検出したURL/パスを表す。
type Link struct {
	Type  string `json:"type"` // "url" | "path"
	Value string `json:"value"`
}

// RecurringTask は定期タスク定義を表す（1レコード方式：current_deadline/status を使い回す）。
type RecurringTask struct {
	ID              int64  `json:"id"`
	Title           string `json:"title"`
	Memo            string `json:"memo"`
	PeriodType      string `json:"period_type"`  // "weekly" | "monthly" | "yearly"
	PeriodValue     string `json:"period_value"` // weekly:'0'-'6', monthly:'1'-'31', yearly:'MM-DD'
	CurrentDeadline string `json:"current_deadline"`
	Status          string `json:"status"` // "pending" | "done"（現周期の完了/未完了）
	DoneAt          string `json:"done_at"`
	IsActive        bool   `json:"is_active"`
	CreatedAt       string `json:"created_at"`
	Freq            string `json:"freq,omitempty"`
	IsOverdue       bool   `json:"is_overdue,omitempty"`
}

// Settings はアプリ全体の設定。
type Settings struct {
	NotifyTimes          []string       `json:"notify_times"`
	DetailPattern        string         `json:"detail_pattern"` // "inline" | "modal"
	RecurringDisplayDays map[string]int `json:"recurring_display_days"`
}

// RecurringPanelData は定期タスクパネル表示用のデータ。
type RecurringPanelData struct {
	Overdue []RecurringTask `json:"overdue"`
	Current []RecurringTask `json:"current"`
	Badge   RecurringBadge  `json:"badge"`
}

type RecurringBadge struct {
	Current int `json:"current"`
	Overdue int `json:"overdue"`
}

// TodoUpdate はメモの部分更新に使うフィールド（nilなら未指定）。
type TodoUpdate struct {
	Title           *string `json:"title,omitempty"`
	Memo            *string `json:"memo,omitempty"`
	Deadline        *string `json:"deadline,omitempty"`
	ReminderEnabled *bool   `json:"reminder_enabled,omitempty"`
	ReminderAt      *string `json:"reminder_at,omitempty"`
	Reminded        *bool   `json:"reminded,omitempty"`
	Status          *string `json:"status,omitempty"`
	DoneAt          *string `json:"done_at,omitempty"`
	IsImportant     *bool   `json:"is_important,omitempty"`
}

// RecurringTaskUpdate は定期タスク定義の部分更新に使うフィールド。
type RecurringTaskUpdate struct {
	Title       *string `json:"title,omitempty"`
	Memo        *string `json:"memo,omitempty"`
	PeriodType  *string `json:"period_type,omitempty"`
	PeriodValue *string `json:"period_value,omitempty"`
	IsActive    *bool   `json:"is_active,omitempty"`
}
