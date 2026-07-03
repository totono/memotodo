package todo

import (
	"testing"
	"time"
)

func d(s string) time.Time {
	t, err := time.Parse(dateLayout, s)
	if err != nil {
		panic(err)
	}
	return t
}

func TestNextOccurrenceWeekly(t *testing.T) {
	// 2024-01-01 は月曜日 (period_value "0" = 月)
	got, err := nextOccurrence("weekly", "0", d("2024-01-01"))
	if err != nil {
		t.Fatal(err)
	}
	if want := d("2024-01-08"); !got.Equal(want) {
		t.Errorf("got %v, want %v", got, want)
	}

	// 同日は含まない：月曜日基準で次の金曜日(4)
	got, err = nextOccurrence("weekly", "4", d("2024-01-01"))
	if err != nil {
		t.Fatal(err)
	}
	if want := d("2024-01-05"); !got.Equal(want) {
		t.Errorf("got %v, want %v", got, want)
	}
}

func TestNextOccurrenceMonthlyClampsToMonthEnd(t *testing.T) {
	// 31日指定・2月はafterが1/31のとき、2月末(29 or 28)に丸められる
	got, err := nextOccurrence("monthly", "31", d("2024-01-31"))
	if err != nil {
		t.Fatal(err)
	}
	if want := d("2024-02-29"); !got.Equal(want) { // 2024はうるう年
		t.Errorf("got %v, want %v", got, want)
	}
}

func TestNextOccurrenceYearly(t *testing.T) {
	got, err := nextOccurrence("yearly", "02-29", d("2024-01-01"))
	if err != nil {
		t.Fatal(err)
	}
	if want := d("2024-02-29"); !got.Equal(want) {
		t.Errorf("got %v, want %v", got, want)
	}

	// after が発生日と同日または過ぎていれば翌年へ
	got, err = nextOccurrence("yearly", "01-01", d("2024-01-01"))
	if err != nil {
		t.Fatal(err)
	}
	if want := d("2025-01-01"); !got.Equal(want) {
		t.Errorf("got %v, want %v", got, want)
	}
}

func TestSyncRecurringTaskStateCatchesUpPastPeriods(t *testing.T) {
	dir := t.TempDir()
	s, err := NewStore(dir)
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()

	// 週次タスクを作り、current_deadline を大きく過去にしてdone状態にする
	id, err := s.CreateRecurringTask(CreateRecurringTaskInput{Title: "t", PeriodType: "weekly", PeriodValue: "0"})
	if err != nil {
		t.Fatal(err)
	}
	past := today().AddDate(0, 0, -30).Format(dateLayout)
	if _, err := s.db.Exec(`UPDATE recurring_tasks SET current_deadline = ?, status = 'done' WHERE id = ?`, past, id); err != nil {
		t.Fatal(err)
	}

	task, ok, err := s.GetRecurringTask(id)
	if err != nil || !ok {
		t.Fatal(err, ok)
	}
	if err := s.syncRecurringTaskState(&task); err != nil {
		t.Fatal(err)
	}
	newDeadline, _ := parseDate(task.CurrentDeadline)
	if newDeadline.Before(today()) {
		t.Errorf("current_deadline should be caught up to today or later, got %v", task.CurrentDeadline)
	}
	if task.Status != "pending" {
		t.Errorf("status should reset to pending, got %v", task.Status)
	}
}
