import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { makeTemporaryDirectory, runRaw } from "../helpers.mjs";

const sourceRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");

async function releaseFixture({ published }) {
  const root = await makeTemporaryDirectory("release-script-");
  const bin = join(root, "bin");
  await mkdir(bin);
  await writeFile(join(root, "publish-npm.sh"), await readFile(join(sourceRoot, "publish-npm.sh")), { mode: 0o755 });
  await writeFile(join(root, "harness"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
  await writeFile(join(root, "package.json"), '{"name":"ai-vibe-demo-kit","version":"0.5.1"}\n');
  await writeFile(join(bin, "git"), `#!/bin/sh
case "$1 $2" in
  "branch --show-current") printf 'main\\n' ;;
  "status --porcelain") ;;
  "fetch --quiet") ;;
  "rev-list --left-right") printf '0 0\\n' ;;
  *) exit 0 ;;
esac
`, { mode: 0o755 });
  await writeFile(join(bin, "node"), `#!/bin/sh
if [ "$1" = "--version" ]; then printf 'v24.18.0\\n'; exit 0; fi
if [ "$1" = "-e" ]; then printf 'ai-vibe-demo-kit 0.5.1\\n'; exit 0; fi
exit 0
`, { mode: 0o755 });
  await writeFile(join(bin, "npm"), `#!/bin/sh
if [ "$1" = "--version" ]; then printf '11.16.0\\n'; exit 0; fi
if [ "$1" = "view" ]; then ${published ? "printf '0.5.1\\n'; exit 0" : "printf 'E404 Not Found\\n' >&2; exit 1"}; fi
if [ "$1" = "pack" ]; then printf '[]\\n'; exit 0; fi
exit 0
`, { mode: 0o755 });
  return { root, path: `${bin}:${process.env.PATH}` };
}

test("release script rejects an already published version without modifying package metadata", async () => {
  const fixture = await releaseFixture({ published: true });
  const before = await readFile(join(fixture.root, "package.json"), "utf8");
  const result = await runRaw("env", [`PATH=${fixture.path}`, "bash", "./publish-npm.sh", "--dry-run"], fixture.root);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /already published/);
  assert.equal(await readFile(join(fixture.root, "package.json"), "utf8"), before);
});

test("release dry-run performs checks and leaves package metadata unchanged", async () => {
  const fixture = await releaseFixture({ published: false });
  const before = await readFile(join(fixture.root, "package.json"), "utf8");
  const result = await runRaw("env", [`PATH=${fixture.path}`, "bash", "./publish-npm.sh", "--dry-run"], fixture.root);
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /Dry run passed/);
  assert.equal(await readFile(join(fixture.root, "package.json"), "utf8"), before);
});

test("release script contains no runtime version mutation", async () => {
  const script = await readFile(join(sourceRoot, "publish-npm.sh"), "utf8");
  assert.doesNotMatch(script, /^\s*npm version\b/m);
  assert.match(script, /check-architecture --file project\.yml/);
});
