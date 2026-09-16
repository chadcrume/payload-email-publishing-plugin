import type { Payload, PayloadRequest } from 'payload'

import config from '@payload-config'
import { getPayload } from 'payload'
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'vitest'

import type { EmailPublishingPluginOptions } from '../src/types.js'
import { buildEmailStatsEndpoint } from '../src/endpoints/emailStats.js'
import { buildRenderPreviewEndpoint } from '../src/endpoints/renderPreview.js'
import { buildResendWebhookEndpoint } from '../src/endpoints/resendWebhook.js'
import { buildTriggerSweepEndpoint } from '../src/endpoints/triggerSweep.js'
import { processSchedulerItem } from '../src/jobs/processSchedulerItem.js'
import { buildSweepTask } from '../src/jobs/sweepDueScheduledCampaigns.js'
import { installMockResendFetch } from './helpers/mockResendFetch.js'
import { signResendWebhook } from './helpers/signResendWebhook.js'

let payload: Payload
let restoreFetch: () => void

const WEBHOOK_SECRET = 'whsec_test'

const basePluginOptions: EmailPublishingPluginOptions = {
  resolveRecipients: async () => [{ email: 'recipient@example.com', name: 'Test Recipient' }],
  access: {
    canManage: () => true,
    canAdminister: () => true,
  },
  resend: {
    apiKey: 're_test',
    webhookSecret: WEBHOOK_SECRET,
    fromAddress: 'dev@example.com',
    fromName: 'Dev',
  },
}

const fakeReq = (overrides: Partial<PayloadRequest> & Record<string, unknown> = {}): PayloadRequest =>
  ({
    payload,
    query: {},
    headers: new Headers(),
    ...overrides,
  }) as unknown as PayloadRequest

afterAll(async () => {
  await payload.destroy()
})

beforeAll(async () => {
  payload = await getPayload({ config })
})

afterEach(() => {
  restoreFetch?.()
})

describe('Plugin registration', () => {
  test('registers posts, emails, scheduler-items, email-sends collections', () => {
    expect(payload.collections['posts']).toBeDefined()
    expect(payload.collections['emails']).toBeDefined()
    expect(payload.collections['scheduler-items']).toBeDefined()
    expect(payload.collections['email-sends']).toBeDefined()
  })

  test('registers the email-publishing-settings global', async () => {
    await expect(payload.findGlobal({ slug: 'email-publishing-settings' })).resolves.toBeDefined()
  })
})

describe('Posts + Emails collections', () => {
  test('Posts CRUD works via Local API', async () => {
    const post = await payload.create({
      collection: 'posts',
      data: { title: 'A post', content: emptyRichText() },
    })
    expect(post.title).toBe('A post')

    const updated = await payload.update({ collection: 'posts', id: post.id, data: { title: 'Updated' } })
    expect(updated.title).toBe('Updated')

    await payload.delete({ collection: 'posts', id: post.id })
    await expect(payload.findByID({ collection: 'posts', id: post.id })).rejects.toBeTruthy()
  })

  test("Emails.posts field defaults to the settings global's defaultFooterPost", async () => {
    const footerPost = await payload.create({
      collection: 'posts',
      data: { title: 'Footer', content: emptyRichText() },
    })
    await payload.updateGlobal({ slug: 'email-publishing-settings', data: { defaultFooterPost: footerPost.id } })

    const email = await payload.create({
      collection: 'emails',
      data: { subject: 'No explicit posts' } as any,
    })
    const postIds = (email.posts as Array<string | number | { id: string | number }>).map((entry) =>
      typeof entry === 'object' ? String(entry.id) : String(entry),
    )
    expect(postIds).toEqual([String(footerPost.id)])

    await payload.updateGlobal({ slug: 'email-publishing-settings', data: { defaultFooterPost: null } })
  })
})

describe('render-preview endpoint', () => {
  test('renders HTML for the given postIds, preserving requested order', async () => {
    const postA = await payload.create({ collection: 'posts', data: { title: 'A', content: textRichText('First') } })
    const postB = await payload.create({ collection: 'posts', data: { title: 'B', content: textRichText('Second') } })

    const endpoint = buildRenderPreviewEndpoint(basePluginOptions)
    const req = fakeReq({ query: { postIds: `${postB.id},${postA.id}` } })
    const res = await endpoint.handler(req)
    const data = (await res.json()) as { html: string }

    expect(data.html.indexOf('Second')).toBeLessThan(data.html.indexOf('First'))
  })

  test('returns 403 when canManage denies access', async () => {
    const endpoint = buildRenderPreviewEndpoint({ ...basePluginOptions, access: { canManage: () => false } })
    const req = fakeReq({ query: { postIds: '' } })
    const res = await endpoint.handler(req)
    expect(res.status).toBe(403)
  })
})

