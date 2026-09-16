import type { Config } from 'payload'
import type { EmailPublishingPluginOptions } from './types.js'
import { buildPostsCollection } from './collections/Posts.js'
import { buildEmailsCollection } from './collections/Emails.js'
import { buildSchedulerItemsCollection, SCHEDULER_ITEM_STATUSES } from './collections/SchedulerItems.js'
import { buildEmailSendsCollection, EMAIL_SEND_STATUSES } from './collections/EmailSends.js'
import { buildEmailPublishingSettingsGlobal, EMAIL_PUBLISHING_SETTINGS_SLUG } from './globals/EmailPublishingSettings.js'
import { buildSweepTask, SWEEP_TASK_SLUG } from './jobs/sweepDueScheduledCampaigns.js'
import { buildResendWebhookEndpoint } from './endpoints/resendWebhook.js'
import { buildEmailStatsEndpoint } from './endpoints/emailStats.js'
import { buildRenderPreviewEndpoint } from './endpoints/renderPreview.js'
import { buildTriggerSweepEndpoint } from './endpoints/triggerSweep.js'
import { restrictAdminNavToPlugin } from './restrictAdminNav.js'
import { isAuthorizedCronRequest } from './cronAuth.js'

export type { EmailPublishingPluginOptions, Email, EmailSend, Post, SchedulerItem } from './types.js'
export type { ResendSendMessage, ResendSendResult } from './resend.js'
export { ResendClient } from './resend.js'
export { SWEEP_TASK_SLUG }
export { EMAIL_SEND_STATUSES }
export { SCHEDULER_ITEM_STATUSES }

const OWNED_COLLECTION_SLUGS = ['posts', 'emails', 'scheduler-items', 'email-sends']
const OWNED_GLOBAL_SLUGS = [EMAIL_PUBLISHING_SETTINGS_SLUG]

export const emailPublishing =
  (pluginOptions: EmailPublishingPluginOptions) =>
  (config: Config): Config => {
    if (!config.collections) config.collections = []
    if (!config.globals) config.globals = []

    // Collections/globals stay registered even when disabled, so the
    // database schema stays consistent (same precedent as
    // payload-subscribers-plugin).
    config.collections.push(
      buildPostsCollection(pluginOptions),
      buildEmailsCollection(pluginOptions),
      buildSchedulerItemsCollection(pluginOptions),
      buildEmailSendsCollection(pluginOptions),
    )
    config.globals.push(buildEmailPublishingSettingsGlobal(pluginOptions))

    if (pluginOptions.disabled) {
      return config
    }

    // Must run after every other plugin that adds its own
    // collections/globals (register emailPublishing last in config.plugins)
    // so they're covered too.
    restrictAdminNavToPlugin(config, pluginOptions, OWNED_COLLECTION_SLUGS, OWNED_GLOBAL_SLUGS)

    if (!config.endpoints) config.endpoints = []
    config.endpoints.push(
      buildResendWebhookEndpoint(pluginOptions),
      buildEmailStatsEndpoint(pluginOptions),
      buildRenderPreviewEndpoint(pluginOptions),
      buildTriggerSweepEndpoint(),
    )

    const sweepTask = buildSweepTask(pluginOptions)
    config.jobs = {
      ...config.jobs,
      tasks: [...(config.jobs?.tasks ?? []), sweepTask],
      access: {
        ...config.jobs?.access,
        // The endpoint's own default is `() => true` (publicly callable) if
        // left unconfigured - require a bearer token matching CRON_SECRET,
        // Vercel's documented convention for its own Cron requests. Fails
        // closed if CRON_SECRET isn't set. Same check as trigger-sweep.ts.
        run: config.jobs?.access?.run ?? (({ req }) => isAuthorizedCronRequest(req)),
      },
    }

    return config
  }
