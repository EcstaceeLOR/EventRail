import assert from "node:assert/strict";
import test from "node:test";
import { validateDeployment } from "../deployment-policy.mjs";

const valid = {
  dockerfile: "USER node\n",
  deployments: '(eq $name "gateway") (not $component.public)\nrunAsNonRoot: true\nmaxUnavailable: 0',
  "values-preview": "environment: preview\nruntimeSecretName: preview-secret",
  "values-staging": "environment: staging\nruntimeSecretName: staging-secret",
  "values-production": "environment: production\nruntimeSecretName: production-secret",
};
test("accepts an isolated, non-root, available deployment", () =>
  assert.deepEqual(validateDeployment(valid), []));
test("rejects shared secrets and root containers", () => {
  const failures = validateDeployment({
    ...valid,
    dockerfile: "USER root\n",
    "values-production": valid["values-staging"],
  }).join("\n");
  assert.match(failures, /non-root/);
  assert.match(failures, /production: environment label/);
  assert.match(failures, /distinct runtime secret/);
});
