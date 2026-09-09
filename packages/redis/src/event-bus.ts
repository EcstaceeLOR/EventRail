import { DataStreamEventSchema, type DataStreamEvent, type SomniaNetwork } from "@eventrail/types";

export interface RedisStreamMessage {
  id: string;
  message: Record<string, string>;
}

export interface RedisStreamRead {
  name: string;
  messages: RedisStreamMessage[];
}

export interface RedisStreamClient {
  eval(script: string, options: { keys: string[]; arguments: string[] }): Promise<unknown>;
  xRead(
    streams: Array<{ key: string; id: string }>,
    options: { BLOCK: number; COUNT: number },
  ): Promise<RedisStreamRead[] | null>;
}

export interface EventBusRecord {
  cursor: string;
  event: DataStreamEvent;
}

export interface EventSubscriptionOptions {
  network: SomniaNetwork;
  cursor?: string;
  signal?: AbortSignal;
  blockMs?: number;
  batchSize?: number;
}

const PUBLISH_ONCE_SCRIPT = `
local inserted = redis.call('SET', KEYS[2], '1', 'NX', 'PX', ARGV[2])
if inserted == false then return false end
return redis.call('XADD', KEYS[1], 'MAXLEN', '~', ARGV[3], '*', 'event', ARGV[1])
`;

export class DreamDexEventBus {
  constructor(
    private readonly redis: RedisStreamClient,
    private readonly retentionMs = 86_400_000,
    private readonly maxLength = 100_000,
  ) {}

  async publish(eventInput: DataStreamEvent): Promise<string | null> {
    const event = DataStreamEventSchema.parse(eventInput);
    const result = await this.redis.eval(PUBLISH_ONCE_SCRIPT, {
      keys: [eventStreamKey(event.network), dedupeKey(event)],
      arguments: [JSON.stringify(event), this.retentionMs.toString(), this.maxLength.toString()],
    });
    return typeof result === "string" ? result : null;
  }

  async readBatch(
    network: SomniaNetwork,
    cursor = "0-0",
    options: { blockMs?: number; batchSize?: number } = {},
  ): Promise<readonly EventBusRecord[]> {
    const reads = await this.redis.xRead([{ key: eventStreamKey(network), id: cursor }], {
      BLOCK: options.blockMs ?? 10_000,
      COUNT: options.batchSize ?? 100,
    });
    if (!reads) return [];
    const seen = new Set<string>();
    const records: EventBusRecord[] = [];
    for (const read of reads) {
      for (const message of read.messages) {
        const serialized = message.message.event;
        if (!serialized) continue;
        const event = DataStreamEventSchema.parse(JSON.parse(serialized));
        if (seen.has(event.eventId)) continue;
        seen.add(event.eventId);
        records.push({ cursor: message.id, event });
      }
    }
    return records.sort(compareRecords);
  }

  async *subscribe(options: EventSubscriptionOptions): AsyncGenerator<EventBusRecord> {
    let cursor = options.cursor ?? "0-0";
    while (!options.signal?.aborted) {
      const records = await this.readBatch(options.network, cursor, {
        ...(options.blockMs === undefined ? {} : { blockMs: options.blockMs }),
        ...(options.batchSize === undefined ? {} : { batchSize: options.batchSize }),
      });
      for (const record of records) {
        if (options.signal?.aborted) return;
        cursor = record.cursor;
        yield record;
      }
    }
  }
}

export function eventStreamKey(network: SomniaNetwork): string {
  return `eventrail:v1:${network}:dreamdex:events`;
}

function dedupeKey(event: DataStreamEvent): string {
  return `eventrail:v1:${event.network}:dreamdex:event-dedupe:${encodeURIComponent(event.eventId)}`;
}

function compareRecords(left: EventBusRecord, right: EventBusRecord): number {
  const leftBlock = BigInt(left.event.sourceBlock);
  const rightBlock = BigInt(right.event.sourceBlock);
  if (leftBlock !== rightBlock) return leftBlock < rightBlock ? -1 : 1;
  const leftLog = BigInt(left.event.logIndex ?? left.event.sequence);
  const rightLog = BigInt(right.event.logIndex ?? right.event.sequence);
  if (leftLog !== rightLog) return leftLog < rightLog ? -1 : 1;
  return left.event.eventId.localeCompare(right.event.eventId);
}
