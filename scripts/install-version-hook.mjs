import { access, chmod, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const gitDir = path.join(rootDir, ".git");
const hooksDir = path.join(gitDir, "hooks");
const hookPath = path.join(hooksDir, "pre-commit");

const hook = `#!/bin/sh
set -e

staged_files="$(git diff --cached --name-only --diff-filter=ACMR)"

if [ -z "$staged_files" ]; then
  exit 0
fi

version_status="$(git status --porcelain -- VERSION package.json package-lock.json apps/backend/package.json apps/frontend/package.json || true)"

if printf "%s" "$version_status" | grep -q "VERSION"; then
  git add VERSION package.json package-lock.json apps/backend/package.json apps/frontend/package.json
  echo "Version files already changed; staging them without an additional revision bump."
  exit 0
fi

npm run version:revision
git add VERSION package.json package-lock.json apps/backend/package.json apps/frontend/package.json
`;

try {
  await access(gitDir);
} catch {
  console.log("Git repository not found. Skipping version pre-commit hook installation.");
  process.exit(0);
}

await mkdir(hooksDir, { recursive: true });
await writeFile(hookPath, hook, "utf8");
await chmod(hookPath, 0o755);
console.log("Installed version pre-commit hook.");
