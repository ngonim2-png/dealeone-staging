import { useEffect, useRef, useState } from 'react'
import { X, Trash2, Flag, BadgeCheck } from 'lucide-react'
import { useApp } from '../context/AppContext'
import ReportSheet from './ReportSheet'
import { timeAgo } from '../lib/format'

const SLIDE_MS = 5000

// Full-screen story viewer — mirrors WhatsApp/Instagram Status: one photo at a time, a
// segmented progress bar across the top, auto-advances every SLIDE_MS, taps on the left/
// right half step back/forward. Marks each slide viewed once (see AppContext.viewStatus) as
// soon as it's shown, not only once the whole group is exhausted, so a partial view still
// counts (matches the read-time "viewedByMe" semantics routes/statuses.ts computes).
export default function StatusViewer({
  userId,
  onClose,
}: {
  userId: string | null
  onClose: () => void
}) {
  const { statusGroups, sellers, currentUser, deleteStatus, viewStatus } = useApp()
  const [index, setIndex] = useState(0)
  const [reportOpen, setReportOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const group = statusGroups.find((g) => g.userId === userId)
  const poster = group ? sellers.find((s) => s.id === group.userId) : undefined
  const statuses = group?.statuses ?? []
  const current = statuses[index]
  const mine = userId === currentUser?.id

  // Reset to the first slide whenever a different poster's group is opened.
  useEffect(() => {
    setIndex(0)
  }, [userId])

  useEffect(() => {
    if (!current) return
    viewStatus(current.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id])

  useEffect(() => {
    if (!current) return
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      setIndex((i) => (i < statuses.length - 1 ? i + 1 : i))
      if (index >= statuses.length - 1) onClose()
    }, SLIDE_MS)
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id, statuses.length])

  if (!userId || !group || !poster || !current) return null

  const goPrev = () => setIndex((i) => Math.max(0, i - 1))
  const goNext = () => {
    if (index < statuses.length - 1) setIndex((i) => i + 1)
    else onClose()
  }

  const remove = async () => {
    setDeleting(true)
    try {
      await deleteStatus(current.id)
      if (statuses.length <= 1) onClose()
      else setIndex((i) => Math.min(i, statuses.length - 2))
    } catch (err) {
      console.error('delete status failed', err)
      setDeleting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-black">
      <div className="flex gap-1 px-3 pt-3">
        {statuses.map((s, i) => (
          <div key={s.id} className="h-1 flex-1 overflow-hidden rounded-full bg-white/25">
            <div
              className="h-full rounded-full bg-white"
              style={{
                width: i < index ? '100%' : i > index ? '0%' : '100%',
                transition: i === index ? `width ${SLIDE_MS}ms linear` : 'none',
              }}
            />
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between gap-2 px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-2 text-base">
            {poster.avatar}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1">
              <p className="truncate text-sm font-medium text-white">{poster.name}</p>
              {poster.verificationLevel >= 3 && <BadgeCheck size={12} className="shrink-0 text-good" />}
            </div>
            <p className="text-[11px] text-white/60">{timeAgo(current.createdAt)} ago</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {mine ? (
            <button
              onClick={remove}
              disabled={deleting}
              aria-label="Delete status"
              className="tap-flash flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white transition active:scale-90"
            >
              <Trash2 size={15} />
            </button>
          ) : (
            <button
              onClick={() => setReportOpen(true)}
              aria-label="Report status"
              className="tap-flash flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white transition active:scale-90"
            >
              <Flag size={15} />
            </button>
          )}
          <button
            onClick={onClose}
            aria-label="Close"
            className="tap-flash flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white transition active:scale-90"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      <div className="relative flex-1">
        <img src={current.imageUrl} alt="" className="h-full w-full object-contain" />
        <button aria-label="Previous" onClick={goPrev} className="absolute inset-y-0 left-0 w-1/3" />
        <button aria-label="Next" onClick={goNext} className="absolute inset-y-0 right-0 w-2/3" />
      </div>

      {current.caption && (
        <p className="px-4 pb-6 pt-3 text-center text-sm text-white">{current.caption}</p>
      )}

      <ReportSheet
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        targetType="status"
        targetId={current.id}
        targetLabel={current.caption ? `"${current.caption}"` : `${poster.name}'s status`}
      />
    </div>
  )
}
