// Thin fetch()-based Resend HTTP client - deliberately not the `resend` npm
// SDK, matching this repo's existing precedent of using Payload's built-in
// resendAdapter for transactional mail. Payload's generic sendEmail() (which
// wraps that adapter) doesn't expose Resend's `tags` or `scheduled_at`
// params (confirmed by reading @payloadcms/email-resend's source), both of
// which the send pipeline needs - tags to correlate webhook events back to
// an EmailSends row, scheduled_at to delegate exact delivery timing to
// Resend rather than our own cron frequency.

const RESEND_API_BASE = 'https://api.resend.com'
const BATCH_CHUNK_SIZE = 100 // Resend's documented per-call batch limit

export type ResendTag = { name: string; value: string }

export type ResendSendMessage = {
  from: string
  to: string
  subject: string
  html: string
  tags?: ResendTag[]
  scheduled_at?: string
}

export type ResendSendResult = {
  id?: string
  message?: string
  name?: string
  statusCode?: number
}

const chunk = <T>(items: T[], size: number): T[][] => {
  const chunks: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size))
  }
  return chunks
}

export class ResendClient {
  constructor(private readonly apiKey: string) {}

  private async request<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${RESEND_API_BASE}${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
    const data = (await res.json()) as T
    if (!res.ok) {
      const err = data as unknown as { message?: string; name?: string }
      throw new Error(`Resend API error (${res.status}): ${err?.name ?? ''} ${err?.message ?? JSON.stringify(data)}`)
    }
    return data
  }

  send(message: ResendSendMessage): Promise<ResendSendResult> {
    return this.request<ResendSendResult>('/emails', message)
  }

  /**
   * Sends messages in chunks of up to 100 (Resend's batch limit), each
   * message carrying its own `tags`/`scheduled_at`. Returns results in the
   * same order as the input. A chunk failing doesn't stop the remaining
   * chunks - each result is either the Resend response or an error marker.
   */
  async sendBatch(messages: ResendSendMessage[]): Promise<Array<ResendSendResult | { error: string }>> {
    const results: Array<ResendSendResult | { error: string }> = []
    for (const batch of chunk(messages, BATCH_CHUNK_SIZE)) {
      try {
        // Resend wraps batch results in { data: [...] }, unlike the bare
        // object returned by a single /emails call - confirmed against
        // Resend's docs after this assumption caused a real failure
        // (spreading the response directly threw "Spread syntax requires
        // ...iterable[Symbol.iterator] to be a function" since the raw
        // response is an object, not an array).
        const batchResponse = await this.request<{ data: ResendSendResult[] }>('/emails/batch', batch)
        results.push(...batchResponse.data)
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err)
        results.push(...batch.map(() => ({ error })))
      }
    }
    return results
  }
}
