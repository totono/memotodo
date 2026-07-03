package todo

import (
	"sync"
	"time"
)

// Scheduler はリマインダー・定期通知のスケジューリングを管理する。
// 旧実装の threading.Timer ベースのスケジューラを time.AfterFunc で置き換えたもの。
type Scheduler struct {
	store *Store

	// OnReminder はリマインダー通知を表示すべきタイミングで呼ばれる（todoID指定）。
	OnReminder func(todoID int64)
	// OnPeriodic は定期通知（件数まとめ通知）を表示すべきタイミングで呼ばれる。
	OnPeriodic func()

	mu             sync.Mutex
	reminderTimers []*time.Timer
	periodicTimers []*time.Timer

	periodicMu       sync.Mutex
	lastPeriodicCall time.Time
}

func NewScheduler(store *Store) *Scheduler {
	return &Scheduler{store: store}
}

// Start はスケジューラを起動する。起動時通知を即時実行し、リマインダー・定期通知タイマーをセットする。
func (sc *Scheduler) Start() error {
	if err := sc.store.SyncAllRecurringTasks(); err != nil {
		return err
	}
	// アプリ起動直後にウィンドウ描画が整うまで少し待ってから起動時通知を出す
	go func() {
		time.Sleep(2 * time.Second)
		sc.NotifyPeriodicNow()
	}()
	sc.scheduleReminders()
	sc.schedulePeriodicNotifies()
	return nil
}

// Stop は全タイマーをキャンセルする。
func (sc *Scheduler) Stop() {
	sc.mu.Lock()
	defer sc.mu.Unlock()
	for _, t := range sc.reminderTimers {
		t.Stop()
	}
	for _, t := range sc.periodicTimers {
		t.Stop()
	}
	sc.reminderTimers = nil
	sc.periodicTimers = nil
}

func (sc *Scheduler) scheduleReminders() {
	sc.mu.Lock()
	defer sc.mu.Unlock()

	todos, err := sc.store.GetTodos("pending")
	if err != nil {
		return
	}
	now := time.Now()
	for _, t := range todos {
		if !t.ReminderEnabled || t.Reminded || t.ReminderAt == "" {
			continue
		}
		remindAt, err := time.ParseInLocation("2006-01-02T15:04:05", t.ReminderAt, time.Local)
		if err != nil {
			continue
		}
		delay := remindAt.Sub(now)
		if delay <= 0 {
			continue
		}
		id := t.ID
		timer := time.AfterFunc(delay, func() {
			if sc.OnReminder != nil {
				sc.OnReminder(id)
			}
		})
		sc.reminderTimers = append(sc.reminderTimers, timer)
	}
}

func (sc *Scheduler) schedulePeriodicNotifies() {
	sc.mu.Lock()
	defer sc.mu.Unlock()

	settings, err := sc.store.LoadSettings()
	if err != nil {
		return
	}
	now := time.Now()
	for _, timeStr := range settings.NotifyTimes {
		target, err := time.ParseInLocation("15:04", timeStr, time.Local)
		if err != nil {
			continue
		}
		target = time.Date(now.Year(), now.Month(), now.Day(), target.Hour(), target.Minute(), 0, 0, time.Local)
		delay := target.Sub(now)
		if delay <= 0 {
			continue
		}
		timer := time.AfterFunc(delay, sc.NotifyPeriodicNow)
		sc.periodicTimers = append(sc.periodicTimers, timer)
	}
}

// NotifyPeriodicNow は定期通知条件を判定し、対象があれば OnPeriodic を呼ぶ。
// 60秒以内の重複呼び出しはデバウンスする（起動直後タイマーとの競合対策）。
func (sc *Scheduler) NotifyPeriodicNow() {
	sc.periodicMu.Lock()
	now := time.Now()
	if !sc.lastPeriodicCall.IsZero() && now.Sub(sc.lastPeriodicCall) < 60*time.Second {
		sc.periodicMu.Unlock()
		return
	}
	sc.lastPeriodicCall = now
	sc.periodicMu.Unlock()

	nearOrOverdue, err := sc.store.GetNearOrOverdueMemos()
	if err != nil {
		return
	}
	badge, err := sc.store.GetRecurringBadgeCounts()
	if err != nil {
		return
	}
	if len(nearOrOverdue) == 0 && badge.Overdue == 0 {
		return
	}
	if sc.OnPeriodic != nil {
		sc.OnPeriodic()
	}
}

// RescheduleReminders はメモ登録・更新後にリマインダーを再スケジュールする。
// リマインダータイマーのみクリアしてセットし直す（定期通知は据え置き）。
func (sc *Scheduler) RescheduleReminders() {
	sc.mu.Lock()
	for _, t := range sc.reminderTimers {
		t.Stop()
	}
	sc.reminderTimers = nil
	sc.mu.Unlock()
	sc.scheduleReminders()
}

// ReschedulePeriodicNotifies は notify_times 設定変更後に定期通知タイマーを再スケジュールする。
func (sc *Scheduler) ReschedulePeriodicNotifies() {
	sc.mu.Lock()
	for _, t := range sc.periodicTimers {
		t.Stop()
	}
	sc.periodicTimers = nil
	sc.mu.Unlock()
	sc.schedulePeriodicNotifies()
}
