package todo

import "time"

// NearDeadlineWorkdays は「期限が近い」と判定する営業日数のしきい値。
const NearDeadlineWorkdays = 3

const dateLayout = "2006-01-02"

func today() time.Time {
	now := time.Now()
	return time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
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
