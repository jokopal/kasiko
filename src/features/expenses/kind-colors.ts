import type { ExpenseKind } from '@/lib/types'

// Expense-kind identity colors: categorical slots orange, violet, aqua — validated as a
// set with the dataviz palette checker (all-pairs CVD ΔE ≥ 9.2 on light). Orange stays
// "expense" across the dashboard. Aqua is below 3:1 on white, so a kind color is never
// shown without its text label.
export const KIND_COLOR: Record<ExpenseKind, string> = {
  operating: '#eb6834',
  non_operating: '#6250d6',
  drawing: '#1baf7a',
}
