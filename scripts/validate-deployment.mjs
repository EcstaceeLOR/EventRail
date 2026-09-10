import { readFile } from "node:fs/promises";
import { validateDeployment } from "./deployment-policy.mjs";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const files = {
  dockerfile: await read("Dockerfile"),
  deployments: await read("deploy/helm/eventrail/templates/deployments.yaml"),
  "values-preview": await read("deploy/helm/eventrail/values-preview.yaml"),
  "values-staging": await read("deploy/helm/eventrail/values-staging.yaml"),
  "values-production": await read("deploy/helm/eventrail/values-production.yaml"),
};
const failures = validateDeployment(files);
if (failures.length) {
  console.error(failures.map((failure) => `- ${failure}`).join("\n"));
  process.exitCode = 1;
} else console.log("Deployment policy: OK");
