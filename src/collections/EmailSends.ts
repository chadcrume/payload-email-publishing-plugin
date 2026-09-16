import type { CollectionConfig } from 'payload'
import type { EmailPublishingPluginOptions } from '../types.js'
import { adminGroup } from './Posts.js'

export const EMAIL_SEND_STATUSES = [
  'queued',
  'scheduled',
  'sent',
  'delivered',
  'opened',
  'clicked',
  'bounced',
  'complained',
  'failed',
  'delivery_delayed',
  'suppressed',
] as const

// One row per (Email, recipient) pair per send. Necessary even though not
// explicitly requested: stats require correlating inbound Resend webhook
// events back to a specific recipient, tolerating webhook redelivery
// idempotently, and aggregating counts without re-querying Resend's API on
// every page view. Written only by the sweep job and the webhook endpoint
// (both via overrideAccess) - never through normal CRUD.
export const buildEmailSendsCollection = (pluginOptions: EmailPublishingPluginOptions): CollectionConfig => {
  const canAdminister = pluginOptions.access.canAdminister ?? pluginOptions.access.canManage

  return {
    slug: 'email-sends',
    admin: {
      group: adminGroup,
      useAsTitle: 'recipientEmail',
      defaultColumns: ['recipientEmail', 'status', 'email', 'lastEventAt'],
    },
    access: {
      read: canAdminister,
      create: () => false,
      update: () => false,
      delete: () => false,
    },
    fields: [
      {
        name: 'email',
        type: 'relationship',
        relationTo: 'emails',
        required: true,
        index: true,
      },
      {
        name: 'schedulerItem',
        type: 'relationship',
        relationTo: 'scheduler-items',
        required: true,
        index: true,
      },
      {
        name: 'recipientEmail',
        type: 'email',
        required: true,
        index: true,
      },
      {
        name: 'recipientName',
        type: 'text',
      },
      {
        name: 'subscriberId',
        type: 'text',
        admin: {
          description: "Opaque ID from the consuming app's own recipient model, if provided. The plugin never interprets this.",
        },
      },
      {
        name: 'resendMessageId',
        type: 'text',
        index: true,
      },
      {
        name: 'status',
        type: 'select',
        required: true,
        defaultValue: 'queued',
        options: EMAIL_SEND_STATUSES.map((value) => ({ label: value, value })),
      },
      {
        name: 'openCount',
        type: 'number',
        defaultValue: 0,
      },
      {
        name: 'clickCount',
        type: 'number',
        defaultValue: 0,
      },
      {
        name: 'lastEventAt',
        type: 'date',
        admin: { readOnly: true },
      },
      {
        name: 'errorMessage',
        type: 'text',
        admin: { readOnly: true },
      },
      {
        // Capped list of already-applied Svix event IDs, for webhook
        // redelivery idempotency on the count fields (see resendWebhook.ts).
        name: 'processedEventIds',
        type: 'json',
        defaultValue: [],
        admin: { hidden: true },
      },
    ],
  }
}
