import { expect, test } from '@playwright/test'
import { WEB_URL } from '../support/stack'

test('environment reports have separate real rate limits per simulated device', async ({ browser }) => {
  const contexts = await Promise.all([browser.newContext({ baseURL: WEB_URL }), browser.newContext({ baseURL: WEB_URL })])
  try {
    for (const context of contexts) {
      expect((await context.request.get('/api/me')).status()).toBe(200)
      for (let i = 0; i < 30; i++) {
        expect((await context.request.post('/api/me/environment', { data: {}, headers: { 'x-forwarded-for': `203.0.113.${i + 1}` } })).status()).toBe(200)
      }
      expect((await context.request.post('/api/me/environment', { data: {}, headers: { 'x-forwarded-for': '203.0.113.31' } })).status()).toBe(429)
    }
  } finally {
    await Promise.all(contexts.map(context => context.close()))
  }
})
