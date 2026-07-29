/** Transactional email (#244). One provider call, deliberately thin: the
 *  product sends very few kinds of message, and every one of them is "one
 *  address, one short text". Anything richer belongs to whoever needs it.
 *
 *  Called with the raw `fetch` rather than the `resend` SDK: the whole
 *  integration is a single POST, while the SDK is a dependency that has to be
 *  audited, updated, and bundled into the image for the same request. If
 *  batching, attachments or webhooks ever arrive, that trade flips.
 *
 *  **Delivery is now on the critical path for signing in** (#316) — it is not
 *  a nice-to-have notification any more. So this throws rather than swallowing:
 *  a caller that can't get a code out must be able to say so to the person
 *  waiting for it, instead of leaving them in front of an empty inbox. */

const RESEND_ENDPOINT = 'https://api.resend.com/emails'
const REQUEST_TIMEOUT_MS = 10_000

/** Default sender. `onboarding@resend.dev` is Resend's shared test address:
 *  it works with no DNS setup at all, but only ever delivers to the account
 *  owner's own mailbox — which is exactly enough to develop and test against,
 *  and not enough to release with. Verifying a real domain is a manual step
 *  (see deploy/README.md) that ends with `EMAIL_FROM` set to something on it. */
const DEFAULT_FROM = 'Grafetto <onboarding@resend.dev>'

export interface EmailMessage {
  to: string
  subject: string
  /** Plain-text half. Never optional: some clients show it, and a mail with
   *  no text part scores worse with spam filters — which for a sign-in code
   *  is the difference between logging in and not. */
  text: string
  html: string
}

export class EmailNotConfiguredError extends Error {
  constructor() {
    super('RESEND_API_KEY is not set')
    this.name = 'EmailNotConfiguredError'
  }
}

export class EmailSendError extends Error {
  status: number
  constructor(status: number, detail: string) {
    super(`email send failed: ${status} ${detail}`)
    this.name = 'EmailSendError'
    this.status = status
  }
}

/** True when a real provider is wired up. Used at boot to say something loud
 *  about a production deploy that cannot send mail, rather than discovering it
 *  from the first teacher who can't sign in. */
export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY)
}

export async function sendEmail(message: EmailMessage): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    // Dev convenience, and only that: without a key the message goes to the
    // server log so local work needs no Resend account. Guarded on NODE_ENV
    // because doing this in production would quietly turn "we failed to mail
    // a sign-in code" into a success — and print the code into the logs.
    if (process.env.NODE_ENV === 'production') throw new EmailNotConfiguredError()
    console.info(
      `[email] no RESEND_API_KEY — not sending. to=${message.to} subject=${message.subject}\n${message.text}`,
    )
    return
  }

  const res = await fetch(RESEND_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM || DEFAULT_FROM,
      to: [message.to],
      subject: message.subject,
      text: message.text,
      html: message.html,
    }),
    // A hung provider must not hold a request open: this route is called by
    // someone staring at a spinner, and Resend being slow is not a reason to
    // hold a connection on a single-vCPU box.
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    // Body, not just status: Resend answers 403 both for "domain not verified"
    // and for "this key can't send from that address", and the difference is
    // the whole debugging session.
    throw new EmailSendError(res.status, detail.slice(0, 500))
  }
}
