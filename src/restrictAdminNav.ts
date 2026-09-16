import type { Config } from 'payload'
import type { EmailPublishingPluginOptions } from './types.js'

// Payload's admin nav hides a collection/global automatically when the
// current user fails its access.read - but several of this app's existing
// collections (Pages, Media, Categories, Artwork, ArtworkImage, ...) are
// intentionally public-read (the live site fetches them unauthenticated),
// so that alone doesn't restrict the nav for Content Managers. This
// explicitly hides everything the plugin doesn't own from anyone who fails
// `canAdminister` (default: `canManage`), so Content Managers only see the
// plugin's own tools while full Admins keep seeing everything, unchanged.
//
// Runs over whatever is already in config.collections/config.globals at
// call time, so this plugin must be registered after any other plugin that
// adds its own collections/globals (e.g. the ecommerce and subscribers
// plugins) for them to be covered too.
export const restrictAdminNavToPlugin = (
  config: Config,
  pluginOptions: EmailPublishingPluginOptions,
  ownedCollectionSlugs: string[],
  ownedGlobalSlugs: string[] = [],
): void => {
  const isPrivileged = (user: unknown): boolean => {
    const canAdminister = pluginOptions.access.canAdminister ?? pluginOptions.access.canManage
    // admin.hidden receives {user} (a client-safe user), not a full
    // PayloadRequest - this app's access functions only touch req.user, so
    // this minimal shim is sufficient at runtime despite the loose cast.
    return Boolean(canAdminister({ req: { user } } as Parameters<typeof canAdminister>[0]))
  }

  // Collections and globals each type `admin.hidden`'s `{user}` arg
  // differently (ClientUser vs. a TypedUser union) - `isPrivileged` reads
  // it defensively regardless, so bridging with `any` here is intentional,
  // not a real type-safety gap.
  const hideFromRestrictedUsers = (existing: boolean | ((args: { user: any }) => boolean) | undefined) => {
    if (existing === true) return true
    const extra = (args: { user: any }) => !isPrivileged(args.user)
    if (typeof existing === 'function') {
      return (args: { user: any }) => existing(args) || extra(args)
    }
    return extra
  }

  for (const collection of config.collections ?? []) {
    if (ownedCollectionSlugs.includes(collection.slug)) continue
    collection.admin = { ...collection.admin, hidden: hideFromRestrictedUsers(collection.admin?.hidden) }
  }

  for (const global of config.globals ?? []) {
    if (ownedGlobalSlugs.includes(global.slug)) continue
    global.admin = { ...global.admin, hidden: hideFromRestrictedUsers(global.admin?.hidden) }
  }
}
