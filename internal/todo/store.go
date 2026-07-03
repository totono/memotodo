// Package todo は TODO MOD（メモ管理・定期タスク管理）のデータ操作とスケジューリングを提供する。
// 旧 Python 実装（apps/todo/manager.py）の挙動を Go に移植したもの。
package todo

import (
	"database/sql"
	"fmt"
	"os"
	"path/filepath"

	_ "modernc.org/sqlite"
)

// Store は TODO MOD のDB・設定・画像ディレクトリへのアクセスをまとめる。
type Store struct {
	db           *sql.DB
	dataDir      string
	imagesDir    string
	settingsPath string
}

// NewStore はデータディレクトリを準備し、DBスキーマを初期化した Store を返す。
// dataDir 配下に todo.db / todo_settings.json / todo_images/ を配置する。
func NewStore(dataDir string) (*Store, error) {
	imagesDir := filepath.Join(dataDir, "todo_images")
	if err := os.MkdirAll(imagesDir, 0o755); err != nil {
		return nil, fmt.Errorf("データディレクトリの作成に失敗しました: %w", err)
	}

	dbPath := filepath.Join(dataDir, "todo.db")
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		return nil, fmt.Errorf("DBオープンに失敗しました: %w", err)
	}
	// SQLiteは同時書き込みに弱いため、単一コネクションで直列化する
	db.SetMaxOpenConns(1)

	s := &Store{
		db:           db,
		dataDir:      dataDir,
		imagesDir:    imagesDir,
		settingsPath: filepath.Join(dataDir, "todo_settings.json"),
	}
	if err := s.migrate(); err != nil {
		return nil, err
	}
	return s, nil
}

func (s *Store) Close() error {
	return s.db.Close()
}

func (s *Store) ImagesDir() string {
	return s.imagesDir
}

func (s *Store) migrate() error {
	stmts := []string{
		`CREATE TABLE IF NOT EXISTS todos (
			id               INTEGER PRIMARY KEY AUTOINCREMENT,
			title            TEXT    NOT NULL,
			memo             TEXT    NOT NULL DEFAULT '',
			status           TEXT    NOT NULL DEFAULT 'pending',
			deadline         TEXT,
			reminder_enabled INTEGER NOT NULL DEFAULT 0,
			reminder_at      TEXT,
			reminded         INTEGER NOT NULL DEFAULT 0,
			created_at       TEXT    NOT NULL,
			done_at          TEXT,
			is_important     INTEGER NOT NULL DEFAULT 0,
			sort_order       INTEGER NOT NULL DEFAULT 0
		)`,
		`CREATE TABLE IF NOT EXISTS recurring_tasks (
			id                  INTEGER PRIMARY KEY AUTOINCREMENT,
			title               TEXT    NOT NULL,
			memo                TEXT    NOT NULL DEFAULT '',
			period_type         TEXT    NOT NULL,
			period_value        TEXT    NOT NULL,
			current_deadline    TEXT,
			status              TEXT    NOT NULL DEFAULT 'pending',
			done_at             TEXT,
			is_active           INTEGER NOT NULL DEFAULT 1,
			created_at          TEXT    NOT NULL
		)`,
	}
	for _, stmt := range stmts {
		if _, err := s.db.Exec(stmt); err != nil {
			return fmt.Errorf("スキーマ初期化に失敗しました: %w", err)
		}
	}
	return nil
}
