export interface Env {
  WORM_WORLD: DurableObjectNamespace;
}

type Player = {
  clientId: string;
  name: string;
  emoji: string;
  body: string;
  x: number;
  y: number;
  dirX: number;
  dirY: number;
  score: number;
  length: number;
  isAlive: boolean;
};

type Client = { ws: WebSocket; clientId: string | null };

const MAX_CLIENT_ID = 80;
const MAX_NAME = 80;
const MAX_BODY = 16;
const BROADCAST_MS = 50;

function json(data: unknown): string {
  return JSON.stringify(data);
}

function clampNumber(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function publicPlayer(data: Record<string, unknown>): Player {
  return {
    clientId: String(data.clientId || '').slice(0, MAX_CLIENT_ID),
    name: String(data.name || '匿名の芋虫').slice(0, MAX_NAME),
    emoji: String(data.emoji || '🐛').slice(0, 4),
    body: String(data.body || '🟢').slice(0, MAX_BODY),
    x: clampNumber(data.x),
    y: clampNumber(data.y),
    dirX: clampNumber(data.dirX),
    dirY: clampNumber(data.dirY),
    score: Math.max(0, clampNumber(data.score)),
    length: Math.max(3, clampNumber(data.length, 3)),
    isAlive: data.isAlive !== false,
  };
}

export class WormWorld {
  private state: DurableObjectState;
  private clients = new Map<WebSocket, Client>();
  private players = new Map<string, Player>();
  private broadcastTimer: number | undefined;

  constructor(state: DurableObjectState) {
    this.state = state;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname !== '/ws') return new Response('not found', { status: 404 });
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
      return new Response('expected websocket', { status: 426 });
    }

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    server.accept();

    const record: Client = { ws: server, clientId: null };
    this.clients.set(server, record);
    server.addEventListener('message', event => this.onMessage(record, event.data));
    server.addEventListener('close', () => this.onClose(record));
    server.addEventListener('error', () => this.onClose(record));

    server.send(json({
      type: 'world',
      playerCount: this.players.size,
      worms: [...this.players.values()],
      sentAt: Date.now(),
    }));

    this.ensureBroadcastLoop();
    return new Response(null, { status: 101, webSocket: client });
  }

  private onMessage(client: Client, raw: string | ArrayBuffer | ArrayBufferView): void {
    try {
      const text = typeof raw === 'string'
        ? raw
        : raw instanceof ArrayBuffer
          ? new TextDecoder().decode(raw)
          : new TextDecoder().decode(raw.buffer);
      const message = JSON.parse(text) as Record<string, unknown>;
      if (message.type !== 'player') return;

      const player = publicPlayer(message);
      if (!player.clientId) return;

      if (client.clientId && client.clientId !== player.clientId) {
        this.players.delete(client.clientId);
      }
      client.clientId = player.clientId;
      this.players.set(player.clientId, player);
      this.broadcastWorld();
    } catch {
      // Ignore malformed client messages to keep the relay alive.
    }
  }

  private onClose(client: Client): void {
    this.clients.delete(client.ws);
    if (client.clientId) this.players.delete(client.clientId);
    if (this.clients.size === 0) {
      if (this.broadcastTimer !== undefined) clearInterval(this.broadcastTimer);
      this.broadcastTimer = undefined;
    }
  }

  private ensureBroadcastLoop(): void {
    if (this.broadcastTimer !== undefined) return;
    this.broadcastTimer = setInterval(() => this.broadcastWorld(), BROADCAST_MS) as unknown as number;
  }

  private broadcastWorld(): void {
    const payload = json({
      type: 'world',
      playerCount: this.players.size,
      worms: [...this.players.values()],
      sentAt: Date.now(),
    });
    for (const [ws, client] of this.clients) {
      if (ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(payload);
        } catch {
          this.onClose(client);
        }
      }
    }
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname !== '/ws') return new Response('not found', { status: 404 });
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
      return new Response('expected websocket', { status: 426 });
    }

    const id = env.WORM_WORLD.idFromName('global');
    return env.WORM_WORLD.get(id).fetch(request);
  },
};
