package todo

import (
	"database/sql"
	"errors"
	"fmt"
	"time"
)

var periodLabel = map[string]string{
	"weekly":  "週ごと",
	"monthly": "月ごと",
	"yearly":  "年ごと",
}

var weekdayNames = []string{"月", "火", "水", "木", "金", "土", "日"}

// periodFreqLabel は定期タスクの周期を短い表示文字列にする（例：毎週(月)）
func periodFreqLabel(periodType, periodValue string) string {
	switch periodType {
	case "weekly":
		var idx int
		fmt.Sscanf(periodValue, "%d", &idx)
		if idx >= 0 && idx < len(weekdayNames) {
			return "毎週(" + weekdayNames[idx] + ")"
		}
		return "毎週(?)"
	case "monthly":
		return "毎月" + periodValue + "日"
	case "yearly":
		var m, d int
		fmt.Sscanf(periodValue, "%d-%d", &m, &d)
		return fmt.Sprintf("毎年%d/%d", m, d)
	default:
		return periodType
	}
}

func lastDayOfMonth(year int, month time.Month) int {
	firstOfNext := time.Date(year, month+1, 1, 0, 0, 0, 0, time.UTC)
	last := firstOfNext.AddDate(0, 0, -1)
	return last.Day()
}

// nextOccurrence は after より後の次回発生日を返す（after は含まない）。
func nextOccurrence(periodType, periodValue string, after time.Time) (time.Time, error) {
	switch periodType {
	case "weekly":
		var targetWd int
		if _, err := fmt.Sscanf(periodValue, "%d", &targetWd); err != nil {
			return time.Time{}, fmt.Errorf("不正な period_value: %s", periodValue)
		}
		// Go: Sunday=0..Saturday=6 / Python: 月=0..日=6 なので変換する
		curWd := int(after.Weekday()+6) % 7 // 月=0..日=6 に変換
		days := (targetWd - curWd + 7) % 7
		if days == 0 {
			days = 7
		}
		return after.AddDate(0, 0, days), nil

	case "monthly":
		var day int
		if _, err := fmt.Sscanf(periodValue, "%d", &day); err != nil {
			return time.Time{}, fmt.Errorf("不正な period_value: %s", periodValue)
		}
		last := lastDayOfMonth(after.Year(), after.Month())
		d := day
		if d > last {
			d = last
		}
		candidate := time.Date(after.Year(), after.Month(), d, 0, 0, 0, 0, after.Location())
		if !candidate.After(after) {
			y, m := after.Year(), after.Month()+1
			if m > 12 {
				m = 1
				y++
			}
			last = lastDayOfMonth(y, m)
			d = day
			if d > last {
				d = last
			}
			candidate = time.Date(y, m, d, 0, 0, 0, 0, after.Location())
		}
		return candidate, nil

	case "yearly":
		var m, d int
		if _, err := fmt.Sscanf(periodValue, "%d-%d", &m, &d); err != nil {
			return time.Time{}, fmt.Errorf("不正な period_value: %s", periodValue)
		}
		candidate := time.Date(after.Year(), time.Month(m), d, 0, 0, 0, 0, after.Location())
		if !candidate.After(after) {
			candidate = time.Date(after.Year()+1, time.Month(m), d, 0, 0, 0, 0, after.Location())
		}
		return candidate, nil
	}
	return time.Time{}, fmt.Errorf("不正な period_type: %s", periodType)
}

func scanRecurringTask(row interface {
	Scan(dest ...interface{}) error
}) (RecurringTask, error) {
	var t RecurringTask
	var currentDeadline, doneAt sql.NullString
	var isActive int
	err := row.Scan(
		&t.ID, &t.Title, &t.Memo, &t.PeriodType, &t.PeriodValue,
		&currentDeadline, &t.Status, &doneAt, &isActive, &t.CreatedAt,
	)
	if err != nil {
		return RecurringTask{}, err
	}
	t.CurrentDeadline = currentDeadline.String
	t.DoneAt = doneAt.String
	t.IsActive = isActive != 0
	return t, nil
}

const recurringColumns = `id, title, memo, period_type, period_value, current_deadline, status, done_at, is_active, created_at`

