import type { Post } from './copied/payload-types.js'

// Shared between the actual send path (processSchedulerItem.ts) and the
// admin UI preview endpoint (endpoints/renderPreview.ts), so "what you
// preview" and "what gets sent" can never drift apart.
export const renderEmailBody = (posts: Post[], renderPostContentToHtml: (content: unknown) => string): string =>
  posts.map((post) => renderPostContentToHtml(post.content)).join('\n')
