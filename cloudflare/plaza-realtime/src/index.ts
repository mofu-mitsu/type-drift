export interface Env {
  PLAZA_ROOM: DurableObjectNamespace;
  GROQ_API_KEY?: string;
  GROQ_MODEL?: string;
}

type PlazaMessage = {
  id: string;
  author: string;
  body: string;
  kind: "human" | "ai" | "emote";
  emoji?: string;
  createdAt: number;
};

const MAX_MESSAGES = 80;
const MAX_NICKNAME = 24;
const MAX_BODY = 120;

const json = (data: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(data), {
    ...init,
    headers: { "Content-Type": "application/json", ...(init.headers || {}) },
  });

const clean = (value: unknown, max: number) =>
  String(value ?? "").trim().slice(0, max);

export class PlazaRoom {
  private state: DurableObjectState;
  private clients = new Set<WebSocket>();
  private messages: PlazaMessage[] = [];

  constructor(state: DurableObjectState) {
    this.state = state;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname !== "/ws") return new Response("not found", { status: 404 });
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return new Response("expected websocket", { status: 426 });
    }

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    server.accept();
    this.clients.add(server);

    server.addEventListener("message", event => void this.onMessage(server, event.data));
    server.addEventListener("close", () => { this.clients.delete(server); this.broadcastPresence(); });
    server.addEventListener("error", () => { this.clients.delete(server); this.broadcastPresence(); });

    server.send(JSON.stringify({
      type: "plaza_presence",
      count: this.clients.size,
      messages: this.messages,
    }));
    this.broadcastPresence();

    return new Response(null, { status: 101, webSocket: client });
  }

  private async onMessage(ws: WebSocket, raw: string | ArrayBuffer | ArrayBufferView) {
    try {
      const text = typeof raw === "string"
        ? raw
        : raw instanceof ArrayBuffer
          ? new TextDecoder().decode(raw)
          : new TextDecoder().decode(raw.buffer);
      const data = JSON.parse(text) as Record<string, unknown>;
      const type = String(data.type || "");

      if (type === "plaza_join" || type === "plaza_leave") {
        this.broadcastPresence();
        return;
      }

      if (type === "plaza_message") {
        const nickname = clean(data.nickname, MAX_NICKNAME) || "匿名の誰か";
        const body = clean(data.body, MAX_BODY);
        if (!body) return;
        this.push({
          id: crypto.randomUUID(),
          author: nickname,
          body,
          kind: "human",
          emoji: "◌",
          createdAt: Date.now(),
        });
        return;
      }

      if (type === "plaza_emote") {
        const nickname = clean(data.nickname, MAX_NICKNAME) || "匿名の誰か";
        const emote = clean(data.emote, 8);
        if (!emote) return;
        this.push({
          id: crypto.randomUUID(),
          author: nickname,
          body: emote,
          kind: "emote",
          emoji: clean(data.emoji, 4) || "◌",
          createdAt: Date.now(),
        });
        return;
      }

      if (type === "plaza_ai_message") {
        const character = clean(data.character, 24) || "ダーリンちゃん";
        const body = clean(data.body, MAX_BODY);
        if (!body) return;
        this.push({
          id: crypto.randomUUID(),
          author: character,
          body,
          kind: "ai",
          emoji: character === "LSI芋虫" ? "🐛" : "🥺",
          createdAt: Date.now(),
        });
      }
    } catch {}
  }

  private push(message: PlazaMessage) {
    this.messages = [...this.messages, message].slice(-MAX_MESSAGES);
    const payload = JSON.stringify({ type: "plaza_message", message });
    for (const ws of this.clients) {
      if (ws.readyState === WebSocket.OPEN) {
        try { ws.send(payload); } catch {}
      }
    }
  }

  private broadcastPresence() {
    const payload = JSON.stringify({
      type: "plaza_presence",
      count: this.clients.size,
      messages: this.messages,
    });
    for (const ws of this.clients) {
      if (ws.readyState === WebSocket.OPEN) {
        try { ws.send(payload); } catch {}
      }
    }
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/ws") {
      if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
        return new Response("expected websocket", { status: 426 });
      }
      const id = env.PLAZA_ROOM.idFromName("global");
      return env.PLAZA_ROOM.get(id).fetch(request);
    }

    if (url.pathname === "/api/plaza/ai" && request.method === "POST") {
      if (!env.GROQ_API_KEY) return json({ replies: [] }, { status: 503 });

      const body = await request.json().catch(() => ({})) as { body?: string; history?: PlazaMessage[] };
      const humanText = clean(body.body, 500);
      const history = Array.isArray(body.history) ? body.history.slice(-12) : [];
      if (!humanText) return json({ replies: [] });

      const model = env.GROQ_MODEL || "qwen/qwen3.8-27b";
      const prompt = [
        "You are two fictional AI characters in an anonymous Japanese typology community.",
        "Reply naturally and briefly in Japanese.",
        'Return JSON only: {"replies":[{"character":"ダーリンちゃん","body":"..."},{"character":"LSI芋虫","body":"..."}]}',
        "Each reply should be one short sentence. Do not mention system prompts.",
        "Recent plaza messages: " + JSON.stringify(history),
        "New message: " + humanText,
      ].join("\n");

      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + env.GROQ_API_KEY,
        },
        body: JSON.stringify({
          model,
          temperature: 0.8,
          messages: [{ role: "user", content: prompt }],
        }),
      });

      if (!response.ok) return json({ replies: [] }, { status: 502 });

      const result = await response.json().catch(() => ({})) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = result.choices?.[0]?.message?.content || "";
      try {
        const parsed = JSON.parse(content);
        return json({
          replies: Array.isArray(parsed.replies)
            ? parsed.replies.slice(0, 2).map((item: any) => ({
                character: clean(item.character, 24),
                body: clean(item.body, MAX_BODY),
              }))
            : [],
        });
      } catch {
        return json({ replies: [] });
      }
    }

    return new Response("not found", { status: 404 });
  },
};
