import type { ReactNode } from 'react'

// Wraps its input in a real <label> so the field has an accessible name (screen readers
// used to announce every Sell input as just "edit text") and tapping the caption focuses
// it. `group` is for button groups (Condition), which must not sit inside a label.
export default function Field({ label, children, group }: { label: string; children: ReactNode; group?: boolean }) {
  if (group) {
    return (
      <div role="group" aria-label={label}>
        <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted">{label}</span>
        {children}
      </div>
    )
  }
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted">{label}</span>
      {children}
    </label>
  )
}
