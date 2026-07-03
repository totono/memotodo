import { create } from 'zustand'

export type Tab = 'pending' | 'done'
export type DetailPattern = 'inline' | 'modal'

// 未保存編集ドラフト（DB には保存しない）
export interface TodoDraft {
  title?: string
  memo?: string
  deadline?: string | null
  reminder_enabled?: boolean
  reminder_at?: string | null
}

export type RecurringOpenId = number | 'new' | null

// 定期タスクの未保存編集ドラフト（DB には保存しない）。period_value は保存時に
// weekday/monthDay/yearMonth/yearDay から組み立てる（種別切替で各値を保持するため）。
export interface RecurringDraft {
  title?: string
  memo?: string
  period_type?: string
  weekday?: string
  monthDay?: number
  yearMonth?: number
  yearDay?: number
}

interface UiState {
  activeTab: Tab
  openId: number | null
  detailPattern: DetailPattern
  drafts: Record<number, TodoDraft>
  setTab: (t: Tab) => void
  setOpenId: (id: number | null) => void
  setDetailPattern: (p: DetailPattern) => void
  setDraft: (id: number, draft: TodoDraft) => void
  clearDraft: (id: number) => void
  recurringPanelOpen: boolean
  recurringOpenId: RecurringOpenId
  recurringDrafts: Record<string, RecurringDraft>
  setRecurringPanelOpen: (open: boolean) => void
  setRecurringOpenId: (id: RecurringOpenId) => void
  setRecurringDraft: (key: string, draft: RecurringDraft) => void
  clearRecurringDraft: (key: string) => void
}

export const useUiStore = create<UiState>((set) => ({
  activeTab: 'pending',
  openId: null,
  detailPattern: 'inline',
  drafts: {},
  setTab: (t) => set({ activeTab: t, openId: null }),
  setOpenId: (id) => set({ openId: id }),
  setDetailPattern: (p) => set({ detailPattern: p }),
  setDraft: (id, draft) => set((s) => ({ drafts: { ...s.drafts, [id]: draft } })),
  clearDraft: (id) =>
    set((s) => {
      const next = { ...s.drafts }
      delete next[id]
      return { drafts: next }
    }),
  recurringPanelOpen: false,
  recurringOpenId: null,
  recurringDrafts: {},
  // パネルを閉じるときは開いていた詳細を畳む（ドラフトは保持）。
  setRecurringPanelOpen: (open) => set(open ? { recurringPanelOpen: true } : { recurringPanelOpen: false, recurringOpenId: null }),
  setRecurringOpenId: (id) => set({ recurringOpenId: id }),
  setRecurringDraft: (key, draft) => set((s) => ({ recurringDrafts: { ...s.recurringDrafts, [key]: draft } })),
  clearRecurringDraft: (key) =>
    set((s) => {
      const next = { ...s.recurringDrafts }
      delete next[key]
      return { recurringDrafts: next }
    }),
}))
