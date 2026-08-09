import test from "node:test";
import { makeTemporaryDirectory } from "../helpers.mjs";

test("create a registered temporary directory", async () => {
  const root = await makeTemporaryDirectory("harness-cleanup-probe-");
  process.stdout.write(`TEMP_ROOT=${root}\n`);
});
