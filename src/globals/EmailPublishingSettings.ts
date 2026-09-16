import type { GlobalConfig } from 'payload'
import type { EmailPublishingPluginOptions } from '../types.js'
import { adminGroup } from '../collections/Posts.js'

export const EMAIL_PUBLISHING_SETTINGS_SLUG = 'email-publishing-settings'

// Plugin-wide settings - currently just the default footer Post, but a
// single settings Global gives room to add more (e.g. a default header,
// a from-name override) without a new Global each time.
export const buildEmailPublishingSettingsGlobal = (pluginOptions: EmailPublishingPluginOptions): GlobalConfig => ({
  slug: EMAIL_PUBLISHING_SETTINGS_SLUG,
  label: 'Email Publishing Settings',
  admin: { group: adminGroup },
  access: {
    read: pluginOptions.access.canManage,
    update: pluginOptions.access.canManage,
  },
  fields: [
    {
      name: 'defaultFooterPost',
      type: 'relationship',
      relationTo: 'posts',
      hasMany: false,
      admin: {
        description: 'Automatically added to the end of every new Email’s Posts list. Can be removed or replaced per-Email afterward - this only sets the starting default.',
      },
    },
  ],
})
