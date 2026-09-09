const generatedPathPattern = /(^|\/)(?:\.next|\.turbo|coverage|dist|node_modules)(?:\/|$)/;
const sensitiveEnvironmentPattern = /(^|\/)\.env(?:\..+)?$/;

const secretPatterns = [
  { name: "private-key block", pattern: /-----BEGIN (?:EC |OPENSSH |RSA )?PRIVATE KEY-----/ },
  { name: "GitHub token", pattern: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/ },
  { name: "AWS access key", pattern: /\bAKIA[0-9A-Z]{16}\b/ },
  {
    name: "assigned secret",
    pattern:
      /\b(?:api[_-]?key|private[_-]?key|secret[_-]?key|mnemonic|seed[_-]?phrase)\s*[:=]\s*["'][^"'\r\n]{12,}["']/i,
  },
  {
    name: "Ethereum private key",
    pattern: /\b(?:private[_-]?key|signer[_-]?key)\s*[:=]\s*["']0x[a-fA-F0-9]{64}["']/i,
  },
];

export function pathViolation(file) {
  const normalized = file.replaceAll("\\", "/");
  if (generatedPathPattern.test(normalized)) return "generated build output";
  if (sensitiveEnvironmentPattern.test(normalized) && !normalized.endsWith(".env.example")) {
    return "sensitive environment file";
  }
  if (/\.(?:log|pem|p12|pfx)$/i.test(normalized)) return "sensitive or generated file type";
  return null;
}

export function contentViolations(content) {
  return secretPatterns.filter(({ pattern }) => pattern.test(content)).map(({ name }) => name);
}
