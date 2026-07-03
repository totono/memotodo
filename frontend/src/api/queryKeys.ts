export const qk = {
  todos: (tab: string) => ['todos', tab] as const,
  todo: (id: number) => ['todo', id] as const,
  settings: () => ['settings'] as const,
  nearOrOverdue: () => ['nearOrOverdue'] as const,
}
