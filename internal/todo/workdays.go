package todo

import "time"

// NearDeadlineWorkdays は「期限が近い」と判定する営業日数のしきい値。
const NearDeadlineWorkdays = 3

const dateLayout = "2006-01-02"

// today はローカルの「今日」の日付を、UTC 0時アンカーの time.Time として返す。
// parseDate（time.Parse は既定でUTC解釈）と同じ基準に揃えることで、
// Sub() による日数計算がタイムゾーンのオフセット分ズレないようにしている。
// （揃えていないと、UTC以外のタイムゾーンで期日近接・超過判定が1日ズレることがある）
func today() time.Time {
	now := time.Now()
	return time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)
}

func isWorkday(d time.Time) bool {
	wd := d.Weekday()
	return wd != time.Saturday && wd != time.Sunday
}

// countWorkdaysUntil は今日から target までの営業日数を返す（今日を含む）。
// 過去日・今日は0を返す。
func countWorkdaysUntil(target time.Time) int {
	t := today()
	if !target.After(t) {
		return 0
	}
	count := 0
	for d := t; !d.After(target); d = d.AddDate(0, 0, 1) {
		if isWorkday(d) {
			count++
		}
	}
	return count
}

func parseDate(s string) (time.Time, bool) {
	if s == "" {
		return time.Time{}, false
	}
	d, err := time.Parse(dateLayout, s)
	if err != nil {
		return time.Time{}, false
	}
	return d, true
}

func isNearDeadline(deadlineStr string) bool {
	target, ok := parseDate(deadlineStr)
	if !ok {
		return false
	}
	return countWorkdaysUntil(target) <= NearDeadlineWorkdays
}

func isOverdue(deadlineStr string) bool {
	target, ok := parseDate(deadlineStr)
	if !ok {
		return false
	}
	return target.Before(today())
}

func attachFlags(t *Todo) {
	t.IsOverdue = isOverdue(t.Deadline)
	t.IsNear = !t.IsOverdue && isNearDeadline(t.Deadline)
}
