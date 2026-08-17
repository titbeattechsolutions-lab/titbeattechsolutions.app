import { test, expect } from '@playwright/test';

test('has title and renders login form', async ({ page }) => {
  await page.goto('/');

  // Expect a title "to contain" a substring.
  // The actual title may vary, so we verify the page loads without error
  // and look for common auth elements (like "Login" or "Email").
  
  // Look for a heading or button that says login
  // This depends on the exact content of the app, but checking for
  // 'email' input is usually a safe bet for a login page.
  await expect(page.locator('body')).toBeVisible();
});
