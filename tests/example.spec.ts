import { test, expect } from '@playwright/test';

// test('has title', async ({ page }) => {
//   await page.goto('https://playwright.dev/');

//   // Expect a title "to contain" a substring.
//   await expect(page).toHaveTitle(/Playwright/);
// });

// test('get started link', async ({ page }) => {
//   await page.goto('https://playwright.dev/');

//   // Click the get started link.
//   await page.getByRole('link', { name: 'Get started' }).click();

//   // Expects page to have a heading with the name of Installation.
//   await expect(page.getByRole('heading', { name: 'Installation' })).toBeVisible();
// });

test('Install Voicenter extension', async ({ page }) => {
  await page.goto('https://www.voicenter.co.il/');

  await expect(page).toHaveTitle(/Voicenter/);

  await page.click('a:has-text("תוסף Chrome")');

  const [ download ] = await Promise.all([
    page.waitForEvent('download'),
    page.click('button:has-text("Add to Chrome")'),
  ]);

  const downloadPath = await download.path();
  console.log('Downloaded to:', downloadPath);

  // const extension_link = page.getByRole( 'link', { name: 'תוסף Chrome'}).click;
})
