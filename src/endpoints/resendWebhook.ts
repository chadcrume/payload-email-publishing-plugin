import type { Endpoint } from 'payload'
import type { EmailSend } from '../copied/payload-types.js'
import type { EmailPublishingPluginOptions } from '../types.js'
import { verifyResendWebhook } from '../webhookVerify.js'

type ResendWebhookEvent = {
  type: string
  data?: {
    email_id?: string
    id?: string
    // Confirmed against a real Resend webhook delivery: unlike the send
    // API's request shape (an array of {name, value} pairs), the webhook
    // payload flattens tags into a plain object instead.
    tags?: Record<string, string>
  }
}

// Maps Resend's webhook event `type` to an EmailSends status. Applied
// directly as events arrive (last event wins) - full out-of-order
// reconciliation isn't needed for v1's status label.
const EVENT_TYPE_TO_STATUS: Record<string, EmailSend['status']> = {
  'email.sent': 'sent',
  'email.delivered': 'delivered',
  'email.opened': 'opened',
  'email.clicked': 'clicked',
  'email.bounced': 'bounced',
  'email.complained': 'complained',
  'email.failed': 'failed',
  'email.delivery_delayed': 'delivery_delayed',
  'email.suppressed': 'suppressed',
}

export const buildResendWebhookEndpoint = (pluginOptions: EmailPublishingPluginOptions): Endpoint => ({
  path: '/email-publishing/resend-webhook',
  method: 'post',
  handler: async (req) => {
    // Svix signature verification needs the exact raw body, read before any
    // JSON parsing. `.text` is typed optional on PayloadRequest (it extends
    // Partial<Request>), but is always present on a real inbound request.
    if (!req.text) {
      return Response.json({ message: 'invalid request' }, { status: 400 })
    }
    const rawBody = await req.text()

    let event: ResendWebhookEvent
    try {
      const verified = verifyResendWebhook({
        rawBody: rawBody ?? '',
        headers: {
          'svix-id': req.headers.get('svix-id') ?? undefined,
          'svix-timestamp': req.headers.get('svix-timestamp') ?? undefined,
          'svix-signature': req.headers.get('svix-signature') ?? undefined,
        },
        secret: pluginOptions.resend.webhookSecret,
      })
      event = verified as ResendWebhookEvent
    } catch (err) {
      req.payload.logger.warn({ err, msg: 'Resend webhook signature verification failed' })
      return Response.json({ message: 'invalid signature' }, { status: 400 })
    }

    const status = EVENT_TYPE_TO_STATUS[event.type]
    if (!status) {
      // Unrecognized/irrelevant event type - acknowledge so Resend doesn't retry.
      return Response.json({ message: 'ignored' }, { status: 200 })
    }

    const tagSendId = event.data?.tags?.email_send_id
    const resendMessageId = event.data?.email_id ?? event.data?.id

    let row: EmailSend | undefined
    if (tagSendId) {
      row = await req.payload
        .findByID({ collection: 'email-sends', id: tagSendId, overrideAccess: true })
        .catch(() => undefined)
    }
    if (!row && resendMessageId) {
      const found = await req.payload.find({
        collection: 'email-sends',
        where: { resendMessageId: { equals: resendMessageId } },
        limit: 1,
        overrideAccess: true,
      })
      row = found.docs[0]
    }

    if (!row) {
      req.payload.logger.warn({ msg: 'Resend webhook event could not be correlated to an EmailSends row', event })
      return Response.json({ message: 'unmatched' }, { status: 200 })
    }

    const svixId = req.headers.get('svix-id') ?? ''
    const processedEventIds: string[] = Array.isArray(row.processedEventIds) ? (row.processedEventIds as string[]) : []
    const alreadyProcessed = processedEventIds.includes(svixId)

    const isCountingEvent = event.type === 'email.opened' || event.type === 'email.clicked'
    const data: Record<string, unknown> = { status, lastEventAt: new Date().toISOString() }

    if (isCountingEvent && !alreadyProcessed) {
      if (event.type === 'email.opened') data.openCount = (row.openCount ?? 0) + 1
      if (event.type === 'email.clicked') data.clickCount = (row.clickCount ?? 0) + 1
      data.processedEventIds = [...processedEventIds, svixId].slice(-50)
    }

    await req.payload.update({
      collection: 'email-sends',
      id: row.id,
      data,
      overrideAccess: true,
    })

    // Flip the Scheduler Item to 'sent' the first time any of its
    // EmailSends rows reaches a terminal outbound state - full per-recipient
    // aggregation isn't needed for v1's status label.
    if (status === 'sent' || status === 'delivered') {
      // row.schedulerItem comes back populated (an object, not a plain ID
      // string) at findByID's default depth - String(populatedObject) would
      // produce the literal string "[object Object]", not the real ID.
      const schedulerItemId =
        row.schedulerItem && typeof row.schedulerItem === 'object' ? String(row.schedulerItem.id) : String(row.schedulerItem)
      try {
        await req.payload.update({
          collection: 'scheduler-items',
          id: schedulerItemId,
          data: { status: 'sent', sentAt: new Date().toISOString() },
          overrideAccess: true,
        })
      } catch (err) {
        // The important part (the EmailSends row) already updated
        // successfully above - this is a secondary status label. A failure
        // here (e.g. the Scheduler Item was since deleted) must not turn
        // into an uncaught error that Payload reports as a 404/500,
        // causing Resend to treat an otherwise-successful delivery as
        // failed and retry it.
        req.payload.logger.warn({ err, msg: 'Failed to flip Scheduler Item status from webhook event', schedulerItemId })
      }
    }

    return Response.json({ message: 'ok' }, { status: 200 })
  },
})
