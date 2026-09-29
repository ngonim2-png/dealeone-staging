// Scam-pattern check for chat messages. The common local-marketplace scams all need the
// victim to pay (or hand over a code) before seeing the item, so we look for those
// phrases in what the *other* person writes and show a calm warning under that message.
// Deliberately simple and explainable — a keyword list, not a model — so it never blocks
// or hides a message, it only adds context.

export type ScamKind = 'prepay' | 'code'

const RULES: { re: RegExp; kind: ScamKind }[] = [
  { re: /\b(send|pay|transfer)\b[^.?!]{0,30}\b(first|before|advance|upfront|up front|deposit)\b/i, kind: 'prepay' },
  { re: /\b(advance payment|deposit first|pay first|payment first|send (the )?money first|pay small first)\b/i, kind: 'prepay' },
  { re: /\b(delivery|transport|shipping|customs|clearing) (fee|money|charge)\b/i, kind: 'prepay' },
  { re: /\b(western union|moneygram|gift ?card|itunes card|crypto|usdt|bitcoin)\b/i, kind: 'prepay' },
  { re: /\b(pin|otp|verification code|confirmation code|the code (i|we) sent|security code)\b/i, kind: 'code' },
]

export function scamSignal(text: string | undefined | null): ScamKind | null {
  if (!text) return null
  for (const r of RULES) if (r.re.test(text)) return r.kind
  return null
}

export const SCAM_ADVICE: Record<ScamKind, string> = {
  prepay: "Careful: don't send money before you've seen the item in person. Real sellers let you check it first.",
  code: 'Never share your PIN, Orange Money / Afrimoney code or any verification code — DEALEONE will never ask for it.',
}
