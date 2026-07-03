import { useTodos } from '../hooks/useTodos'
import { useUiStore } from '../state/uiStore'
import TodoRow from './TodoRow'

export default function TodoList() {
  const activeTab = useUiStore((s) => s.activeTab)
  const { data: todos, isLoading, isError } = useTodos()

  if (isLoading) return <div className="td-loading"><span className="td-spinner" /></div>
  if (isError) return <div style={{ padding: 24, color: 'var(--accent)', fontSize: 13 }}>読み込みに失敗しました</div>
  const list = todos ?? []
  if (list.length === 0) return <div className="td-empty">タスクはありません</div>

  const noDate = activeTab === 'done' ? [] : list.filter((t) => !t.deadline)
  const dated = activeTab === 'done'
    ? [...list].sort((a, b) => (b.done_at || '').localeCompare(a.done_at || ''))
    : list.filter((t) => t.deadline)
  const flat = activeTab === 'done' ? dated : null

  return (
    <div className="td-card-group">
      {flat ? (
        <div className="td-card">
          <div className="td-list">{flat.map((t) => <TodoRow key={t.id} todo={t} />)}</div>
        </div>
      ) : (
        <>
          {noDate.length > 0 && (
            <div className="td-card">
              <div className="td-section-label">期日なし</div>
              <div className="td-list" id="tdListNoDate">{noDate.map((t) => <TodoRow key={t.id} todo={t} />)}</div>
            </div>
          )}
          {dated.length > 0 && (
            <div className="td-card">
              <div className="td-section-label"><i className="bi bi-calendar3" /> 期日あり</div>
              <div className="td-list">{dated.map((t) => <TodoRow key={t.id} todo={t} />)}</div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
