import type { Access, CollectionConfig, PayloadRequest } from 'payload'
import type { Email, EmailSend, Post, SchedulerItem } from './copied/payload-types.js'

export type ResolvedRecipient = {
  email: string
  name?: string
  /**
   * Opaque identifier for whoever the consuming app considers this
   * recipient to be (e.g. a Subscriber doc ID). The plugin never
   * interprets this - it's stored on the EmailSends row for the consuming
   * app's own reference/reporting.
   */
  subscriberId?: string
}

export type EmailPublishingPluginOptions = {
  disabled?: boolean

  /**
   * Resolves the "To" list for an Email at send hand-off time. Required -
   * the plugin has no opinion on how recipients are modeled by the
   * consuming app (subscriber lists, opt-in channels, tags, etc.).
   */
  resolveRecipients: (args: {
    email: Email
    schedulerItem: SchedulerItem
    req: PayloadRequest
  }) => Promise<ResolvedRecipient[]>

  /**
   * Renders a Post's richText `content` field to an HTML string for the
   * email body. Optional - defaults to a minimal built-in serializer
   * (paragraphs, headings, bold/italic/underline, links, lists). Pass this
   * to reuse the consuming app's own richText-to-HTML rendering instead,
   * for visual parity with how the same content renders elsewhere on the
   * site.
   */
  renderPostContentToHtml?: (content: unknown) => string

  /** Collection-override functions, same convention as this repo's ecommerce plugin wrapper. */
  overrideEmails?: (defaultCollection: CollectionConfig) => CollectionConfig
  overridePosts?: (defaultCollection: CollectionConfig) => CollectionConfig

  /** Access control is injected, not hardcoded, so the plugin stays decoupled from any one app's role model. */
  access: {
    /** Posts / Emails / Scheduler Items CRUD. */
    canManage: Access
    /** EmailSends read (the raw send/stats log). Defaults to canManage if omitted. */
    canAdminister?: Access
  }

  resend: {
    apiKey: string
    /** Signing secret from the Resend webhook dashboard, for verifying inbound events. */
    webhookSecret: string
    fromAddress: string
    fromName: string
  }

  /**
   * Tuning knobs for the recurring sweep task, both optional. Defaults
   * assume Vercel's Hobby-plan cron limit (at most once per day) - if
   * deployed on Pro with a finer-grained vercel.json cron, both can be
   * tightened (e.g. hourly cron + a ~90 minute handoffWindowMinutes) for
   * more timely hand-off to Resend without changing anything else.
   */
  sweep?: {
    /** Cron expression for how often the sweep runs. Defaults to daily at 09:00 UTC ('0 9 * * *'), matching vercel.json. */
    cron?: string
    /**
     * How far ahead of `sendAt` (in minutes) a Scheduler Item is handed off
     * to Resend (which then owns exact delivery timing via scheduled_at).
     * Must comfortably exceed the gap between cron runs, or items due
     * shortly after one run won't be handed off until the next. Defaults
     * to 1500 (25 hours), safely spanning the ~24h gap between daily runs.
     */
    handoffWindowMinutes?: number
  }
}

export type { Email, EmailSend, Post, SchedulerItem }
