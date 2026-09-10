const environments = ["preview", "staging", "production"];

export function validateDeployment(files) {
  const failures = [];
  const deployments = files.deployments ?? "";
  if (!deployments.includes('(eq $name "gateway") (not $component.public)'))
    failures.push("runtime secrets need the backend-only template guard");
  if (!files.dockerfile?.match(/^USER node$/m))
    failures.push("container runtime must use the non-root node user");
  if (!deployments.includes("runAsNonRoot: true")) failures.push("pods must require a non-root user");
  if (!deployments.includes("maxUnavailable: 0")) failures.push("rolling deploys must preserve availability");
  const secrets = environments.map((environment) => {
    const values = files[`values-${environment}`] ?? "";
    const match = values.match(/^runtimeSecretName:\s*(\S+)$/m);
    if (!values.includes(`environment: ${environment}`))
      failures.push(`${environment}: environment label is missing`);
    if (!match) failures.push(`${environment}: runtime secret name is missing`);
    return match?.[1];
  });
  if (new Set(secrets.filter(Boolean)).size !== environments.length)
    failures.push("each environment must use a distinct runtime secret");
  return failures;
}
