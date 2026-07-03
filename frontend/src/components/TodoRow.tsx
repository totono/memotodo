import { Todo } from '../api/client'
import { useUiStore } from '../state/uiStore'
import { fmtDeadline, previewText } from '../lib/format'

export default function TodoRow({ todo }: { todo: Todo }) {
  const activeTab = useUiStore((s) => s.activeTab)
  const openId = useUiStore((s) => s.openId)
  const setOpenId = useUiStore((s) => s.setOpenId)
  const isDone = activeTab === 'done'
  const isOpen = openId === todo.id

  const rowClass = [
    'td-row',
    isDone ? 'is-done' : '',
    todo.is_overdue && !isDone ? 'is-overdue' : '',
    todo.is_important ? 'is-important' : '',
  ].join(' ')

  const chipClass = todo.is_overdue && !isDone ? 'is-overdue' : todo.is_near && !isDone ? 'is-near' : ''

  return (
    <div className={rowClass}>
      <div className={`td-checkbox ${isDone ? 'is-checked' : ''}`} title={isDone ? '未完了に戻す' : '完了にする'}>
        {isDone ? <i className="bi bi-check-lg" /> : null}
      </div>
      <div className="td-row-main">
        <div className="td-row-title" onClick={() => setOpenId(isOpen ? null : todo.id)}>
          {previewText(todo.title)}
        </div>
      </div>
      <div className="td-row-side">
        {todo.reminder_enabled ? (
          <span className="td-meta-icon" title="リマインダーあり"><i className="bi bi-bell" /></span>
        ) : null}
        {todo.memo && todo.memo.trim() ? (
          <span className="td-meta-icon" title="詳細メモあり"><i className="bi bi-journal-text" /></span>
        ) : null}
        <button className={`td-icon-btn td-btn-important ${todo.is_important ? 'is-active' : ''}`} title="重要">
          <i className={`bi ${todo.is_important ? 'bi-star-fill' : 'bi-star'}`} />
        </button>
        {todo.deadline ? <span className={`td-deadline-chip ${chipClass}`}>{fmtDeadline(todo.deadline)}</span> : null}
        <button className="td-icon-btn td-chevron" title="詳細" onClick={() => setOpenId(isOpen ? null : todo.id)}>
          <i className={`bi ${isOpen ? 'bi-chevron-up' : 'bi-chevron-down'}`} />
        </button>
      </div>
    </div>
  )
}
