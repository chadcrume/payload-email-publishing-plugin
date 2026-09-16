import type { CollectionConfig } from 'payload'
import type { EmailPublishingPluginOptions } from '../types.js'

export const adminGroup = 'Email Publishing'

export const buildPostsCollection = (pluginOptions: EmailPublishingPluginOptions): CollectionConfig => {
  const defaultCollection: CollectionConfig = {
    slug: 'posts',
    admin: {
      group: adminGroup,
      useAsTitle: 'title',
      defaultColumns: ['title', 'updatedAt', '_status'],
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
        name: 'title',
        type: 'text',
        required: true,
      },
      {
        name: 'content',
        type: 'richText',
        required: true,
      },
    ],
  }

  return pluginOptions.overridePosts ? pluginOptions.overridePosts(defaultCollection) : defaultCollection
}
