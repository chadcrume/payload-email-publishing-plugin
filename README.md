# Payload Email Publishing Plugin

A [Payload CMS](https://payloadcms.com) 3.0 plugin for authoring, scheduling, and sending newsletter-style emails via [Resend](https://resend.com), with delivery/open/click tracking.

## 🟢 Installation

```bash
pnpm add @chadcrume/payload-email-publishing
```

## 🟢 Usage

```ts
import { emailPublishing } from '@chadcrume/payload-email-publishing'

export default buildConfig({
  plugins: [
    // Register last so restrictAdminNavToPlugin can see every other
    // plugin's collections/globals too.
    emailPublishing({
      resolveRecipients: async ({ email, schedulerItem, req }) => {
        // Look up your own subscriber/recipient model here. The plugin has
        // no opinion on how recipients are stored.
        return [{ email: 'someone@example.com', name: 'Someone' }]
      },
      access: {
        canManage: ({ req }) => Boolean(req.user), // Posts / Emails / Scheduler Items CRUD
        canAdminister: ({ req }) => req.user?.role === 'admin', // optional, defaults to canManage
      },
      resend: {
        apiKey: process.env.RESEND_API_KEY!,
        webhookSecret: process.env.RESEND_WEBHOOKS_SIGNING_SECRET!,
        fromAddress: 'newsletter@yourdomain.com',
        fromName: 'Your Name',
      },
      // Optional: reuse your own richText renderer for visual parity with
      // the rest of your site instead of the plugin's minimal fallback.
      // renderPostContentToHtml: (content) => yourRenderer(content),
    }),
  ],
})
```

### Environment variables

| Variable | Purpose |
| --- | --- |
| `RESEND_API_KEY` | Resend API key used to send/schedule messages. |
| `RESEND_WEBHOOKS_SIGNING_SECRET` | Signing secret from the Resend webhook dashboard, used to verify inbound delivery/open/click events. |
| `CRON_SECRET` | Bearer token required on `GET /api/payload-jobs/run` and the manual `trigger-sweep` endpoint, matching Vercel Cron's documented convention. |

### Vercel Cron

```json
{
  "crons": [{ "path": "/api/payload-jobs/run", "schedule": "0 9 * * *" }]
}
```

## 🔵 Features

### Plugin options

| Option | Required | Description |
| --- | --- | --- |
| `resolveRecipients` | Yes | Resolves the "To" list for an Email at send hand-off time. |
| `access.canManage` | Yes | Access control for Posts / Emails / Scheduler Items CRUD. |
| `access.canAdminister` | No | Access control for the raw Email Sends log. Defaults to `canManage`. |
| `resend.apiKey` / `webhookSecret` / `fromAddress` / `fromName` | Yes | Resend send + webhook verification config. |
| `renderPostContentToHtml` | No | Renders a Post's richText content to HTML. Defaults to a minimal built-in serializer. |
| `overridePosts` / `overrideEmails` | No | Wrap the default collection config before it's registered. |
| `sweep.cron` / `sweep.handoffWindowMinutes` | No | Tuning knobs for the recurring hand-off task. Defaults assume a once-daily cron. |
| `disabled` | No | Keeps collections/globals registered (for schema stability) without adding endpoints/jobs/nav restrictions. |

### Collections

- **Posts** — richText source content, reused across one or more Emails.
- **Emails** — a subject plus an ordered list of Posts, optionally linked to a Scheduler Item.
- **Scheduler Items** — when and to whom an Email sends (status, `sendAt`, recipient count).
- **Email Sends** — one row per (Email, recipient) per send; the source of truth for delivery/open/click stats. Read-only via the admin UI; written only by the sweep job and the webhook endpoint.

### Fields (`./client` export)

- `EmailPreviewField` — live HTML preview of the selected Posts, debounced against the in-progress `posts` selection.
- `SchedulerItemSettingsField` — read-only summary of the linked Scheduler Item's status/send time/recipient count.
- `EmailStatsField` — delivery/open/click stats table, shown once an Email has been saved.

These are wired into the `Emails` collection automatically; the `./client` export exists for apps that need to reference them directly (e.g. inside `overrideEmails`).

### Endpoints

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/email-publishing/render-preview?postIds=...` | `access.canManage` | Renders the given Posts to HTML for the live preview field. |
| `GET` | `/api/email-publishing/email-stats/:emailId` | `access.canManage` | Aggregated Email Sends counts by status. |
| `POST` | `/api/email-publishing/resend-webhook` | Svix signature (`resend.webhookSecret`) | Receives Resend delivery/open/click events. |
| `GET` | `/api/email-publishing/trigger-sweep` | `CRON_SECRET` bearer token | Manually runs the sweep immediately (for use against a deployed environment). |

### Jobs

`sweepDueScheduledCampaigns` (exported as `SWEEP_TASK_SLUG`) is a recurring [Payload Job Task](https://payloadcms.com/docs/jobs-queue/overview) that hands off due Scheduler Items to Resend. Queue it manually for local testing:

```ts
await payload.jobs.queue({ task: SWEEP_TASK_SLUG, input: {} })
await payload.jobs.run()
```

## 🔴 Contributing

```bash
pnpm install
cp dev/.env.example dev/.env   # then fill in a real DATABASE_URL/PAYLOAD_SECRET
pnpm dev                       # http://localhost:3000/admin
pnpm test                      # pnpm test:int && pnpm test:e2e
```

`dev/` is a minimal Payload + Next.js app registering only this plugin, used for both manual development and as the automated test target.
