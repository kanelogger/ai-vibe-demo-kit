#!/usr/bin/env bash

set -Eeuo pipefail

readonly ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly REGISTRY="https://registry.npmjs.org"
readonly REQUIRED_NODE_VERSION="24.18.0"
readonly REQUIRED_NPM_VERSION="11.16.0"

DRY_RUN=false
ASSUME_YES=false
NPM_CACHE=""

usage() {
  cat <<'EOF'
Usage: ./publish-npm.sh [--dry-run] [--yes]

Publish the current package.json version to the public npm registry.

Options:
  --dry-run  Run toolchain, Git and pre-publish checks without registry writes
  --yes, -y  Skip the interactive "publish" confirmation
  --help, -h Show this help

This script auto-bumps the patch version when the current version is already published.
EOF
}

fail() {
  printf 'Publish failed: %s\n' "$*" >&2
  exit 1
}

cleanup() {
  if [[ -n "$NPM_CACHE" && -d "$NPM_CACHE" ]]; then
    rm -rf -- "$NPM_CACHE"
  fi
}

trap cleanup EXIT

while (($# > 0)); do
  case "$1" in
    --dry-run)
      DRY_RUN=true
      ;;
    --yes|-y)
      ASSUME_YES=true
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      fail "Unknown option: $1"
      ;;
  esac
  shift
done

for command_name in git node npm mktemp; do
  command -v "$command_name" >/dev/null 2>&1 || fail "Required command not found: $command_name"
done

cd "$ROOT_DIR"

[[ "$(node --version)" == "v${REQUIRED_NODE_VERSION}" ]] || \
  fail "Node.js ${REQUIRED_NODE_VERSION} is required; found $(node --version)."
[[ "$(npm --version)" == "$REQUIRED_NPM_VERSION" ]] || \
  fail "npm ${REQUIRED_NPM_VERSION} is required; found $(npm --version)."

[[ "$(git branch --show-current)" == "main" ]] || fail "Releases must run from the main branch."
[[ -z "$(git status --porcelain)" ]] || fail "The Git worktree must be clean before publishing."

git fetch --quiet origin main
read -r ahead behind < <(git rev-list --left-right --count HEAD...origin/main)
[[ "$behind" == "0" ]] || fail "Local main is behind or diverged from origin/main."
[[ "$ahead" == "0" ]] || fail "Local main has unpushed commits. Push them and wait for CI."

read -r package_name package_version < <(
  node -e 'const p = require("./package.json"); console.log(`${p.name} ${p.version}`)'
)
[[ -n "$package_name" && -n "$package_version" ]] || fail "package.json must define name and version."

NPM_CACHE="$(mktemp -d "${TMPDIR:-/tmp}/ai-vibe-demo-kit-release.XXXXXX")"
export npm_config_cache="$NPM_CACHE"

printf 'Release candidate: %s@%s\n' "$package_name" "$package_version"
printf 'Running canonical pre-publish checks...\n'
node scripts/validate-bundled-skill.mjs
node scripts/check-distribution.mjs
node --test test/runtime/*.test.mjs test/distribution/*.test.mjs
npm pack --dry-run --json

if [[ "$DRY_RUN" == true ]]; then
  printf 'Dry run passed; no registry write was attempted.\n'
  exit 0
fi

npm whoami --registry="$REGISTRY" >/dev/null

view_output=""
if view_output="$(npm view "${package_name}@${package_version}" version --registry="$REGISTRY" 2>&1)"; then
  printf '%s@%s is already published. Auto-bumping patch version...\n' "$package_name" "$package_version"
  max_attempts=50
  attempt=0
  while (( attempt < max_attempts )); do
    npm version patch --no-git-tag-version >/dev/null 2>&1 || fail "Failed to bump version."
    package_version="$(node -e 'console.log(require("./package.json").version)')"
    ((attempt++))
    if ! npm view "${package_name}@${package_version}" version --registry="$REGISTRY" >/dev/null 2>&1; then
      printf 'Auto-bumped to %s@%s (attempt %d).\n' "$package_name" "$package_version" "$attempt"
      break
    fi
    printf '%s@%s still taken; bumping again...\n' "$package_name" "$package_version"
  done
  if (( attempt >= max_attempts )); then
    fail "Could not find an unpublished patch version after ${max_attempts} attempts."
  fi
elif ! grep -Eqi 'E404|404 Not Found' <<<"$view_output"; then
  fail "Could not check npm version availability: ${view_output}"
fi

if [[ "$ASSUME_YES" != true ]]; then
  [[ -t 0 ]] || fail "Interactive confirmation is unavailable; rerun with --yes."
  read -r -p "Publish ${package_name}@${package_version} to npm? Type \"publish\": " answer
  [[ "$answer" == "publish" ]] || fail "Release cancelled."
fi

npm publish --access public --registry="$REGISTRY"

published_version="$(npm view "${package_name}@${package_version}" version --registry="$REGISTRY")"
published_version="${published_version//\"/}"
[[ "$published_version" == "$package_version" ]] || \
  fail "Registry verification returned ${published_version:-no version}."

printf 'Published and verified %s@%s.\n' "$package_name" "$package_version"
