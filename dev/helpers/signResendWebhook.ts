import { createHmac } from 'crypto'

/**
 * Signs a webhook payload the same way Svix (Resend's webhook delivery
 * provider) signs real deliveries, so tests can exercise the plugin's real
 * `verifyResendWebhook` (src/webhookVerify.ts) rather than mocking svix
 * itself. Algorithm per https://docs.svix.com/receiving/verifying-payloads/how-manual.
 */
export const signResendWebhook = (args: { secret: string; body: string; id?: string; timestamp?: number }) => {
  const svixId = args.id ?? `msg_${Math.random().toString(36).slice(2)}`
  const svixTimestamp = String(args.timestamp ?? Math.floor(Date.now() / 1000))
  const secretBytes = Buffer.from(args.secret.replace(/^whsec_/, ''), 'base64')
  const signedContent = `${svixId}.${svixTimestamp}.${args.body}`
  const signature = createHmac('sha256', secretBytes).update(signedContent).digest('base64')

  return {
    'svix-id': svixId,
    'svix-timestamp': svixTimestamp,
    'svix-signature': `v1,${signature}`,
  }
}
