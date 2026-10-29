import { test, expect } from '@playwright/test';
import path from 'node:path';

// Run ONLY against tests/fixtures/six-steps/prepare.ts's isolated dataset and the printed pnpm dev Local URL.
const base = process.env.SIX_STEPS_TEST_URL;
test.skip(
  !base,
  'Set SIX_STEPS_TEST_URL to the isolated development application.',
);
const evidence = path.resolve('storage/ui-workflow/six-steps/screenshots');

test('synthetic administrator manages versions, checks missing approval, previews a real PPTX and inspects history', async ({
  page,
}) => {
  const errors: string[] = [];
  const consoleErrors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text());
      console.log('Browser error:', message.text());
    }
  });
  page.setDefaultTimeout(15000);
  const login = await page.request.post(`${base}api/auth/sign-in/username`, {
    data: { username: 'sixstepsadmin', password: '12345678' },
    headers: { Origin: new URL(base!).origin },
  });
  expect(login.ok()).toBe(true);
  await page.goto(base!);
  await expect(page.getByRole('heading').first()).toBeVisible();
  const baselineErrors = [...consoleErrors];
  await page.goto(`${base}rules`);
  await expect(
    page.getByRole('heading', { name: /Scoring rules|评分标准/ }),
  ).toBeVisible();
  await page
    .getByRole('link', { name: 'TEST ONLY fixture-unapproved', exact: true })
    .click();
  await page.getByLabel(/Reason|原因/).fill('Synthetic test: no real approval');
  await page.getByRole('button', { name: /^Publish$|^发布$/ }).click();
  await expect(page.getByRole('alert')).toContainText(
    /approval evidence|批准依据/,
  );
  await page.getByRole('alert').scrollIntoViewIfNeeded();
  await page.screenshot({
    path: path.join(evidence, 'approval-blocked.png'),
    fullPage: true,
  });
  await page.goto(`${base}filePolicies/new`);
  const key = `browser-${Date.now()}`;
  await page.getByLabel(/Business key|业务标识/).pressSequentially(key);
  const name = page.getByLabel(/^Name|名称/);
  await name.pressSequentially('Synthetic policy');
  await name.press('Home');
  await name.pressSequentially('A ');
  const session = await page.context().newCDPSession(page);
  await name.focus();
  await session.send('Input.imeSetComposition', {
    text: 'zhongwen',
    selectionStart: 0,
    selectionEnd: 8,
  });
  await session.send('Input.insertText', { text: '中文' });
  await page.getByLabel(/Allowed extensions|允许扩展名/).fill('["pptx"]');
  await page.getByLabel(/Maximum bytes|文件大小上限/).fill('1024');
  await page.getByLabel(/Security scan required|必须安全检查/).fill('true');
  const created = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/sixSteps/filePolicies') &&
      response.request().method() === 'POST',
  );
  await page
    .getByRole('button', { name: /^Create version$|^新建版本$/ })
    .last()
    .click();
  expect((await created).ok()).toBe(true);
  await expect(page).toHaveURL(/filePolicies$/);
  await expect(page.getByText(key, { exact: true })).toBeVisible();
  await page.goto(`${base}files`);
  const safeFile = page
    .locator('tbody tr')
    .filter({ hasText: 'TEST-ONLY-template.pptx' })
    .first();
  await safeFile.getByRole('button', { name: /Actions for|的操作/ }).click();
  await page
    .getByRole('menuitem', { name: /Preview \/ download|预览与下载/ })
    .click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('dialog')).toContainText(
    'TEST-ONLY-template.pptx',
  );
  await page.waitForTimeout(1800);
  await page.screenshot({
    path: path.join(evidence, 'pptx-preview.png'),
    fullPage: true,
  });
  await page.keyboard.press('Escape');
  await page.goto(`${base}workflows/definitions/sixStepVersions`);
  await expect(
    page.getByText(/no adjustable transition parameters|无可调转换参数/),
  ).toBeVisible();
  await expect(page.getByText(/Laying out diagram|正在布局/)).toHaveCount(0);
  await expect(page.locator('.react-flow__node').first()).toBeVisible();
  await page.screenshot({
    path: path.join(evidence, 'definition.png'),
    fullPage: true,
  });
  await page.goto(`${base}workflows/executions`);
  // Repeated demo runs create more than one page of real execution records.
  await expect(
    page.getByRole('button', { name: /^Next$|^下一页$/ }),
  ).toBeVisible();
  await expect(page.locator('tbody a').first()).toBeVisible();
  for (let pageNumber = 1; pageNumber <= 20; pageNumber++) {
    if (
      await page
        .getByRole('link', { name: 'TEST ONLY fixture-rule', exact: true })
        .isVisible()
    )
      break;
    const next = page.getByRole('button', { name: /^Next$|^下一页$/ });
    if (await next.isDisabled()) break;
    const previous = await page.locator('tbody a').first().getAttribute('href');
    await Promise.all([
      page.waitForResponse((response) =>
        response.url().includes('/api/sixStepProcesses/executions'),
      ),
      next.click(),
    ]);
    await expect(page).toHaveURL(new RegExp(`page=${pageNumber + 1}`));
    await expect(page.locator('tbody a').first()).not.toHaveAttribute(
      'href',
      previous!,
    );
  }
  await page
    .getByRole('link', { name: 'TEST ONLY fixture-rule', exact: true })
    .click();
  await expect(
    page.getByText(/History|历史记录/, { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: path.join(evidence, 'execution.png'),
    fullPage: true,
  });
  await page.goto(`${base}calendars`);
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.setViewportSize({ width: 375, height: 812 });
  await expect(
    page.getByRole('heading', { name: /Work calendars|工作日历/ }),
  ).toBeVisible();
  await page.screenshot({
    path: path.join(evidence, 'calendar-narrow-dark.png'),
    fullPage: true,
  });
  for (const [preset, mode] of [
    ['compact', 'light'],
    ['default', 'dark'],
  ] as const) {
    await page.evaluate(
      ({ preset, mode }) => {
        localStorage.setItem('nocobase:main:theme:preset', preset);
        localStorage.setItem('nocobase:main:theme:color-scheme', mode);
      },
      { preset, mode },
    );
    await page.reload();
    await expect(
      page.getByRole('heading', { name: /Work calendars|工作日历/ }),
    ).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-theme', preset);
    await page.screenshot({
      path: path.join(evidence, `calendar-${preset}-${mode}.png`),
      fullPage: true,
    });
  }
  expect(
    consoleErrors.filter(
      (entry) =>
        !baselineErrors.includes(entry) && !entry.includes('status of 400'),
    ),
  ).toEqual([]);
  expect(errors).toEqual([]);
});

