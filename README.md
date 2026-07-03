# MemoTodo

DeskPortal の TODO MOD（付箋的なメモ管理＋定期タスク管理）を Go + Wails の単一デスクトップアプリへ移植したものです。

## 構成

- `internal/todo/` — メモ・定期タスクのCRUD、営業日判定、リンク検出、設定の読み書き、通知スケジューラ（DB/OS非依存のロジック）
- `internal/tray/` — タスクトレイアイコン（開く／TODOを追加／終了）
- `app.go` — Wails バインディング層（フロントエンドから呼び出せるAPI）
- `main.go` — アプリのエントリポイント（ウィンドウ設定・多重起動防止・トレイ起動）
- `frontend/` — UI（Vanilla JS + Vite）。`frontend/src/todo.js` がメインロジック

## データ保存先

`os.UserConfigDir()/MemoTodo/`（Windows では `%AppData%\MemoTodo\`）に SQLite DB (`todo.db`)、設定 (`todo_settings.json`)、添付画像 (`todo_images/`) を保存します。

## 開発

```sh
wails dev
```

## ビルド

Windows 向け:

```sh
wails build -platform windows/amd64
```

Linux で動作確認する場合（WebKitGTK 4.1 系を使う環境）:

```sh
wails build -tags webkit2_41
```

## 使用ライブラリのライセンス

商用利用可能な permissive ライセンスのみを採用しています。

- `github.com/wailsapp/wails/v2` — MIT
- `modernc.org/sqlite`（純Go実装・CGO不要） — BSD-3-Clause
- `fyne.io/systray` — Apache-2.0
