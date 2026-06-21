import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const versionPattern = /^(\d+)\.(\d+)\.(\d+)\+(\d+)$/;
const semverPattern = /^(\d+)\.(\d+)\.(\d+)(?:\+\d+)?$/;
const aliases = new Map([
  ["patch", "revision"],
  ["rev", "revision"],
  ["feature", "minor"]
]);
const bumpType = aliases.get(process.argv[2] ?? "") ?? process.argv[2] ?? "revision";
const allowedBumps = new Set(["revision", "minor", "major", "sync", "set"]);

if (!allowedBumps.has(bumpType)) {
  console.error(`Unsupported version bump "${bumpType}". Use revision, minor, major, sync, or set.`);
  process.exit(1);
}

const explicitVersion = process.argv[3];

if (bumpType === "set" && !explicitVersion) {
  console.error("Missing explicit version. Use: npm run version:set -- 0.1.0+1");
  process.exit(1);
}

async function readJson(relativePath) {
  const filePath = path.join(rootDir, relativePath);
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function writeJson(relativePath, data) {
  const filePath = path.join(rootDir, relativePath);
  await writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function parseVersion(rawVersion) {
  const trimmed = rawVersion.trim();
  const versionMatch = trimmed.match(versionPattern);

  if (versionMatch) {
    return {
      major: Number(versionMatch[1]),
      minor: Number(versionMatch[2]),
      revision: Number(versionMatch[3]),
      build: Number(versionMatch[4])
    };
  }

  const semverMatch = trimmed.match(semverPattern);
  if (semverMatch) {
    return {
      major: Number(semverMatch[1]),
      minor: Number(semverMatch[2]),
      revision: Number(semverMatch[3]),
      build: 0
    };
  }

  throw new Error(`Invalid version "${rawVersion}". Expected major.minor.revision+build.`);
}

function serializeVersion(version) {
  return `${version.major}.${version.minor}.${version.revision}+${version.build}`;
}

async function getCurrentVersion() {
  try {
    return parseVersion(await readFile(path.join(rootDir, "VERSION"), "utf8"));
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code !== "ENOENT") {
      throw error;
    }

    const rootPackage = await readJson("package.json");
    return parseVersion(rootPackage.version ?? "0.1.0+0");
  }
}

function bumpVersion(currentVersion) {
  if (bumpType === "set") {
    return parseVersion(explicitVersion);
  }

  const nextVersion = { ...currentVersion };

  if (bumpType === "major") {
    nextVersion.major += 1;
    nextVersion.minor = 0;
    nextVersion.revision = 0;
  }

  if (bumpType === "minor") {
    nextVersion.minor += 1;
    nextVersion.revision = 0;
  }

  if (bumpType === "revision") {
    nextVersion.revision += 1;
  }

  if (bumpType !== "sync") {
    nextVersion.build += 1;
  }

  return nextVersion;
}

async function updatePackageVersion(relativePath, nextVersion) {
  const packageJson = await readJson(relativePath);
  packageJson.version = nextVersion;
  await writeJson(relativePath, packageJson);
}

async function updatePackageLock(nextVersion) {
  const lockPath = path.join(rootDir, "package-lock.json");

  try {
    const lockfile = JSON.parse(await readFile(lockPath, "utf8"));
    lockfile.version = nextVersion;

    if (lockfile.packages?.[""]) {
      lockfile.packages[""].version = nextVersion;
    }

    for (const workspacePath of ["apps/backend", "apps/frontend"]) {
      if (lockfile.packages?.[workspacePath]) {
        lockfile.packages[workspacePath].version = nextVersion;
      }
    }

    await writeFile(lockPath, `${JSON.stringify(lockfile, null, 2)}\n`, "utf8");
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return;
    }

    throw error;
  }
}

const currentVersion = await getCurrentVersion();
const nextVersion = serializeVersion(bumpVersion(currentVersion));

await writeFile(path.join(rootDir, "VERSION"), `${nextVersion}\n`, "utf8");
await updatePackageVersion("package.json", nextVersion);
await updatePackageVersion("apps/backend/package.json", nextVersion);
await updatePackageVersion("apps/frontend/package.json", nextVersion);
await updatePackageLock(nextVersion);

console.log(`Application version set to ${nextVersion}.`);
