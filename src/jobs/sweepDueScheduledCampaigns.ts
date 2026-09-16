import type { TaskConfig } from 'payload'
import type { SchedulerItem } from '../copied/payload-types.js'
import type { EmailPublishingPluginOptions } from '../types.js'
import { processSchedulerItem } from './processSchedulerItem.js'

export const SWEEP_TASK_SLUG = 'email-publishing-sweep-due-scheduled-campaigns'

// A single recurring Payload Job Task, registered with a native
// TaskConfig.schedule (distinct from - and safe to use unlike - the
// in-process `autoRun` cron loop, which Payload's own docs warn against on
// serverless platforms like Vercel). Vercel Cron hits Payload's
// auto-registered GET /api/payload-jobs/run, which calls
// payload.jobs.handleSchedules() (enqueues this task when its cron is due)
// and then runs due jobs, in one request.
//
// Exact delivery-time precision is delegated to Resend's own scheduled_at
// (set per message in processSchedulerItem) - this sweep only needs to run
// before a campaign's sendAt, within the configured hand-off window, not
// exactly at it. Defaults to once daily (matching vercel.json) to fit
// Vercel's Hobby-plan cron limit of at most one run per day; the hand-off
// window default is sized to comfortably span that gap - see types.ts.
export const buildSweepTask = (pluginOptions: EmailPublishingPluginOptions): TaskConfig => ({
  slug: SWEEP_TASK_SLUG,
  schedule: [{ cron: pluginOptions.sweep?.cron ?? '0 9 * * *', queue: 'default' }],
  handler: async ({ req }) => {
    const handoffWindowMinutes = pluginOptions.sweep?.handoffWindowMinutes ?? 1500
    const handoffBy = new Date(Date.now() + handoffWindowMinutes * 60_000)

    const due = await req.payload.find({
      collection: 'scheduler-items',
      where: {
        status: { equals: 'scheduled' },
        sendAt: { less_than_equal: handoffBy.toISOString() },
      },
      overrideAccess: true,
      limit: 100,
    })

    for (const schedulerItem of due.docs as SchedulerItem[]) {
      // Each item catches and records its own errors internally (see
      // processSchedulerItem) - one bad campaign shouldn't stop the sweep
      // from handling the rest. Wrapped again here as a belt-and-suspenders
      // guard: an item throwing uncaught must not abort the whole sweep
      // task run (and, per Payload's default scheduling guard, block the
      // *next* run from being scheduled at all while this one is stuck).
      try {
        await processSchedulerItem({ req, schedulerItem, pluginOptions })
      } catch (err) {
        req.payload.logger.error({ err, msg: 'processSchedulerItem threw unexpectedly', schedulerItemId: schedulerItem.id })
      }
    }

    return { output: {} }
  },
})
