import { EventRailApiError } from "@eventrail/api-client";

const maximumRetryCount = 5;

export function shouldRetryGatewayQuery(failureCount: number, error: unknown): boolean {
  if (
    error instanceof EventRailApiError &&
    error.status >= 400 &&
    error.status < 500 &&
    error.status !== 408 &&
    error.status !== 429
  ) {
    return false;
  }
  return failureCount < maximumRetryCount;
}

export function gatewayRetryDelay(attempt: number): number {
  return Math.min(1_000 * 2 ** attempt, 8_000);
}

export function offlineRecoveryInterval(query: { state: { status: string } }): number | false {
  return query.state.status === "error" ? 5_000 : false;
}
