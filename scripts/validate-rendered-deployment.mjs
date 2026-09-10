import { readFile } from "node:fs/promises";

const path = process.argv[2];
if (!path) throw new Error("rendered manifest path is required");
const documents = (await readFile(path, "utf8")).split(/^---\s*$/m);
for (const component of ["web", "developer-portal", "examples"]) {
  const deployment = documents.find(
    (document) =>
      /^kind:\s*Deployment$/m.test(document) && new RegExp(`^\\s*name: .*-${component}$`, "m").test(document),
  );
  if (!deployment) throw new Error(`rendered ${component} deployment is missing`);
  if (deployment.includes("secretRef:")) throw new Error(`${component} deployment receives a runtime secret`);
}
for (const component of ["gateway", "market-sync", "receipts", "settlement", "webhooks"]) {
  const deployment = documents.find(
    (document) =>
      /^kind:\s*Deployment$/m.test(document) && new RegExp(`^\\s*name: .*-${component}$`, "m").test(document),
  );
  if (!deployment?.includes("secretRef:"))
    throw new Error(`${component} deployment is missing its runtime secret`);
}
console.log("Rendered workload secret boundary: OK");
