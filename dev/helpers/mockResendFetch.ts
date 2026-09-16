import { vi } from 'vitest'

/**
 * Stubs the global fetch so ResendClient (a thin fetch() wrapper, see
 * src/resend.ts) never makes a real network call to api.resend.com during
 * tests. Requests to any other origin pass through to the real fetch.
 */
export const installMockResendFetch = () => {
  const originalFetch = global.fetch

  global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString()
    if (url.includes('api.resend.com')) {
      if (url.endsWith('/emails/batch')) {
        const body = init?.body ? JSON.parse(String(init.body)) : []
        return new Response(
          JSON.stringify({ data: body.map(() => ({ id: `mock-resend-${Math.random().toString(36).slice(2)}` })) }),
          { status: 200 },
        )
      }
      return new Response(JSON.stringify({ id: `mock-resend-${Math.random().toString(36).slice(2)}` }), { status: 200 })
    }
    return originalFetch(input as any, init)
  }) as typeof fetch

  return () => {
    global.fetch = originalFetch
  }
}
