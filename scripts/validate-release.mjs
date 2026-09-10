import { readFile } from "node:fs/promises";
import process from "node:process";

const tag = process.env.RELEASE_TAG ?? process.argv[2];
if (!tag || !/^v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(tag))
  throw new Error("RELEASE_TAG must be a semantic version beginning with v");
const version = tag.slice(1);
for (const path of ["packages/types", "packages/platform", "packages/api-client", "packages/react"]) {
  const manifest = JSON.parse(await readFile(new URL(`../${path}/package.json`, import.meta.url), "utf8"));
  if (manifest.version !== version)
    throw new Error(`${manifest.name} is ${manifest.version}; expected ${version}`);
  if (manifest.private) throw new Error(`${manifest.name} is private`);
}
const changelog = await readFile(new URL("../CHANGELOG.md", import.meta.url), "utf8");
if (!changelog.includes(`## ${version}`)) throw new Error(`CHANGELOG.md has no ${version} section`);
console.log(`Release ${tag}: OK`);
