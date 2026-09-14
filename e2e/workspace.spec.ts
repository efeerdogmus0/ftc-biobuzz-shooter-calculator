import { test, expect } from "@playwright/test";
const errors: string[] = [];
test.beforeEach(async ({ page }) => {
  errors.length = 0;
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.locator("canvas")).toBeVisible();
});
test.afterEach(() => expect(errors).toEqual([]));
test("pose controls, units, solved hit and shot restore", async ({ page }) => {
  const px = page.getByRole("spinbutton", { name: "Position X", exact: true });
  await px.fill("-1.1");
  await expect(px).toHaveValue("-1.1");
  await page
    .getByRole("spinbutton", { name: "96 mm goBILDA Rhino RPM", exact: true })
    .fill("1650");
  await expect(page.locator(".headline-metrics")).toContainText("8.01");
  await page.getByLabel("Units", { exact: true }).selectOption("SI");
  await expect(
    page.getByRole("spinbutton", { name: "Exit height", exact: true }),
  ).toHaveValue("0.347");
  await page.getByLabel("Units", { exact: true }).selectOption("FTC");
  await page.getByRole("button", { name: "Auto solve ↗", exact: true }).click();
  await expect(page.locator(".candidate").first()).toBeVisible();
  await page.locator(".candidate").first().click();
  await expect(page.locator(".field-status")).toContainText("HIT");
  await page.getByRole("button", { name: "Fire shot", exact: true }).click();
  await page
    .getByRole("button", { name: "Shot history (1)", exact: true })
    .click();
  await expect(page.locator(".history-row")).toHaveCount(1);
  await page
    .getByLabel("Robot preset", { exact: true })
    .selectOption("preset:2");
  await page.locator(".history-row").first().click();
  await expect(page.locator(".field-status")).toContainText("HIT");
  await page.getByRole("button", { name: "Save Profile", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("saved locally");
  await page.screenshot({ path: "test-results/workspace.png", fullPage: true });
});
test("ReCalc reference metrics are visible and exact", async ({ page }) => {
  await page
    .getByLabel("Robot preset", { exact: true })
    .selectOption("preset:2");
  await page.getByRole("button", { name: "Shot metrics", exact: true }).click();
  await expect(page.locator(".headline-metrics")).toContainText("7.59");
  for (const text of ["274", "1426", "0.323", "0.098", "1.208"])
    await expect(page.locator(".metric-table")).toContainText(text);
  await expect(page.locator(".badge")).toHaveText("ReCalc-calibrated");
});
test("worker Monte Carlo and field coverage finish and render", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Auto solve ↗", exact: true }).click();
  await expect(page.locator(".candidate").first()).toBeVisible();
  await page.locator(".candidate").first().click();
  await page
    .locator("summary")
    .filter({ hasText: "Monte Carlo consistency" })
    .click();
  await page
    .getByRole("button", { name: "Run consistency simulation", exact: true })
    .click();
  await expect(page.locator(".probability")).toBeVisible();
  await expect(page.locator(".scatter")).toHaveCount(2);
  await expect(page.locator(".probability")).not.toContainText("NaN");
  await page
    .locator("summary")
    .filter({ hasText: "Evaluate hood range" })
    .click();
  await page
    .getByRole("spinbutton", { name: "Field grid spacing", exact: true })
    .fill("500");
  await page
    .getByRole("button", { name: "Evaluate Hood Range", exact: true })
    .click();
  await expect(page.locator(".success")).toContainText("sampled poses", {
    timeout: 60000,
  });
  await page.getByRole("button", { name: "Top", exact: true }).click();
  await page.screenshot({ path: "test-results/coverage.png", fullPage: true });
});
test("measured-data UI fits synthetic reference without claiming real measurements", async ({
  page,
}) => {
  await page
    .getByLabel("Robot preset", { exact: true })
    .selectOption("preset:2");
  await page
    .locator(".tabs")
    .getByRole("button", { name: "Analysis", exact: true })
    .click();
  await page
    .locator("summary")
    .filter({ hasText: "Measured-shot calibration" })
    .click();
  const rows = [1500, 1700, 1900].map((rpm, i) => ({
    id: `SYNTHETIC-TEST-ONLY-${i}`,
    split: i === 2 ? "validation" : "training",
    primaryRPM: rpm,
    secondaryRPM: rpm * 4,
    hoodDeg: 65,
    exitVelocity: (7.585 * 0.85 * rpm) / 1700,
  }));
  await page
    .getByLabel("Calibration measurements JSON")
    .fill(JSON.stringify(rows));
  await page
    .getByRole("button", { name: "Validate measurements", exact: true })
    .click();
  await page
    .getByRole("checkbox", { name: "transfer [0.1, 2]", exact: true })
    .check();
  await page
    .getByRole("button", { name: "Fit training measurements", exact: true })
    .click();
  await expect(page.locator("tbody")).toContainText("0.850");
  await expect(page.getByText(/Training RMSE:/)).toContainText(
    "Validation: 0.00",
  );
  await expect(page.locator(".badge")).toHaveText("ReCalc-calibrated");
});
test("profile export and reimport preserve independently edited SI configuration", async ({
  page,
}) => {
  await page
    .getByRole("spinbutton", { name: "Hood launch angle", exact: true })
    .fill("70");
  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export JSON", exact: true }).click();
  const download = await downloadEvent;
  const path = (await download.path())!;
  await page
    .getByRole("spinbutton", { name: "Hood launch angle", exact: true })
    .fill("40");
  await page
    .getByLabel("Import JSON profile", { exact: true })
    .setInputFiles(path);
  await expect(page.getByRole("status")).toHaveText("Profile imported.");
  await expect(
    page.getByRole("spinbutton", { name: "Hood launch angle", exact: true }),
  ).toHaveValue("70");
  await expect(
    page.getByRole("spinbutton", { name: "Exit height", exact: true }),
  ).toHaveValue("347");
});
