package todo

import (
	"testing"
	"time"
)

// today()（ローカル日付）と parseDate()（UTCとして解釈）の基準がズレていると、
// UTCより進んだタイムゾーン（例: JST=+9h）で「明日期限」のタスクが誤って
// is_overdue や is_near と判定されてしまう。両者を同じUTCアンカーに揃えることで
// タイムゾーンに関わらず一貫した日数計算になっていることを確認する。
func TestTodayIsTimezoneConsistentWithParseDate(t *testing.T) {
	orig := time.Local
	defer func() { time.Local = orig }()

	for _, tz := range []string{"Asia/Tokyo", "America/New_York", "Pacific/Kiritimati", "UTC"} {
		loc, err := time.LoadLocation(tz)
		if err != nil {
			t.Skipf("タイムゾーンデータがロードできません(%s): %v", tz, err)
		}
		time.Local = loc

		t.Run(tz, func(t *testing.T) {
			now := time.Now()
			todayStr := now.Format(dateLayout)
			tomorrowStr := now.AddDate(0, 0, 1).Format(dateLayout)

			if isOverdue(todayStr) {
				t.Errorf("今日の日付(%s)が overdue と判定された", todayStr)
			}
			if isOverdue(tomorrowStr) {
				t.Errorf("明日の日付(%s)が overdue と判定された", tomorrowStr)
			}

			target, _ := parseDate(tomorrowStr)
			if got := countWorkdaysUntil(target); got < 0 {
				t.Errorf("明日までの営業日数が負数になった: %d", got)
			}
		})
	}
}
