import type { Endpoint } from 'payload'
import { SWEEP_TASK_SLUG } from '../jobs/sweepDueScheduledCampaigns.js'
import { isAuthorizedCronRequest } from '../cronAuth.js'

// Manual escape hatch for testing against a deployed environment (Preview
// or Production), where there's no Local API/DB access the way
// `pnpm payload run ./src/scripts/queue-email-publishing-sweep.ts` has
// locally. GET /api/payload-jobs/run alone isn't enough for this: it calls
// handleSchedules() (which only *schedules* the sweep task for its next
// cron occurrence per config.jobs.tasks[].schedule, not immediately) then
// runJobs() (which only picks up jobs whose waitUntil has already passed) -
// so the very first invocation in an environment where the sweep has never
// run before schedules it for later and finds nothing due yet, same as a
// real Scheduler Item sitting unprocessed looks from the outside. This
// endpoint queues the sweep task with no waitUntil (so it's immediately
// due) and runs it in the same request, bypassing that gap entirely.
//
// Same auth as /api/payload-jobs/run (CRON_SECRET bearer token) - this
// endpoint is at least as sensitive (it can trigger a real send).
export const buildTriggerSweepEndpoint = (): Endpoint => ({
  path: '/email-publishing/trigger-sweep',
  method: 'get',
  handler: async (req) => {
    if (!isAuthorizedCronRequest(req)) {
      return Response.json({ message: req.i18n?.t?.('error:unauthorized') ?? 'Unauthorized' }, { status: 401 })
    }

    const job = await req.payload.jobs.queue({ task: SWEEP_TASK_SLUG, input: {}, req, overrideAccess: true })
    const result = await req.payload.jobs.run({ req, overrideAccess: true, queue: 'default' })

    return Response.json({ message: 'Sweep triggered', queuedJobId: job.id, ...result })
  },
})
