import type { CollectionConfig } from 'payload'
import type { EmailPublishingPluginOptions } from '../types.js'
import { adminGroup } from './Posts.js'

export const SCHEDULER_ITEM_STATUSES = [
  'draft',
  'scheduled',
  'queued',
  'sending',
  'sent',
  'failed',
  'canceled',
] as const

export const buildSchedulerItemsCollection = (pluginOptions: EmailPublishingPluginOptions): CollectionConfig => ({
  slug: 'scheduler-items',
  admin: {
    group: adminGroup,
    useAsTitle: 'label',
    defaultColumns: ['label', 'status', 'sendAt', 'recipientCount'],
  },
  access: {
    create: pluginOptions.access.canManage,
    read: pluginOptions.access.canManage,
    update: pluginOptions.access.canManage,
    delete: pluginOptions.access.canManage,
  },
  fields: [
    {
      name: 'label',
      type: 'text',
      admin: {
        description: 'Optional human label, e.g. "August Newsletter".',
      },
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'draft',
      options: SCHEDULER_ITEM_STATUSES.map((value) => ({ label: value, value })),
    },
    {
      name: 'sendAt',
      type: 'date',
      admin: {
        date: { pickerAppearance: 'dayAndTime' },
        description: 'When this campaign should send. Stored in UTC, shown in your local time.',
      },
      validate: (value, { data }) => {
        const status = (data as { status?: string })?.status
        if ((status === 'scheduled' || status === 'queued' || status === 'sending') && !value) {
          return 'sendAt is required once a Scheduler Item is scheduled.'
        }
        return true
      },
    },
    {
      name: 'recipientCount',
      type: 'number',
      admin: { readOnly: true, description: 'Filled in automatically once recipients are resolved.' },
    },
    {
      name: 'sentAt',
      type: 'date',
      admin: { readOnly: true, position: 'sidebar' },
    },
    {
      name: 'lastError',
      type: 'textarea',
      admin: {
        readOnly: true,
        condition: (data) => (data as { status?: string })?.status === 'failed',
      },
    },
  ],
})
