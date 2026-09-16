import type { Endpoint } from 'payload'
import type { Post } from '../copied/payload-types.js'
import type { EmailPublishingPluginOptions } from '../types.js'
import { defaultRenderPostContentToHtml } from '../defaultRenderPostContentToHtml.js'
import { renderEmailBody } from '../renderEmailBody.js'

// Renders the live (possibly unsaved) `posts` selection on the Emails edit
// view into HTML, using the exact same renderer the real send uses (see
// renderEmailBody.ts) so the preview can't drift from what actually sends.
// Takes postIds directly (not an Email id) so it works before the Email has
// ever been saved, and reflects in-progress reordering/add/remove.
export const buildRenderPreviewEndpoint = (pluginOptions: EmailPublishingPluginOptions): Endpoint => ({
  path: '/email-publishing/render-preview',
  method: 'get',
  handler: async (req) => {
    const hasAccess = await pluginOptions.access.canManage({ req } as Parameters<typeof pluginOptions.access.canManage>[0])
    if (!hasAccess) {
      return Response.json({ message: 'Forbidden' }, { status: 403 })
    }

    const postIdsParam = typeof req.query.postIds === 'string' ? req.query.postIds : ''
    const postIds = postIdsParam
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean)

    if (postIds.length === 0) {
      return Response.json({ html: '' })
    }

    const result = await req.payload.find({
      collection: 'posts',
      where: { id: { in: postIds } },
      overrideAccess: true,
      limit: postIds.length,
    })

    // Preserve the requested order (the selection's order, not DB order).
    const byId = new Map(result.docs.map((post) => [String(post.id), post as Post]))
    const orderedPosts = postIds.map((id) => byId.get(id)).filter((post): post is Post => Boolean(post))

    const renderPostContentToHtml = pluginOptions.renderPostContentToHtml ?? defaultRenderPostContentToHtml
    const html = renderEmailBody(orderedPosts, renderPostContentToHtml)

    return Response.json({ html })
  },
})
