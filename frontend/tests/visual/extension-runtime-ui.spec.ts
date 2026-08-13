import { expect, Page, test } from '@playwright/test'

async function authenticate(page: Page) {
  await page.route('**/api/auth/me', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ id: 'admin-1', role: 'ADMIN', email: 'admin@school.test' }),
  }))
}

const pageDefinition = {
  extension: { key: 'REWARDS', name: 'Student Rewards' },
  defaultLocale: 'en',
  translations: {},
  page: {
    key: 'rewards', title: 'Student Rewards', ariaLabel: 'Student rewards management', resource: 'rewards', roles: ['ADMIN'],
    fields: [
      { key: 'student', label: 'Student', type: 'text', required: true },
      { key: 'points', label: 'Points', type: 'number', required: true },
    ],
    components: [
      { type: 'form', title: 'Add reward', actions: ['create', 'update'] },
      { type: 'table', title: 'Reward records', columns: ['student', 'points'], actions: ['view', 'edit', 'delete'], searchable: true },
    ],
  },
}

test('runtime page is responsive, keyboard operable, and exposes its empty state', async ({ page }) => {
  await authenticate(page)
  await page.route('**/api/extensions/REWARDS/pages/rewards', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(pageDefinition) }))
  await page.route('**/api/extensions/REWARDS/resources/rewards**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [], nextCursor: null }) }))

  for (const viewport of [{ width: 390, height: 844 }, { width: 1280, height: 720 }]) {
    await page.setViewportSize(viewport)
    await page.goto('/extensions/REWARDS/rewards')
    await expect(page.getByRole('heading', { name: 'Student Rewards' })).toBeVisible()
    await expect(page.getByText('No records found.')).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
  }

  await page.getByRole('textbox', { name: 'Student' }).focus()
  await page.keyboard.press('Tab')
  await expect(page.getByRole('spinbutton', { name: 'Points' })).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(page.getByRole('button', { name: 'Add record' })).toBeFocused()
})

test('runtime page renders a distinct permission-denied state', async ({ page }) => {
  await authenticate(page)
  await page.route('**/api/extensions/REWARDS/pages/rewards', route => route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ message: 'Forbidden' }) }))

  await page.goto('/extensions/REWARDS/rewards')

  const alert = page.getByRole('alert').filter({ hasText: 'Permission denied' })
  await expect(alert).toContainText('Permission denied')
  await expect(alert).toContainText('You do not have permission')
})
