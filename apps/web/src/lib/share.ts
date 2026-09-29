// Share a listing/event: the phone's native share sheet (WhatsApp, SMS, etc.) where
// available, otherwise copy the link. Returns what happened so the caller can show a toast.
export async function shareLink(opts: {
  title: string
  text?: string
  path: string
  // Extra query string before the hash (e.g. "ref=ABC1234" on invite links) — kept outside
  // the #/route part so it survives the router and any link preview that strips fragments.
  query?: string
}): Promise<'shared' | 'copied' | 'cancelled' | 'failed'> {
  const url = `${window.location.origin}${window.location.pathname}${opts.query ? `?${opts.query}` : ''}#${opts.path}`
  if (navigator.share) {
    try {
      await navigator.share({ title: opts.title, text: opts.text ?? opts.title, url })
      return 'shared'
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return 'cancelled'
      // fall through to copying
    }
  }
  try {
    await navigator.clipboard.writeText(url)
    return 'copied'
  } catch {
    return 'failed'
  }
}
