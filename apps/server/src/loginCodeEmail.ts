import type { EmailMessage } from './email.js'

/** The one mail this product sends on the critical path (#316).
 *
 *  Server-side prose, which the app otherwise doesn't have: #208 keeps API
 *  responses in codes precisely so translation stays on the client. A mail has
 *  no client, so the two languages the UI ships live here — a Russian-speaking
 *  teacher getting English instructions on the one screen they cannot get past
 *  is not an acceptable default. The locale rides in on the request; anything
 *  unrecognized falls back to English. */

export type EmailLocale = 'en' | 'ru'

export function isEmailLocale(value: unknown): value is EmailLocale {
  return value === 'en' || value === 'ru'
}

interface Params {
  code: string
  confirmation: string
  ttlMinutes: number
  locale: EmailLocale
}

const COPY = {
  en: {
    // The code is in the subject on purpose: it is most often read off a lock
    // screen notification, and opening the mail to copy four-plus taps away is
    // the whole friction this flow was supposed to remove.
    subject: (code: string) => `${code} — your Grafetto sign-in code`,
    heading: 'Your sign-in code',
    ttl: (m: number) => `The code is valid for ${m} minutes and can be used once.`,
    confirm: (phrase: string) =>
      `The page you requested it from shows <b>${phrase}</b>. If it shows something else, someone else asked for this code — don't enter it.`,
    ignore: "If you didn't try to sign in, you can ignore this email — nobody can use the code without it.",
  },
  ru: {
    subject: (code: string) => `${code} — код для входа в Grafetto`,
    heading: 'Код для входа',
    ttl: (m: number) => `Код действует ${m} минут и работает один раз.`,
    confirm: (phrase: string) =>
      `На странице, откуда вы его запросили, показано <b>${phrase}</b>. Если там другое — код запросили не вы, вводить его не нужно.`,
    ignore: 'Если вы не пытались войти, просто проигнорируйте это письмо: без него код бесполезен.',
  },
} as const

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, '')
}

export function buildLoginCodeEmail({ code, confirmation, ttlMinutes, locale }: Params): Omit<EmailMessage, 'to'> {
  const copy = COPY[locale]
  const confirmLine = copy.confirm(confirmation)

  const text = [
    `${copy.heading}: ${code}`,
    '',
    copy.ttl(ttlMinutes),
    stripTags(confirmLine),
    '',
    copy.ignore,
  ].join('\n')

  // Inline styles and a table-free layout on purpose: mail clients strip
  // <style> blocks, and this has one job — show six digits large enough to
  // read and retype without zooming.
  const html = `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f6f5f3;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#1a1a1a">
  <div style="max-width:420px;margin:0 auto;background:#fff;border-radius:12px;padding:28px">
    <div style="font-size:15px;color:#666">${copy.heading}</div>
    <div style="font-size:38px;font-weight:600;letter-spacing:.14em;margin:12px 0 18px">${code}</div>
    <div style="font-size:14px;line-height:1.5;color:#444">${copy.ttl(ttlMinutes)}</div>
    <div style="font-size:14px;line-height:1.5;color:#444;margin-top:10px">${confirmLine}</div>
    <div style="font-size:13px;line-height:1.5;color:#888;margin-top:18px">${copy.ignore}</div>
  </div>
</body></html>`

  return { subject: copy.subject(code), text, html }
}
