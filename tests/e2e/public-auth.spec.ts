import { expect, test } from '@playwright/test';

test.describe('public auth surfaces', () => {
  test('@smoke login page renders auth entry points', async ({ page }) => {
    await page.goto('/login');

    await expect(page.getByRole('heading', { name: /IdeaDump/i })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Magic Link', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Password', exact: true })).toBeVisible();
    await expect(page.getByLabel(/email/i)).toBeVisible();
  });

  test('@smoke signup page renders account creation form', async ({ page }) => {
    await page.goto('/signup');

    await expect(page.getByRole('heading', { name: /IdeaDump/i })).toBeVisible();
    await expect(page.getByLabel(/email/i)).toBeVisible();
  });

  test('@smoke reset password page renders recovery form', async ({ page }) => {
    await page.goto('/reset-password');

    await expect(page.getByRole('heading')).toBeVisible();
    await expect(page.getByLabel(/email/i)).toBeVisible();
  });
});