describe('email-stats endpoint', () => {
  test('aggregates email-sends by status for a given email', async () => {
    const post = await payload.create({ collection: 'posts', data: { title: 'P', content: emptyRichText() } })
    const schedulerItem = await payload.create({ collection: 'scheduler-items', data: { label: 'S', status: 'draft' } })
    const email = await payload.create({
      collection: 'emails',
      data: { subject: 'Stats email', posts: [post.id], schedulerItem: schedulerItem.id },
    })

    await payload.create({
      collection: 'email-sends',
      data: { email: email.id, schedulerItem: schedulerItem.id, recipientEmail: 'a@example.com', status: 'delivered' },
    })
    await payload.create({
      collection: 'email-sends',
      data: { email: email.id, schedulerItem: schedulerItem.id, recipientEmail: 'b@example.com', status: 'failed' },
    })

    const endpoint = buildEmailStatsEndpoint(basePluginOptions)
    const req = fakeReq({ routeParams: { emailId: String(email.id) } } as any)
    const res = await endpoint.handler(req)
    const data = (await res.json()) as { recipients: number; byStatus: Record<string, number> }

    expect(data.recipients).toBe(2)
    expect(data.byStatus.delivered).toBe(1)
    expect(data.byStatus.failed).toBe(1)
  })
})

describe('resend-webhook endpoint', () => {
  const buildWebhookReq = (body: string, headers: Record<string, string>) =>
    fakeReq({
      text: async () => body,
      headers: new Headers(headers),
    } as any)

  test('rejects an invalid signature', async () => {
    const endpoint = buildResendWebhookEndpoint(basePluginOptions)
    const body = JSON.stringify({ type: 'email.sent', data: {} })
    const req = buildWebhookReq(body, {
      'svix-id': 'msg_bad',
      'svix-timestamp': String(Math.floor(Date.now() / 1000)),
      'svix-signature': 'v1,not-a-real-signature',
    })
    const res = await endpoint.handler(req)
    expect(res.status).toBe(400)
  })

  test('accepts a validly-signed event and updates the matching email-sends row', async () => {
    const post = await payload.create({ collection: 'posts', data: { title: 'P2', content: emptyRichText() } })
    const schedulerItem = await payload.create({
      collection: 'scheduler-items',
      data: { label: 'S2', status: 'sending', sendAt: new Date().toISOString() },
    })
    const email = await payload.create({
      collection: 'emails',
      data: { subject: 'Webhook email', posts: [post.id], schedulerItem: schedulerItem.id },
    })
    const sendRow = await payload.create({
      collection: 'email-sends',
      data: {
        email: email.id,
        schedulerItem: schedulerItem.id,
        recipientEmail: 'c@example.com',
        status: 'scheduled',
        resendMessageId: 'resend-msg-1',
      },
    })

    const body = JSON.stringify({ type: 'email.opened', data: { id: 'resend-msg-1', tags: { email_send_id: String(sendRow.id) } } })
    const headers = signResendWebhook({ secret: WEBHOOK_SECRET, body })

    const endpoint = buildResendWebhookEndpoint(basePluginOptions)
    const res = await endpoint.handler(buildWebhookReq(body, headers))
    expect(res.status).toBe(200)

    const updated = await payload.findByID({ collection: 'email-sends', id: sendRow.id })
    expect(updated.status).toBe('opened')
    expect(updated.openCount).toBe(1)

    // Redelivery of the same svix-id must not double-increment.
    const res2 = await endpoint.handler(buildWebhookReq(body, headers))
    expect(res2.status).toBe(200)
    const updatedAgain = await payload.findByID({ collection: 'email-sends', id: sendRow.id })
    expect(updatedAgain.openCount).toBe(1)
  })

  test('flips scheduler-item to sent on a sent/delivered event', async () => {
    const post = await payload.create({ collection: 'posts', data: { title: 'P3', content: emptyRichText() } })
    const schedulerItem = await payload.create({
      collection: 'scheduler-items',
      data: { label: 'S3', status: 'sending', sendAt: new Date().toISOString() },
    })
    const email = await payload.create({
      collection: 'emails',
      data: { subject: 'Sent email', posts: [post.id], schedulerItem: schedulerItem.id },
    })
    const sendRow = await payload.create({
      collection: 'email-sends',
      data: {
        email: email.id,
        schedulerItem: schedulerItem.id,
        recipientEmail: 'd@example.com',
        status: 'scheduled',
        resendMessageId: 'resend-msg-2',
      },
    })

    const body = JSON.stringify({ type: 'email.delivered', data: { id: 'resend-msg-2' } })
    const headers = signResendWebhook({ secret: WEBHOOK_SECRET, body })
    const endpoint = buildResendWebhookEndpoint(basePluginOptions)
    await endpoint.handler(buildWebhookReq(body, headers))

    const updatedSchedulerItem = await payload.findByID({ collection: 'scheduler-items', id: schedulerItem.id })
    expect(updatedSchedulerItem.status).toBe('sent')
  })

  test('returns 200 "unmatched" when the event correlates to no email-sends row', async () => {
    const body = JSON.stringify({ type: 'email.sent', data: { id: 'no-such-message' } })
    const headers = signResendWebhook({ secret: WEBHOOK_SECRET, body })
    const endpoint = buildResendWebhookEndpoint(basePluginOptions)
    const res = await endpoint.handler(buildWebhookReq(body, headers))
    expect(res.status).toBe(200)
    expect((await res.json()).message).toBe('unmatched')
  })
})