test('synthetic roleless account cannot access management API or protected content', async ({
  page,
}) => {
  const login = await page.request.post(`${base}api/auth/sign-in/username`, {
    data: { username: 'sixstepsreader', password: '12345678' },
    headers: { Origin: new URL(base!).origin },
  });
  expect(login.ok()).toBe(true);
  expect((await page.request.get(`${base}api/sixSteps/rules`)).status()).toBe(
    403,
  );
  expect((await page.request.get(`${base}api/sixSteps/files`)).status()).toBe(
    403,
  );
  await page.goto(`${base}rules`);
  await expect(
    page.getByRole('heading', {
      name: /Access denied|访问被拒绝|无权访问|拒绝访问/,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: /^Create version$|^新建版本$/ }),
  ).toHaveCount(0);
  await page.screenshot({
    path: path.join(evidence, 'roleless.png'),
    fullPage: true,
  });
});

test('grant creation and revocation use real dates, reasons and Chinese administration copy', async ({
  page,
}) => {
  const login = await page.request.post(`${base}api/auth/sign-in/username`, {
    data: { username: 'sixstepsadmin', password: '12345678' },
    headers: { Origin: new URL(base!).origin },
  });
  expect(login.ok()).toBe(true);
  const periods = await (
    await page.request.get(`${base}api/sixSteps/periods`)
  ).json();
  const organizations = await (
    await page.request.get(`${base}api/sixSteps/organizations`)
  ).json();
  const period = periods.data.find(
    (row: { state: string }) => row.state === 'published',
  );
  const userId = organizations.data.find(
    (row: { state: string }) => row.state === 'published',
  ).payload.people[0].userId;
  await page.goto(`${base}grants/new`);
  await page.getByLabel(/^Published period version ID/).fill(period.id);
  await page.getByLabel(/^Recipient user ID/).fill(userId);
  await page.getByLabel(/^Grant purpose/).fill('lateSubmission');
  for (const field of ['validFrom', 'validUntil']) {
    await page.locator(`#ss-${field}`).click();
    await page
      .locator(`[data-day="${new Date().toLocaleDateString('en-US')}"]`)
      .click();
    await page
      .getByLabel(
        new RegExp(
          `${field === 'validFrom' ? 'Valid from' : 'Valid until'}.*UTC time`,
        ),
      )
      .fill(field === 'validFrom' ? '00:00:00' : '23:59:59');
  }
  await page.getByLabel(/^Permitted uses/).fill('1');
  await page.getByLabel(/^Reason/).fill('Synthetic browser grant');
  await page.getByLabel(/^Approval evidence/).fill(
    JSON.stringify({
      source: 'TEST ONLY browser fixture',
      approvedBy: 'Synthetic',
      approvedAt: '2026-01-01T00:00:00Z',
      decisions: ['DEC-04'],
    }),
  );
  await page
    .getByRole('button', { name: 'Create version', exact: true })
    .last()
    .click();
  await expect(page).toHaveURL(/grants$/);
  await page.getByRole('button', { name: 'Grant actions' }).first().click();
  await page.getByRole('menuitem', { name: 'Revoke' }).click();
  await page
    .getByRole('alertdialog')
    .getByLabel('Reason', { exact: true })
    .fill('Synthetic revoke');
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Revoke', exact: true })
    .click();
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  await expect(
    page.getByText('Revoked', { exact: true }).first(),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Open account menu' }).click();
  await page.getByRole('menuitem', { name: /Language/ }).hover();
  await page.getByRole('menuitemradio', { name: /简体中文|中文/ }).click();
  await expect(
    page.getByRole('heading', { name: '补交与延期授权' }),
  ).toBeVisible();
  await page.locator('[data-slot="table-container"]').evaluateAll((elements) =>
    elements.forEach((element) => {
      element.scrollLeft = 0;
    }),
  );
  await page.screenshot({
    path: path.join(evidence, 'grants-chinese.png'),
    fullPage: true,
  });
});

test('browser uploads remain quarantined without a production scanner', async ({
  page,
}) => {
  expect(
    (
      await page.request.post(`${base}api/auth/sign-in/username`, {
        data: { username: 'sixstepsadmin', password: '12345678' },
        headers: { Origin: new URL(base!).origin },
      })
    ).ok(),
  ).toBe(true);
  const policies = await (
    await page.request.get(
      `${base}api/sixSteps/filePolicies?q=fixture-file-policy`,
    )
  ).json();
  // Read the published fixture policy; browser-created drafts must not authorize uploads.
  const all = policies.data.length
    ? policies
    : await (
        await page.request.get(`${base}api/sixSteps/filePolicies?pageSize=100`)
      ).json();
  const policy = all.data.find(
    (row: { state: string }) => row.state === 'published',
  );
  await page.goto(`${base}files/new`);
  await page.getByLabel(/^Published file policy version ID/).fill(policy.id);
  await page.locator('#ss-file').setInputFiles({
    name: 'TEST-ONLY-quarantined.pptx',
    mimeType:
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    buffer: Buffer.from('not a verified presentation; quarantine test only'),
  });
  const saved = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/sixSteps/files') &&
      response.request().method() === 'POST',
  );
  await page
    .getByRole('button', { name: 'Create version', exact: true })
    .last()
    .click();
  expect((await saved).ok()).toBe(true);
  await expect(page).toHaveURL(/files$/);
  await expect(
    page.getByText('Scanner required', { exact: true }).first(),
  ).toBeVisible();
  await expect(
    page
      .getByRole('button', { name: 'Preview / download', exact: true })
      .first(),
  ).toBeDisabled();
  await page.screenshot({
    path: path.join(evidence, 'upload-quarantined.png'),
    fullPage: true,
  });
});

test('native Users and Roles management expose the explicit six-step assignment', async ({
  page,
}) => {
  // Bootstrap administrator belongs ONLY to prepare.ts's isolated fixture.
  expect(
    (
      await page.request.post(`${base}api/auth/sign-in/username`, {
        data: { username: 'nocobase', password: 'admin123' },
        headers: { Origin: new URL(base!).origin },
      })
    ).ok(),
  ).toBe(true);
  await page.goto(`${base}settings/users`);
  await expect(
    page.getByRole('heading', { name: /^Users$|^用户管理$/ }),
  ).toBeVisible();
  const adminRow = page
    .getByRole('row')
    .filter({ hasText: 'sixstepsadmin@example.test' });
  await expect(adminRow).toContainText('六步骤管理员 / Six-step administrator');
  await page.screenshot({
    path: path.join(evidence, 'users-explicit-assignment.png'),
    fullPage: true,
  });
  await page.goto(`${base}settings/roles`);
  await expect(
    page.getByRole('heading', {
      name: /^Permission management$|^权限管理$/,
    }),
  ).toBeVisible();
  await expect(
    page.getByText('六步骤管理员 / Six-step administrator', { exact: true }),
  ).toBeVisible();
});
