import test from "node:test";
import assert from "node:assert/strict";
import { lstat, mkdir, mkdtemp, readlink, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { syncClaudeSkillLinks, SyncError } from "./skills-sync-core.mjs";

async function skill(root, name) {
  await mkdir(join(root, ".agents", "skills", name), { recursive: true });
  await writeFile(join(root, ".agents", "skills", name, "SKILL.md"), `# ${name}\n`);
}

test("Claude links mirror shared skills and prune only links owned by the bridge", async () => {
  const root = await mkdtemp(join(tmpdir(), "skills-links-"));
  await skill(root, "alpha");
  await skill(root, "beta");
  await mkdir(join(root, ".claude", "skills"), { recursive: true });
  await symlink("../../.agents/skills/removed", join(root, ".claude", "skills", "removed"));
  await symlink("../../elsewhere", join(root, ".claude", "skills", "foreign"));

  const result = await syncClaudeSkillLinks({ root });
  assert.deepEqual(result.linked, ["alpha", "beta"]);
  assert.deepEqual(result.unlinked, ["removed"]);
  assert.equal(await readlink(join(root, ".claude", "skills", "alpha")), "../../.agents/skills/alpha");
  assert.equal(await readlink(join(root, ".claude", "skills", "foreign")), "../../elsewhere");
  await assert.rejects(lstat(join(root, ".claude", "skills", "removed")), { code: "ENOENT" });

  assert.deepEqual(await syncClaudeSkillLinks({ root }), { linked: [], unlinked: [] });
});

test("Claude bridge refuses to overwrite an unmanaged entry", async () => {
  const root = await mkdtemp(join(tmpdir(), "skills-links-"));
  await skill(root, "alpha");
  await mkdir(join(root, ".claude", "skills", "alpha"), { recursive: true });
  await assert.rejects(
    syncClaudeSkillLinks({ root }),
    (error) => error instanceof SyncError && error.code === "skills-sync.claude-link-conflict",
  );
});

test("Claude bridge refuses a symlinked platform directory", async () => {
  const root = await mkdtemp(join(tmpdir(), "skills-links-"));
  const external = await mkdtemp(join(tmpdir(), "skills-links-external-"));
  await skill(root, "alpha");
  await symlink(external, join(root, ".claude"));
  await assert.rejects(
    syncClaudeSkillLinks({ root }),
    (error) => error instanceof SyncError && error.code === "skills-sync.claude-link-conflict",
  );
  await assert.rejects(lstat(join(external, "skills")), { code: "ENOENT" });
});