describe('trigger-sweep endpoint', () => {
  const originalCronSecret = process.env.CRON_SECRET

  afterEach(() => {
    process.env.CRON_SECRET = originalCronSecret
  })

  test('requires a valid CRON_SECRET bearer token', async () => {
    process.env.CRON_SECRET = 'sweep-secret'
    const endpoint = buildTriggerSweepEndpoint()
    const req = fakeReq({ headers: new Headers() })
    const res = await endpoint.handler(req)
    expect(res.status).toBe(401)
  })

  test('runs the sweep when authorized', async () => {
    process.env.CRON_SECRET = 'sweep-secret'
    const endpoint = buildTriggerSweepEndpoint()
    const req = fakeReq({ headers: new Headers({ authorization: 'Bearer sweep-secret' }) })
    const res = await endpoint.handler(req)
    expect(res.status).toBe(200)
    const data = (await res.json()) as { queuedJobId: unknown }
    expect(data.queuedJobId).toBeDefined()
  })
})

describe('processSchedulerItem', () => {
  beforeAll(() => {
    restoreFetch = installMockResendFetch()
  })

  test('happy path: creates email-sends rows and marks the scheduler-item sending', async () => {
    const post = await payload.create({ collection: 'posts', data: { title: 'Send me', content: emptyRichText() } })
    const schedulerItem = await payload.create({
      collection: 'scheduler-items',
      data: { label: 'To send', status: 'scheduled', sendAt: new Date().toISOString() },
    })
    await payload.create({
      collection: 'emails',
      data: { subject: 'Send this', posts: [post.id], schedulerItem: schedulerItem.id },
    })

    await processSchedulerItem({ req: fakeReq(), schedulerItem: schedulerItem as any, pluginOptions: basePluginOptions })

    const updated = await payload.findByID({ collection: 'scheduler-items', id: schedulerItem.id })
    expect(updated.status).toBe('sending')
    expect(updated.recipientCount).toBe(1)

    const sends = await payload.find({ collection: 'email-sends', where: { schedulerItem: { equals: schedulerItem.id } } })
    expect(sends.docs).toHaveLength(1)
    expect(sends.docs[0].status).toBe('scheduled')
  })

  test('marks the scheduler-item failed when resolveRecipients returns zero recipients', async () => {
    const post = await payload.create({ collection: 'posts', data: { title: 'No recipients', content: emptyRichText() } })
    const schedulerItem = await payload.create({
      collection: 'scheduler-items',
      data: { label: 'Empty', status: 'scheduled', sendAt: new Date().toISOString() },
    })
    await payload.create({
      collection: 'emails',
      data: { subject: 'Nobody gets this', posts: [post.id], schedulerItem: schedulerItem.id },
    })

    await processSchedulerItem({
      req: fakeReq(),
      schedulerItem: schedulerItem as any,
      pluginOptions: { ...basePluginOptions, resolveRecipients: async () => [] },
    })

    const updated = await payload.findByID({ collection: 'scheduler-items', id: schedulerItem.id })
    expect(updated.status).toBe('failed')
    expect(updated.lastError).toContain('zero recipients')
  })
})

describe('sweepDueScheduledCampaigns', () => {
  beforeAll(() => {
    restoreFetch = installMockResendFetch()
  })

  test('processes due items and skips ones not yet due', async () => {
    const post = await payload.create({ collection: 'posts', data: { title: 'Sweep me', content: emptyRichText() } })

    const dueItem = await payload.create({
      collection: 'scheduler-items',
      data: { label: 'Due', status: 'scheduled', sendAt: new Date(Date.now() - 60_000).toISOString() },
    })
    await payload.create({
      collection: 'emails',
      data: { subject: 'Due email', posts: [post.id], schedulerItem: dueItem.id },
    })

    const notDueItem = await payload.create({
      collection: 'scheduler-items',
      data: { label: 'Not due', status: 'scheduled', sendAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString() },
    })
    await payload.create({
      collection: 'emails',
      data: { subject: 'Future email', posts: [post.id], schedulerItem: notDueItem.id },
    })

    const task = buildSweepTask(basePluginOptions)
    await task.handler!({ req: fakeReq() } as any)

    const updatedDue = await payload.findByID({ collection: 'scheduler-items', id: dueItem.id })
    const updatedNotDue = await payload.findByID({ collection: 'scheduler-items', id: notDueItem.id })
    expect(updatedDue.status).not.toBe('scheduled')
    expect(updatedNotDue.status).toBe('scheduled')
  })
})

function emptyRichText() {
  return textRichText('placeholder content')
}

function textRichText(text: string) {
  return {
    root: {
      type: 'root',
      children: [{ type: 'paragraph', children: [{ type: 'text', text, version: 1 }], version: 1 }],
      direction: 'ltr',
      format: '',
      indent: 0,
      version: 1,
    },
  }
}
