package main

import (
	"context"
	"embed"
	"fmt"
	"io/fs"
	"net"
	"net/http"
	"os"
	"strings"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	wailsruntime "github.com/wailsapp/wails/v2/pkg/runtime"

	"memotodo/internal/tray"
)

//go:embed all:frontend/dist
var assets embed.FS

// singleInstancePort は多重起動防止用のロック代わりに使うポート。
// 実際にHTTPサーバーとしては使わず、バインドできるかどうかだけを見る
// （旧DeskPortalの「同一ポートが使用中なら新規プロセスは起動せず終了する」という
//
//	多重起動防止の思想を踏襲）。
const singleInstancePort = 18432

func main() {
	lock, err := net.Listen("tcp", fmt.Sprintf("127.0.0.1:%d", singleInstancePort))
	if err != nil {
		fmt.Println("MemoTodo はすでに起動しています。")
		return
	}
	defer lock.Close()

	app := NewApp()

	// /todo-images/ 配下は SaveImage で保存した画像ファイルをディスクから配信する。
	// それ以外は埋め込みフロントエンド資産（frontend/dist）を配信する。
	imagesMiddleware := func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if strings.HasPrefix(r.URL.Path, "/todo-images/") {
				if app.store == nil {
					http.NotFound(w, r)
					return
				}
				name := strings.TrimPrefix(r.URL.Path, "/todo-images/")
				if strings.Contains(name, "/") || strings.Contains(name, "..") {
					http.Error(w, "forbidden", http.StatusForbidden)
					return
				}
				http.ServeFile(w, r, app.store.ImagesDir()+string(os.PathSeparator)+name)
				return
			}
			next.ServeHTTP(w, r)
		})
	}

	distFS, err := fs.Sub(assets, "frontend/dist")
	if err != nil {
		fmt.Println("フロントエンド資産の読み込みに失敗しました:", err)
		os.Exit(1)
	}

	quitting := false

	wailsApp := &options.App{
		Title:  "MemoTodo",
		Width:  1180,
		Height: 800,
		AssetServer: &assetserver.Options{
			Assets:     distFS,
			Middleware: imagesMiddleware,
		},
		BackgroundColour: &options.RGBA{R: 247, G: 246, B: 243, A: 1},
		OnStartup:        app.startup,
		OnShutdown:       app.shutdown,
		OnBeforeClose: func(ctx context.Context) bool {
			// ウィンドウを閉じてもアプリは常駐させ、トレイに残す。
			// トレイの「終了」メニューからのみ完全終了する。
			if quitting {
				return false
			}
			wailsruntime.WindowHide(ctx)
			return true
		},
		Bind: []interface{}{
			app,
		},
	}

	go tray.Run(tray.Callbacks{
		OnShow: func() {
			if app.ctx != nil {
				wailsruntime.WindowShow(app.ctx)
				wailsruntime.WindowUnminimise(app.ctx)
			}
		},
		OnAddTodo: func() {
			if app.ctx != nil {
				wailsruntime.WindowShow(app.ctx)
				wailsruntime.WindowUnminimise(app.ctx)
				wailsruntime.EventsEmit(app.ctx, "todo:focus-quick-input")
			}
		},
		OnQuit: func() {
			quitting = true
			if app.ctx != nil {
				wailsruntime.Quit(app.ctx)
			}
		},
	})

	if err := wails.Run(wailsApp); err != nil {
		fmt.Println("Error:", err.Error())
	}
}
