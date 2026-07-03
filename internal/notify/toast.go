// Package notify は Windows のアクションセンター通知（トースト）を出す薄いラッパー。
// git.sr.ht/~jackmordaunt/go-toast は Windows 以外では no-op ビルドになるため、
// このパッケージも OS 分岐なしでそのまま呼び出せる。
//
// メインウィンドウ内のトースト（todo.js側）と役割が異なる：ウィンドウが最小化・
// 他アプリの裏に隠れている等でアプリ内トーストが目に入らない場合でも、Windows標準の
// 通知としてユーザーの目に触れるようにするための並行チャネルであり、ウィンドウを
// 前面化しない（フォーカスを奪わない）。
package notify

import (
	"log"

	toast "git.sr.ht/~jackmordaunt/go-toast/v2"
)

const appID = "MemoTodo"

// Init はアプリ情報をWindowsに登録し、通知クリック時のコールバックを設定する。
// アプリ起動時に一度だけ呼び出す。
func Init(iconPath string, onActivated func()) {
	if err := toast.SetAppData(toast.AppData{
		AppID:    appID,
		IconPath: iconPath,
	}); err != nil {
		log.Printf("notify: SetAppData失敗: %v", err)
	}
	if onActivated != nil {
		toast.SetActivationCallback(func(args string, data []toast.UserData) {
			onActivated()
		})
	}
}

// Push はWindows通知（トースト）を表示する。失敗してもアプリの動作は継続する
// （メインウィンドウ内のトーストが主表示であり、これはあくまで補助的な通知のため）。
func Push(title, body string) {
	n := toast.Notification{
		AppID: appID,
		Title: title,
		Body:  body,
		Audio: toast.Default,
	}
	if err := n.Push(); err != nil {
		log.Printf("notify: 通知の表示に失敗しました: %v", err)
	}
}
