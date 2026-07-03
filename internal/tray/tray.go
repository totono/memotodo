// Package tray はタスクトレイアイコンとメニューを提供する。
// 旧 DeskPortal の pystray 常駐トレイ（MODごとのクイックアクション登録）の
// 「TODO を追加」ショートカットに相当する最小限のメニューを持つ。
package tray

import (
	"embed"

	"fyne.io/systray"
)

//go:embed icon.png
var iconFS embed.FS

// Callbacks はトレイメニュー選択時に呼ばれるハンドラ群。
type Callbacks struct {
	OnShow    func() // 「開く」：メインウィンドウを表示
	OnAddTodo func() // 「TODOを追加」：メインウィンドウを表示しクイック入力にフォーカス
	OnQuit    func() // 「終了」：アプリを完全終了
}

// Run はトレイアイコンを表示してイベントループに入る（呼び出し元でgoroutine化すること）。
func Run(cb Callbacks) {
	systray.Run(func() { onReady(cb) }, func() {})
}

func onReady(cb Callbacks) {
	if icon, err := iconFS.ReadFile("icon.png"); err == nil {
		systray.SetIcon(icon)
	}
	systray.SetTitle("MemoTodo")
	systray.SetTooltip("MemoTodo")

	mShow := systray.AddMenuItem("開く", "MemoTodo を開く")
	mAdd := systray.AddMenuItem("TODO を追加", "新しいTODOを追加")
	systray.AddSeparator()
	mQuit := systray.AddMenuItem("終了", "MemoTodo を終了")

	go func() {
		for {
			select {
			case <-mShow.ClickedCh:
				if cb.OnShow != nil {
					cb.OnShow()
				}
			case <-mAdd.ClickedCh:
				if cb.OnAddTodo != nil {
					cb.OnAddTodo()
				}
			case <-mQuit.ClickedCh:
				if cb.OnQuit != nil {
					cb.OnQuit()
				}
				systray.Quit()
				return
			}
		}
	}()

	systray.SetOnTapped(func() {
		if cb.OnShow != nil {
			cb.OnShow()
		}
	})
}
