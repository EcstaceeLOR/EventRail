import { readFile, readdir, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import process from "node:process";

const root = resolve(import.meta.dirname, "..");
const workspaceGlobs = ["apps", "packages", "workers"];
const requiredScripts = ["build", "typecheck", "test", "clean"];
const publicPackages = new Set([
  "@eventrail/types",
  "@eventrail/platform",
  "@eventrail/api-client",
  "@eventrail/react",
]);
const manifests = [];

for (const group of workspaceGlobs) {
  const entries = await readdir(resolve(root, group), { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const path = resolve(root, group, entry.name, "package.json");
    manifests.push({ path, manifest: JSON.parse(await readFile(path, "utf8")) });
  }
}

const names = new Set();
const errors = [];
for (const { path, manifest } of manifests) {
  const relativePath = path.slice(root.length + 1).replaceAll("\\", "/");
  if (typeof manifest.name !== "string" || !manifest.name.startsWith("@eventrail/")) {
    errors.push(`${relativePath}: workspace name must use the @eventrail scope`);
  } else if (names.has(manifest.name)) {
    errors.push(`${relativePath}: duplicate workspace name ${manifest.name}`);
  } else {
    names.add(manifest.name);
  }
  if (publicPackages.has(manifest.name)) {
    if (manifest.private !== false) errors.push(`${relativePath}: reviewed SDK package must be publishable`);
    if (manifest.publishConfig?.access !== "public" || manifest.publishConfig?.provenance !== true) {
      errors.push(`${relativePath}: public package must publish with public access and provenance`);
    }
  } else if (manifest.private !== true)
    errors.push(`${relativePath}: non-release workspace must remain private`);
  for (const script of requiredScripts) {
    if (typeof manifest.scripts?.[script] !== "string")
      errors.push(`${relativePath}: missing ${script} script`);
  }
  for (const [section, dependencies] of Object.entries({
    dependencies: manifest.dependencies,
    devDependencies: manifest.devDependencies,
    peerDependencies: manifest.peerDependencies,
  })) {
    for (const [dependency, version] of Object.entries(dependencies ?? {})) {
      if (dependency.startsWith("@eventrail/") && version !== "workspace:*") {
        errors.push(`${relativePath}: ${section}.${dependency} must use workspace:*`);
      }
    }
  }
  for (const exported of Object.values(manifest.exports ?? {})) {
    if (typeof exported !== "object" || exported === null) continue;
    for (const target of Object.values(exported)) {
      if (typeof target !== "string" || !target.startsWith("./dist/")) continue;
      const sourceTarget = target
        .replace("./dist/", "./src/")
        .replace(/\.d\.ts$/, ".ts")
        .replace(/\.js$/, ".ts");
      try {
        await stat(resolve(dirname(path), sourceTarget));
      } catch {
        errors.push(`${relativePath}: export ${target} has no source counterpart ${sourceTarget}`);
      }
    }
  }
}

if (errors.length > 0) {
  for (const error of errors) process.stderr.write(`${error}\n`);
  process.exit(1);
}

process.stdout.write(`Validated ${manifests.length} EventRail workspace manifests.\n`);
