import { convertLexicalToHTML, defaultHTMLConverters } from '@payloadcms/richtext-lexical/html'

// Minimal built-in fallback for rendering a Post's richText `content` field
// to an HTML string for the email body. Uses Payload's own official,
// non-React Lexical-to-HTML converter with its default node converters
// (headings, paragraphs, lists, links, text formatting, uploads/images) -
// deliberately self-contained (no dependency on the consuming app's own
// richText rendering) so the plugin keeps working out of the box. Pass
// renderPostContentToHtml in the plugin options to reuse the app's real
// converters instead (e.g. for custom embed types like this app's
// RelationshipEmbed, which the default converters don't know how to
// render - see converters/index.tsx) for visual parity with how the same
// content renders elsewhere on the site.
export const defaultRenderPostContentToHtml = (content: unknown): string => {
  if (!content || typeof content !== 'object' || !('root' in content)) return ''
  return convertLexicalToHTML({
    data: content as Parameters<typeof convertLexicalToHTML>[0]['data'],
    converters: defaultHTMLConverters,
    disableContainer: true,
  })
}
