import type { PayloadRequest } from 'payload'

// Shared by config.jobs.access.run (gating Payload's own GET /api/payload-jobs/run,
// which Vercel Cron calls) and the manual trigger-sweep endpoint below - both
// need the same bearer-token check, so this is the one place it's defined.
// Fails closed if CRON_SECRET isn't set.
export const isAuthorizedCronRequest = (req: PayloadRequest): boolean => {
  const cronSecret = process.env.CRON_SECRET
  return Boolean(cronSecret) && req.headers.get('authorization') === `Bearer ${cronSecret}`
}
