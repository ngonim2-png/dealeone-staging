// Voice search via the browser's built-in speech recognition (Chrome/Android, Safari on
// iOS 14.5+). Not every browser has it — callers hide the mic when speechSupported is false.
// Recognition runs on the phone/browser vendor's service; nothing is sent to DEALEONE.
// Language: Sierra Leone English. There is no Krio speech model in any browser today, so
// Krio speakers get English recognition (which copes with most product names anyway).

type Recognition = {
  lang: string
  interimResults: boolean
  maxAlternatives: number
  continuous: boolean
  onresult: ((e: any) => void) | null
  onerror: ((e: any) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
  abort: () => void
}

function ctor(): (new () => Recognition) | null {
  const w = window as any
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

export const speechSupported = typeof window !== 'undefined' && !!ctor()

export interface ListenHandle {
  stop: () => void
}

export function listen(opts: {
  onText: (text: string, final: boolean) => void
  onEnd: () => void
  onError: (reason: 'denied' | 'no-speech' | 'failed') => void
}): ListenHandle | null {
  const C = ctor()
  if (!C) return null
  const rec = new C()
  rec.lang = 'en-GB'
  rec.interimResults = true
  rec.maxAlternatives = 1
  rec.continuous = false
  rec.onresult = (e: any) => {
    let text = ''
    let final = false
    for (let i = 0; i < e.results.length; i++) {
      text += e.results[i][0].transcript
      if (e.results[i].isFinal) final = true
    }
    opts.onText(text.trim(), final)
  }
  rec.onerror = (e: any) => {
    const err = String(e?.error ?? '')
    opts.onError(err === 'not-allowed' || err === 'service-not-allowed' ? 'denied' : err === 'no-speech' ? 'no-speech' : 'failed')
  }
  rec.onend = () => opts.onEnd()
  try {
    rec.start()
  } catch {
    return null
  }
  return { stop: () => rec.stop() }
}