// GetRecurringTasks は定期タスク定義一覧を返す。activeOnly なら is_active=1 のみ。
func (s *Store) GetRecurringTasks(activeOnly bool) ([]RecurringTask, error) {
	query := `SELECT ` + recurringColumns + ` FROM recurring_tasks`
	if activeOnly {
		query += ` WHERE is_active = 1`
	}
	query += ` ORDER BY created_at ASC`

	rows, err := s.db.Query(query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []RecurringTask
	for rows.Next() {
		t, err := scanRecurringTask(rows)
		if err != nil {
			return nil, err
		}
		result = append(result, t)
	}
	return result, rows.Err()
}

// GetRecurringTask は単一定期タスク定義を返す。存在しない場合 ok=false。
func (s *Store) GetRecurringTask(id int64) (RecurringTask, bool, error) {
	row := s.db.QueryRow(`SELECT `+recurringColumns+` FROM recurring_tasks WHERE id = ?`, id)
	t, err := scanRecurringTask(row)
	if errors.Is(err, sql.ErrNoRows) {
		return RecurringTask{}, false, nil
	}
	if err != nil {
		return RecurringTask{}, false, err
	}
	return t, true, nil
}

// CreateRecurringTaskInput は定期タスク新規作成の入力値。
type CreateRecurringTaskInput struct {
	Title       string
	PeriodType  string
	PeriodValue string
	Memo        string
}

// CreateRecurringTask は定期タスク定義を登録して新規IDを返す。
// 現周期の期日を初期計算してpending状態で開始する。
func (s *Store) CreateRecurringTask(in CreateRecurringTaskInput) (int64, error) {
	initial, err := nextOccurrence(in.PeriodType, in.PeriodValue, today().AddDate(0, 0, -1))
	if err != nil {
		return 0, err
	}
	res, err := s.db.Exec(
		`INSERT INTO recurring_tasks (title, memo, period_type, period_value, current_deadline, status, created_at)
		 VALUES (?, ?, ?, ?, ?, 'pending', ?)`,
		in.Title, in.Memo, in.PeriodType, in.PeriodValue, initial.Format(dateLayout), nowISO(),
	)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

// UpdateRecurringTask は定期タスク定義の任意カラムを更新する。
// period_type/period_value を変更した場合は現周期の期日を再計算してpendingに戻す。
func (s *Store) UpdateRecurringTask(id int64, u RecurringTaskUpdate) (bool, error) {
	set := ""
	args := []interface{}{}
	add := func(col string, val interface{}) {
		if set != "" {
			set += ", "
		}
		set += col + " = ?"
		args = append(args, val)
	}

	if u.Title != nil {
		add("title", *u.Title)
	}
	if u.Memo != nil {
		add("memo", *u.Memo)
	}
	if u.IsActive != nil {
		add("is_active", boolToInt(*u.IsActive))
	}

	if u.PeriodType != nil || u.PeriodValue != nil {
		task, ok, err := s.GetRecurringTask(id)
		if err != nil {
			return false, err
		}
		if !ok {
			return false, nil
		}
		periodType := task.PeriodType
		if u.PeriodType != nil {
			periodType = *u.PeriodType
		}
		periodValue := task.PeriodValue
		if u.PeriodValue != nil {
			periodValue = *u.PeriodValue
		}
		nextDeadline, err := nextOccurrence(periodType, periodValue, today().AddDate(0, 0, -1))
		if err != nil {
			return false, err
		}
		add("period_type", periodType)
		add("period_value", periodValue)
		add("current_deadline", nextDeadline.Format(dateLayout))
		add("status", "pending")
		add("done_at", nil)
	}

	if set == "" {
		return false, nil
	}
	args = append(args, id)
	res, err := s.db.Exec(`UPDATE recurring_tasks SET `+set+` WHERE id = ?`, args...)
	if err != nil {
		return false, err
	}
	n, err := res.RowsAffected()
	return n > 0, err
}

// DeleteRecurringTask は定期タスク定義を削除する。
func (s *Store) DeleteRecurringTask(id int64) (bool, error) {
	res, err := s.db.Exec(`DELETE FROM recurring_tasks WHERE id = ?`, id)
	if err != nil {
		return false, err
	}
	n, err := res.RowsAffected()
	return n > 0, err
}

// syncRecurringTaskState は1件の定期タスクの current_deadline/status を最新化し、
// 変更があればDBへ反映する。
//
// 期日を過ぎた時点で完了済みなら次周期に進めて未完了へリセットする。
// 期日を過ぎても未完了のままなら「残タスク」として据え置き、次周期には進めない
// （ユーザーが手動で完了にするまで残り続ける）。
func (s *Store) syncRecurringTaskState(t *RecurringTask) error {
	todayD := today()
	changed := false

	if t.CurrentDeadline == "" {
		next, err := nextOccurrence(t.PeriodType, t.PeriodValue, todayD.AddDate(0, 0, -1))
		if err != nil {
			return err
		}
		t.CurrentDeadline = next.Format(dateLayout)
		t.Status = "pending"
		t.DoneAt = ""
		changed = true
	} else if t.Status == "done" {
		cur, ok := parseDate(t.CurrentDeadline)
		if ok && cur.Before(todayD) {
			// 完了済みのまま複数周期が経過していた場合も、過去の日付には留まらせず
			// 「今日以降の直近の発生日」まで一気に進める
			after := cur
			next, err := nextOccurrence(t.PeriodType, t.PeriodValue, after)
			if err != nil {
				return err
			}
			for next.Before(todayD) {
				after = next
				next, err = nextOccurrence(t.PeriodType, t.PeriodValue, after)
				if err != nil {
					return err
				}
			}
			t.CurrentDeadline = next.Format(dateLayout)
			t.Status = "pending"
			t.DoneAt = ""
			changed = true
		}
	}
	// status == 'pending' かつ期日超過の場合は何もしない（残タスクとして据え置く）

	if changed {
		var doneAt interface{}
		if t.DoneAt != "" {
			doneAt = t.DoneAt
		}
		if _, err := s.db.Exec(
			`UPDATE recurring_tasks SET current_deadline = ?, status = ?, done_at = ? WHERE id = ?`,
			t.CurrentDeadline, t.Status, doneAt, t.ID,
		); err != nil {
			return err
		}
	}
	return nil
}

// SyncAllRecurringTasks はアクティブな定期タスクすべての状態を最新化する。
func (s *Store) SyncAllRecurringTasks() error {
	tasks, err := s.GetRecurringTasks(true)
	if err != nil {
		return err
	}
	for i := range tasks {
		if err := s.syncRecurringTaskState(&tasks[i]); err != nil {
			return err
		}
	}
	return nil
}

// GetRecurringPanelData は定期タスクパネル表示用のデータを返す。
//   - overdue: 期日超過・未完了（残タスク。常に表示）
//   - current: 今期分。設定の表示日数（周期種別ごと）以内のもののみ含める
func (s *Store) GetRecurringPanelData() (RecurringPanelData, error) {
	if err := s.SyncAllRecurringTasks(); err != nil {
		return RecurringPanelData{}, err
	}
	settings, err := s.LoadSettings()
	if err != nil {
		return RecurringPanelData{}, err
	}
	todayD := today()

	tasks, err := s.GetRecurringTasks(true)
	if err != nil {
		return RecurringPanelData{}, err
	}

	var overdue, current []RecurringTask
	for _, t := range tasks {
		deadline, ok := parseDate(t.CurrentDeadline)
		if !ok {
			continue
		}
		daysUntil := int(deadline.Sub(todayD).Hours() / 24)
		t.Freq = periodFreqLabel(t.PeriodType, t.PeriodValue)
		t.IsOverdue = t.Status == "pending" && daysUntil < 0

		if t.IsOverdue {
			overdue = append(overdue, t)
		} else {
			threshold := settings.RecurringDisplayDays[t.PeriodType]
			if daysUntil <= threshold {
				current = append(current, t)
			}
		}
	}

	sortByDeadline := func(list []RecurringTask) {
		for i := 1; i < len(list); i++ {
			for j := i; j > 0 && list[j].CurrentDeadline < list[j-1].CurrentDeadline; j-- {
				list[j], list[j-1] = list[j-1], list[j]
			}
		}
	}
	sortByDeadline(overdue)
	sortByDeadline(current)

	badgeCurrent := 0
	for _, t := range current {
		if t.Status == "pending" {
			badgeCurrent++
		}
	}

	return RecurringPanelData{
		Overdue: overdue,
		Current: current,
		Badge: RecurringBadge{
			Current: badgeCurrent,
			Overdue: len(overdue),
		},
	}, nil
}

// GetRecurringBadgeCounts はサイドタブのバッジ用件数を返す。
func (s *Store) GetRecurringBadgeCounts() (RecurringBadge, error) {
	data, err := s.GetRecurringPanelData()
	if err != nil {
		return RecurringBadge{}, err
	}
	return data.Badge, nil
}

// ToggleRecurringTask は定期タスクの完了／未完了を切り替える。
// 完了にした結果、現周期の期日をすでに過ぎていた場合は即座に次周期へ進める。
func (s *Store) ToggleRecurringTask(id int64) (bool, error) {
	task, ok, err := s.GetRecurringTask(id)
	if err != nil {
		return false, err
	}
	if !ok {
		return false, nil
	}

	if task.Status == "done" {
		_, err := s.db.Exec(`UPDATE recurring_tasks SET status = 'pending', done_at = NULL WHERE id = ?`, id)
		return err == nil, err
	}

	now := nowISO()
	if _, err := s.db.Exec(`UPDATE recurring_tasks SET status = 'done', done_at = ? WHERE id = ?`, now, id); err != nil {
		return false, err
	}
	task.Status = "done"
	task.DoneAt = now
	if err := s.syncRecurringTaskState(&task); err != nil {
		return false, err
	}
	return true, nil
}
