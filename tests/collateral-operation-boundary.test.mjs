import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const service = await readFile(
  new URL("../src/server/finance/filing-office-service.ts", import.meta.url),
  "utf8",
);
const collateral = await readFile(
  new URL("../src/server/finance/collateral-operations.ts", import.meta.url),
  "utf8",
);

test("filing office delegates collateral operations", () => {
  assert.match(service, /handleCollateralOperation\(context\)/);
  assert.doesNotMatch(service, /case "addCollateralRecord"/);
  assert.doesNotMatch(service, /case "withdrawCollateralRecord"/);
  assert.doesNotMatch(service, /case "generateCollateralSchedule"/);

  assert.match(collateral, /case "addCollateralRecord"/);
  assert.match(collateral, /case "withdrawCollateralRecord"/);
  assert.match(collateral, /case "generateCollateralSchedule"/);
});
