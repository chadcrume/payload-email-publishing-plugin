import type { CollectionConfig, DefaultValue, PayloadRequest } from 'payload'
import type { EmailPublishingPluginOptions } from '../types.js'
import { adminGroup } from './Posts.js'
import { EMAIL_PUBLISHING_SETTINGS_SLUG } from '../globals/EmailPublishingSettings.js'

type EmailPublishingSettingsShape = { defaultFooterPost?: string | { id: string } | null }

// Payload awaits defaultValue functions internally even though its own type
// signature doesn't spell out Promise<...> - confirmed by reading
// getDefaultValue.js directly. Pre-populates new Emails with the configured
// footer Post (Email Publishing Settings global); freely editable/
// removable/reorderable afterward like any other Post in the list, since
// this only sets the initial form value, not an enforced constraint.
const defaultPostsValue = (async ({ req }: { req: PayloadRequest }) => {
  const settings = (await req.payload
    .findGlobal({ slug: EMAIL_PUBLISHING_SETTINGS_SLUG, overrideAccess: true })
    .catch(() => null)) as EmailPublishingSettingsShape | null
  const footerPost = settings?.defaultFooterPost
  if (!footerPost) return []
  return [typeof footerPost === 'object' ? footerPost.id : footerPost]
}) as unknown as DefaultValue

export const buildEmailsCollection = (pluginOptions: EmailPublishingPluginOptions): CollectionConfig => {
  const defaultCollection: CollectionConfig = {
    slug: 'emails',
    admin: {
      group: adminGroup,
      useAsTitle: 'subject',
      defaultColumns: ['subject', 'schedulerItem', '_status', 'updatedAt'],
    },
    versions: { drafts: true },
    access: {
      create: pluginOptions.access.canManage,
      read: pluginOptions.access.canManage,
      update: pluginOptions.access.canManage,
      delete: pluginOptions.access.canManage,
    },
    fields: [
      {
        name: 'subject',
        type: 'text',
        required: true,
      },
      {
        // hasMany relationship fields are natively drag-reorderable in the
        // admin UI - this array's order is the email body's render order.
        name: 'posts',
        type: 'relationship',
        relationTo: 'posts',
        hasMany: true,
        required: true,
        minRows: 1,
        defaultValue: defaultPostsValue,
      },
      {
        name: 'emailPreview',
        type: 'ui',
        label: 'Preview',
        admin: {
          components: {
            Field: '@chadcrume/payload-email-publishing/client#EmailPreviewField',
          },
        },
      },
      {
        name: 'schedulerItem',
        type: 'relationship',
        relationTo: 'scheduler-items',
        hasMany: false,
        admin: {
          position: 'sidebar',
          description: 'Link a Scheduler Item to control when this Email sends.',
        },
      },
      {
        name: 'schedulerItemSettings',
        type: 'ui',
        label: 'Scheduler Item Settings',
        admin: {
          position: 'sidebar',
          components: {
            Field: '@chadcrume/payload-email-publishing/client#SchedulerItemSettingsField',
          },
        },
      },
      {
        name: 'emailStats',
        type: 'ui',
        label: 'Stats',
        admin: {
          position: 'sidebar',
          components: {
            Field: '@chadcrume/payload-email-publishing/client#EmailStatsField',
          },
        },
      },
    ],
  }

  return pluginOptions.overrideEmails ? pluginOptions.overrideEmails(defaultCollection) : defaultCollection
}
