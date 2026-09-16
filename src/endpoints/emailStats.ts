import type { Endpoint, PayloadRequest } from 'payload'
import type { EmailPublishingPluginOptions } from '../types.js'
import { EMAIL_SEND_STATUSES } from '../collections/EmailSends.js'

export const buildEmailStatsEndpoint = (pluginOptions: EmailPublishingPluginOptions): Endpoint => ({
  path: '/email-publishing/email-stats/:emailId',
  method: 'get',
  handler: async (req) => {
    const hasAccess = await pluginOptions.access.canManage({ req } as Parameters<typeof pluginOptions.access.canManage>[0])
    if (!hasAccess) {
      return Response.json({ message: 'Forbidden' }, { status: 403 })
    }

    const emailId = (req as PayloadRequest & { routeParams?: Record<string, string> }).routeParams?.emailId
    if (!emailId) {
      return Response.json({ message: 'Missing emailId' }, { status: 400 })
    }

    const counts = await Promise.all(
      EMAIL_SEND_STATUSES.map(async (status) => {
        const result = await req.payload.count({
          collection: 'email-sends',
          where: { email: { equals: emailId }, status: { equals: status } },
          overrideAccess: true,
        })
        return [status, result.totalDocs] as const
      }),
    )

    const total = await req.payload.count({
      collection: 'email-sends',
      where: { email: { equals: emailId } },
      overrideAccess: true,
    })

    return Response.json({
      recipients: total.totalDocs,
      byStatus: Object.fromEntries(counts),
    })
  },
})
