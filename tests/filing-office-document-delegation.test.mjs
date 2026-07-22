import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const servicePath = new URL("../src/server/finance/filing-office-service.ts", import.meta.url);
const handlerPath = new URL("../src/server/finance/document-operations.ts", import.meta.url);

test("Filing Office service delegates document lifecycle operations", async () => {
  const service = await readFile(servicePath, "utf8");
  const handler = await readFile(handlerPath, "utf8");

  assert.match(service, /handleDocumentOperation\(context\)/);
  assert.doesNotMatch(service, /case "recordSignature"/);
  assert.doesNotMatch(service, /case "verifyDocument"/);

  for (const operation of [
    "generateDocument",
    "regenerateDocumentVersion",
    "requestSignature",
    "recordSignature",
    "verifyDocument",
  ]) {
    assert.match(handler, new RegExp(`"${operation}"`));
  }

  assert.match(handler, /CREATOR_CANNOT_VERIFY/);
  assert.match(handler, /FROZEN_DOCUMENT_REQUIRES_CORRECTION_COPY/);
});
