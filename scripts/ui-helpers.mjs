// Shared UI steps for the e2e / acceptance scripts: recording the police-permission status as an organizer would.
/** Records one lifecycle step in the Police permission panel. `d`: { when?, method?, reference?, approvalDate?, conditions? } */
export async function recordPermission(page, status, d = {}) {
  await page.locator("#perm-status").waitFor();
  await page.selectOption("#perm-status", status);
  if (d.method) await page.selectOption("#perm-method", d.method);
  if (d.reference) await page.fill("#perm-ref", d.reference);
  if (d.evidenceRef) await page.fill("#perm-evidence", d.evidenceRef);
  if (d.approvalDate) await page.fill("#perm-approved", d.approvalDate);
  if (d.conditions) await page.fill("#perm-conditions", d.conditions);
  await page.getByRole("button", { name: "Record status" }).click();
  await page.waitForLoadState("networkidle"); await page.waitForTimeout(900);
}
export const submitApplication = (page, d = { method: "IN_PERSON", reference: "DIARY/001" }) => recordPermission(page, "SUBMITTED", d);
