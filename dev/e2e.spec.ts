import { expect, test } from '@playwright/test'

// Both tests log in as the same seeded dev user - run serially so two
// concurrent logins as the same user never race each other.
test.describe.configure({ mode: 'serial' })

test.beforeEach(async ({ page }) => {
  await page.goto('/admin')
  await page.fill('#field-email', 'dev@payloadcms.com')
  await page.fill('#field-password', 'test')
  await page.getByRole('button', { name: 'Login' }).click()
  await expect(page).toHaveTitle(/Dashboard/)
})

test('admin panel shows the Email Publishing nav group', async ({ page }) => {
  await expect(page.locator('#nav-posts')).toBeVisible()
  await expect(page.locator('#nav-emails')).toBeVisible()
  await expect(page.locator('#nav-scheduler-items')).toBeVisible()
})

test('the seeded Email renders preview, scheduler, and stats fields', async ({ page }) => {
  await page.goto('/admin/collections/emails')
  await page.getByRole('link', { name: 'Seeded example email' }).click()

  await expect(page.getByText('Preview')).toBeVisible()
  await expect(page.locator('iframe[title="Email preview"]')).toBeVisible()
  await expect(page.getByText('Status', { exact: true })).toBeVisible()
  await expect(page.getByText('Stats', { exact: true })).toBeVisible()
})
