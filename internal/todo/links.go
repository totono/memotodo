package todo

import "regexp"

var (
	reTag     = regexp.MustCompile(`<[^>]+>`)
	reFileURL = regexp.MustCompile(`file://\S+`)
	reHTTPURL = regexp.MustCompile(`https?://\S+`)
	rePathUNC = regexp.MustCompile(`(\\\\[^\s<>"]+|[A-Za-z]:\\[^\s<>"]+)`)
)

// ParseLinks はテキスト（またはHTML）内のURL・ファイルパスを検出してリスト化する。
// HTMLが渡された場合はタグを除去してからパターンを検索する。
func ParseLinks(text string) []Link {
	plain := reTag.ReplaceAllString(text, " ")

	var results []Link
	seen := map[string]bool{}
	add := func(typ, value string) {
		if !seen[value] {
			seen[value] = true
			results = append(results, Link{Type: typ, Value: value})
		}
	}

	for _, m := range reFileURL.FindAllString(plain, -1) {
		add("path", m)
	}
	for _, m := range reHTTPURL.FindAllString(plain, -1) {
		add("url", m)
	}
	for _, m := range rePathUNC.FindAllString(plain, -1) {
		add("path", m)
	}
	return results
}
