export default function App() {
  return (
    <div className="td-app">
      <header className="td-header">
        <div className="td-header-inner">
          <div className="td-header-left">
            <span className="td-logo-mark" />
            <span className="td-header-title">MemoTodo</span>
          </div>
          <div className="td-header-actions">
            <button className="td-icon-btn td-btn-settings" title="設定">
              <i className="bi bi-gear" />
            </button>
          </div>
        </div>
      </header>
      <main className="td-main">
        <div className="td-content">
          {/* Tabs / QuickInput / TodoList はこの後のタスクで差し込む */}
        </div>
      </main>
    </div>
  )
}
