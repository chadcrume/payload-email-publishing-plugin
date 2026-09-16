import type { PayloadRequest } from 'payload'
import type { Email, Post, SchedulerItem } from '../copied/payload-types.js'
import type { EmailPublishingPluginOptions } from '../types.js'
import { ResendClient, type ResendSendMessage } from '../resend.js'
import { defaultRenderPostContentToHtml } from '../defaultRenderPostContentToHtml.js'
import { renderEmailBody } from '../renderEmailBody.js'

// Extracted as a plain async function (not a TaskHandler closure) so it's
// callable both from the recurring sweep task and, later, from a manual
// "send test" admin action without needing a second task registered now.
export const processSchedulerItem = async (args: {
  req: PayloadRequest
  schedulerItem: SchedulerItem
  pluginOptions: EmailPublishingPluginOptions
}): Promise<void> => {
  const { req, schedulerItem, pluginOptions } = args
  const payload = req.payload
  const resend = new ResendClient(pluginOptions.resend.apiKey)
  const renderPostContentToHtml = pluginOptions.renderPostContentToHtml ?? defaultRenderPostContentToHtml

  try {
    // Claim the item first so a crashed/timed-out run isn't re-picked-up by
    // the next sweep tick mid-flight. Inside the try/catch (unlike a
    // previous version of this code) - a transient failure here (e.g. this
    // environment's local standalone Mongo occasionally rejecting even a
    // single-document update, see payload.config.ts's onInit backfill for
    // the same issue) must not crash the whole sweep task and take out
    // every other due Scheduler Item in the same run along with it.
    await payload.update({
      collection: 'scheduler-items',
      id: schedulerItem.id,
      data: { status: 'queued' },
      overrideAccess: true,
    })

    const emailsResult = await payload.find({
      collection: 'emails',
      where: { schedulerItem: { equals: schedulerItem.id } },
      // depth: 2 isn't enough to render embedded relationship content fully -
      // Email(0) -> Post(1) -> a relationship embedded in the Post's richText,
      // e.g. Artwork(2) -> that Artwork's *own* artworkImages field(3). At
      // depth 2, the Artwork itself populates but its images stay raw IDs,
      // so an Artwork embed's thumbnail silently never renders (confirmed:
      // a real sent email had the link but no image).
      depth: 3,
      limit: 1,
      overrideAccess: true,
    })
    const email = emailsResult.docs[0] as Email | undefined
    if (!email) {
      throw new Error(`No Email references Scheduler Item ${schedulerItem.id}`)
    }

    const recipients = await pluginOptions.resolveRecipients({ email, schedulerItem, req })
    if (recipients.length === 0) {
      throw new Error('resolveRecipients returned zero recipients')
    }

    const posts = (email.posts ?? []).filter((post): post is Post => typeof post === 'object' && post !== null)
    const bodyHtml = renderEmailBody(posts, renderPostContentToHtml)

    const sendAtIso = schedulerItem.sendAt ? new Date(schedulerItem.sendAt).toISOString() : undefined

    // Create an EmailSends stub row per recipient first, so each one has an
    // ID to stamp onto its outbound Resend message as a correlation tag.
    const sendRows = await Promise.all(
      recipients.map((recipient) =>
        payload.create({
          collection: 'email-sends',
          data: {
            email: email.id,
            schedulerItem: schedulerItem.id,
            recipientEmail: recipient.email,
            recipientName: recipient.name,
            subscriberId: recipient.subscriberId,
            status: 'queued',
          },
          overrideAccess: true,
        }),
      ),
    )

    const messages: ResendSendMessage[] = sendRows.map((row) => ({
      from: `${pluginOptions.resend.fromName} <${pluginOptions.resend.fromAddress}>`,
      to: row.recipientEmail,
      subject: email.subject,
      html: bodyHtml,
      tags: [{ name: 'email_send_id', value: String(row.id) }],
      ...(sendAtIso ? { scheduled_at: sendAtIso } : {}),
    }))

    const results = await resend.sendBatch(messages)

    await Promise.all(
      sendRows.map((row, i) => {
        const result = results[i]
        const failed = !result || 'error' in result || !result.id
        return payload.update({
          collection: 'email-sends',
          id: row.id,
          data: failed
            ? { status: 'failed', errorMessage: result && 'error' in result ? result.error : 'Resend did not return a message id' }
            : { status: 'scheduled', resendMessageId: result.id },
          overrideAccess: true,
        })
      }),
    )

    const anyFailed = results.some((result) => !result || 'error' in result || !('id' in result && result.id))
    await payload.update({
      collection: 'scheduler-items',
      id: schedulerItem.id,
      data: {
        status: anyFailed ? 'failed' : 'sending',
        recipientCount: recipients.length,
        ...(anyFailed ? { lastError: 'One or more recipients failed to queue with Resend - see email-sends for details.' } : {}),
      },
      overrideAccess: true,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    payload.logger.error({ err, msg: 'processSchedulerItem failed', schedulerItemId: schedulerItem.id })
    // This whole block must never itself throw - a transient failure while
    // trying to *record* the failure (same class of issue as the update()
    // this catch is usually reporting on) must not escape and crash the
    // sweep task, taking every other due Scheduler Item in the same run
    // down with it.
    try {
      await payload.update({
        collection: 'scheduler-items',
        id: schedulerItem.id,
        data: { status: 'failed', lastError: message },
        overrideAccess: true,
      })
      // Any EmailSends stub rows already created for this attempt shouldn't
      // sit at 'queued' forever if we failed before reaching Resend. Updated
      // per-document rather than one bulk `where`-based update, since
      // Payload's mongoose adapter wraps multi-document updates in a
      // transaction, which not every deployment target's Mongo supports
      // (e.g. a standalone instance without a replica set).
      const stuckRows = await payload.find({
        collection: 'email-sends',
        where: { schedulerItem: { equals: schedulerItem.id }, status: { equals: 'queued' } },
        limit: 0,
        overrideAccess: true,
      })
      for (const row of stuckRows.docs) {
        await payload.update({
          collection: 'email-sends',
          id: row.id,
          data: { status: 'failed', errorMessage: message },
          overrideAccess: true,
        })
      }
    } catch (cleanupErr) {
      payload.logger.error({ err: cleanupErr, msg: 'processSchedulerItem failure cleanup also failed', schedulerItemId: schedulerItem.id })
    }
  }
}
