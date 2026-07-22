import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const servicePath = new URL("../src/server/finance/filing-office-service.ts", import.meta.url);
const submissionPath = new URL("../src/server/finance/submission-operations.ts", import.meta.url);

test("filing office delegates submission lifecycle operations", async () => {
  const [service, submission] = await Promise.all([
    readFile(servicePath, "utf8"),
    readFile(submissionPath, "utf8"),
  ]);

  assert.match(service, /handleSubmissionOperation/);
  assert.doesNotMatch(service, /case\s+"exportSubmissionPackage"/);
  assert.doesNotMatch(service, /case\s+"recordSubmission"/);
  assert.doesNotMatch(service, /case\s+"recordReceipt"/);
  assert.doesNotMatch(service, /case\s+"recordReturn"/);
  assert.doesNotMatch(service, /case\s+"recordAcceptance"/);

  for (const operation of [
    "exportSubmissionPackage",
    "recordSubmission",
    "recordReceipt",
    "recordReturn",
    "recordAcceptance",
  ]) {
    assert.match(submission, new RegExp(`case \\"${operation}\\"`));
  }
});
