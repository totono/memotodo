import { useMutation, useQueryClient } from '@tanstack/react-query'
import { App, main } from '../api/client'
import { qk } from '../api/queryKeys'

export function useRecurringMutations() {
  const qc = useQueryClient()
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: qk.recurringPanel() })
    qc.invalidateQueries({ queryKey: qk.recurringTasks() })
  }

  const create = useMutation({
    mutationFn: (req: main.CreateRecurringTaskRequest) => App.CreateRecurringTask(req),
    onSuccess: invalidate,
  })
  const update = useMutation({
    mutationFn: ({ id, req }: { id: number; req: main.UpdateRecurringTaskRequest }) => App.UpdateRecurringTask(id, req),
    onSuccess: invalidate,
  })
  const remove = useMutation({
    mutationFn: (id: number) => App.DeleteRecurringTask(id),
    onSuccess: invalidate,
  })
  const toggleComplete = useMutation({
    mutationFn: (id: number) => App.ToggleRecurringTask(id),
    onSuccess: invalidate,
  })
  const toggleActive = useMutation({
    mutationFn: ({ id, isActive }: { id: number; isActive: boolean }) =>
      App.UpdateRecurringTask(id, main.UpdateRecurringTaskRequest.createFrom({ is_active: isActive })),
    onSuccess: invalidate,
  })

  return { create, update, remove, toggleComplete, toggleActive, invalidate }
}
