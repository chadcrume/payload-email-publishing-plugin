import { Webhook } from 'svix'

// Resend signs webhook deliveries via Svix. Verification needs the exact
// raw request body (before any JSON parsing) plus the three svix-* headers.
// `Webhook.verify` only throws on an invalid signature and returns void (as
// of svix 2.5+ - earlier 2.x versions incorrectly returned the parsed body,
// a behavior svix itself has since deprecated) - so the raw body is parsed
// separately here once verification has passed.
export const verifyResendWebhook = (args: {
  rawBody: string
  headers: { 'svix-id'?: string; 'svix-timestamp'?: string; 'svix-signature'?: string }
  secret: string
}): unknown => {
  const wh = new Webhook(args.secret)
  wh.verify(args.rawBody, {
    'svix-id': args.headers['svix-id'] ?? '',
    'svix-timestamp': args.headers['svix-timestamp'] ?? '',
    'svix-signature': args.headers['svix-signature'] ?? '',
  })
  return JSON.parse(args.rawBody)
}
