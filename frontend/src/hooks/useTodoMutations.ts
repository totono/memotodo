import { useMutation, useQueryClient } from '@tanstack/react-query'
import { App, main } from '../api/client'
import { qk } from '../api/queryKeys'

export function useTodoMutations() {
  const qc = useQueryClient()
  const invalidateLists = () => {
    qc.invalidateQueries({ queryKey: qk.todosAll() })
    qc.invalidateQueries({ queryKey: qk.nearOrOverdue() })
  }
  const onError = (e: unknown) => alert((e as Error)?.message || '操作に失敗しました')

  const create = useMutation({
    mutationFn: (req: main.CreateTodoRequest) => App.CreateTodo(req),
    onSuccess: invalidateLists,
    onError,
  })

  const complete = useMutation({ mutationFn: (id: number) => App.CompleteTodo(id), onSuccess: invalidateLists, onError })
  const restore = useMutation({ mutationFn: (id: number) => App.RestoreTodo(id), onSuccess: invalidateLists, onError })
  const remove = useMutation({ mutationFn: (id: number) => App.DeleteTodo(id), onSuccess: invalidateLists, onError })
  const toggleImportant = useMutation({ mutationFn: (id: number) => App.ToggleImportant(id), onSuccess: invalidateLists, onError })

  const update = useMutation({
    mutationFn: ({ id, req }: { id: number; req: main.UpdateTodoRequest }) => App.UpdateTodo(id, req),
    onSuccess: (_d, { id }) => { invalidateLists(); qc.invalidateQueries({ queryKey: qk.todo(id) }) },
    onError,
  })

  const reorder = useMutation({
    mutationFn: (ids: number[]) => App.ReorderTodos(ids),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.todos('pending') }),
    onError,
  })

  return { create, complete, restore, remove, toggleImportant, update, invalidateLists, reorder }
}
