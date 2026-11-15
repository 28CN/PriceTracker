import { IncomingMessage, ServerResponse } from 'node:http';

const KEY = Symbol.for('pricetracker.serverTiming.pending');
const pending: Map<string, string> =
  (globalThis as unknown as Record<symbol, Map<string, string>>)[KEY] ??
  ((globalThis as unknown as Record<symbol, Map<string, string>>)[KEY] = new Map());

export function rememberServerTiming(requestId: string, value: string) {
  if (!requestId) return;
  if (pending.size > 50) pending.clear();
  pending.set(requestId, value);
}

/** Attach the header recorded for this request when Node sends the page. */
export function installServerTiming() {
  const proto = ServerResponse.prototype as ServerResponse & { __ptTiming?: boolean };
  if (proto.__ptTiming) return;
  proto.__ptTiming = true;
  const apply = function apply(this: ServerResponse) {
    const id = (this.req as IncomingMessage | undefined)?.headers['x-pt-req'];
    const value = typeof id === 'string' ? pending.get(id) : undefined;
    if (typeof id === 'string') pending.delete(id);
    if (value && !this.headersSent) this.setHeader('Server-Timing', value);
  };
  const originalHead = proto.writeHead;
  proto.writeHead = function writeHead(this: ServerResponse, ...args: unknown[]) {
    apply.call(this);
    return originalHead.apply(this, args as Parameters<typeof originalHead>);
  } as typeof proto.writeHead;
  const originalEnd = proto.end;
  proto.end = function end(this: ServerResponse, ...args: unknown[]) {
    apply.call(this);
    return originalEnd.apply(this, args as Parameters<typeof originalEnd>);
  } as typeof proto.end;
}
