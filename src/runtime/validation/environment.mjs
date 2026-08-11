const CAPABILITY_STATUSES = new Set(["unknown", "unavailable", "installed", "available", "authenticated", "authorized", "healthy", "blocked-by-policy"]);
const ENVIRONMENT_HEADINGS = [
  "# AI Environment Manifest",
  "## 00. Contract Metadata",
  "## 01. Environment Profiles",
  "## 02. Machine Environment",
  "## 03. Agent Tool Capabilities",
  "## 04. Project Stack",
  "## 05. Canonical Commands",
  "## 06. Services and Lifecycle",
  "## 07. Network and Filesystem",
  "## 08. Paths, Data and Artifacts",
  "## 09. Observability and Troubleshooting",
  "## 10. Verification and Acceptance",
  "## 11. Constraints and Approval Policy",
  "## 12. Secrets and Sensitive Data",
  "## 13. CI Parity",
  "## 14. Known Issues and Freshness",
  "## 15. Alignment Checklist",
];

const issue = (code, path, message) => ({ code, path, message });
const nonEmpty = (value) => typeof value === "string" && value.trim() !== "";

export function validateEnvironmentManifest(value) {
  const errors = [];
  const warnings = [];
  if (!nonEmpty(value)) {
    errors.push(issue("E_ENVIRONMENT_INVALID", "$", "AI environment manifest must be non-empty text"));
    return { valid: false, errors, warnings };
  }

  for (const heading of ENVIRONMENT_HEADINGS) {
    if (!value.split("\n").includes(heading)) errors.push(issue("E_ENVIRONMENT_SECTION", heading, `required section is missing: ${heading}`));
  }

  const lines = value.split("\n");
  const placeholderLines = [];
  const incompleteChecklistLines = [];
  for (const [index, line] of lines.entries()) {
    if (/\{填写[^}]*\}/.test(line)) placeholderLines.push(index + 1);
    if (/^- \[ \]/.test(line)) incompleteChecklistLines.push(index + 1);
  }
  if (placeholderLines.length > 0) errors.push(issue("E_ENVIRONMENT_PLACEHOLDER", `line.${placeholderLines[0]}`, `${placeholderLines.length} line(s) contain unresolved fill placeholders`));
  if (incompleteChecklistLines.length > 0) errors.push(issue("E_ENVIRONMENT_CHECKLIST", `line.${incompleteChecklistLines[0]}`, `${incompleteChecklistLines.length} alignment checklist item(s) are not confirmed`));

  const capabilityStart = lines.indexOf("## 03. Agent Tool Capabilities");
  const capabilityEnd = lines.indexOf("## 04. Project Stack");
  const invalidCapabilityStatusLines = [];
  if (capabilityStart >= 0 && capabilityEnd > capabilityStart) {
    for (let index = capabilityStart + 1; index < capabilityEnd; index += 1) {
      const line = lines[index];
      if (!line?.startsWith("|")) continue;
      const cells = line.split("|").slice(1, -1).map((cell) => cell.trim());
      if (cells[0] === "Capability" || cells.every((cell) => /^-+$/.test(cell))) continue;
      const status = cells.at(-1)?.replace(/^`|`$/g, "");
      if (!CAPABILITY_STATUSES.has(status)) invalidCapabilityStatusLines.push(index + 1);
    }
  }
  if (invalidCapabilityStatusLines.length > 0) errors.push(issue("E_ENVIRONMENT_CAPABILITY_STATUS", `line.${invalidCapabilityStatusLines[0]}`, `${invalidCapabilityStatusLines.length} capability row(s) use an invalid status`));
  return { valid: errors.length === 0, errors, warnings };
}
