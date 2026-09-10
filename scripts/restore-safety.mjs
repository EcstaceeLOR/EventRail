export function assertSafeRestore(source, target) {
  const sourceUrl = new URL(source);
  const targetUrl = new URL(target);
  if (sourceUrl.href === targetUrl.href) throw new Error("restore target must differ from the source");
  if (!targetUrl.pathname.endsWith("_restore_drill"))
    throw new Error("restore target database must end with _restore_drill");
  if (
    !["localhost", "127.0.0.1"].includes(targetUrl.hostname) &&
    process.env.ALLOW_REMOTE_RESTORE_DRILL !== "true"
  ) {
    throw new Error("remote restore drills require ALLOW_REMOTE_RESTORE_DRILL=true");
  }
}
