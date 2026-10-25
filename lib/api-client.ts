const PRIMARY_API = process.env.NEXT_PUBLIC_API_URL || "https://type-drift-api.onrender.com";
const FALLBACK_API = process.env.NEXT_PUBLIC_FALLBACK_API_URL || "https://type-drift-api-fallback.mitsuki-momoka.workers.dev";

/** These endpoints are implemented by the Neon-backed Worker; prefer it directly to avoid noisy Render 429/CORS preflights. */
function isWorkerRoute(path: string, init?: RequestInit) {
  const method = (init?.method || "GET").toUpperCase();
  const pathname = path.split("?", 1)[0].replace(/\/+$/, "") || "/";
  if (pathname === "/api/bottles") return method === "GET" || method === "POST";
  if (/^\/api\/bottles\/\d+$/.test(pathname)) return method === "DELETE";
  if (/^\/api\/bottles\/\d+\/(reactions|replies|votes)$/.test(pathname)) return method === "GET" || method === "POST";
  if (/^\/api\/replies\/\d+\/reactions$/.test(pathname)) return method === "POST";
  if (pathname === "/api/notifications/unread") return method === "GET";
  if (pathname === "/api/notifications/read-all" || /^\/api\/notifications\/\d+\/read$/.test(pathname)) return method === "POST";
  if (pathname === "/api/consultations") return method === "GET";
  if (pathname === "/api/consultations/events" || pathname === "/api/activity-events" || pathname === "/api/feedback") return method === "POST";
  if (pathname === "/api/question-prompts" || pathname === "/api/plaza/chain" || pathname === "/api/plaza/messages") return method === "GET" || method === "POST";
  if (pathname === "/api/direct-messages") return method === "GET";
  if (/^\/api\/direct-messages\/\d+\/read$/.test(pathname)) return method === "POST";
  if (/^\/api\/presence\/(join|heartbeat|leave)$/.test(pathname)) return method === "POST";
  if (pathname === "/api/presence/online") return method === "GET";
  if (pathname === "/api/worm/ranking") return method === "GET" || method === "POST";
  return false;
}

/** Worker-backed routes go to Cloudflare first; remaining routes keep Render as primary with fallback. */
export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const configured = [PRIMARY_API, FALLBACK_API].filter((value, index, all): value is string => Boolean(value) && all.indexOf(value) === index);
  const targets = isWorkerRoute(path, init) ? [...configured].reverse() : configured;
  let lastError: unknown;
  let lastResponse: Response | undefined;

  for (const base of targets) {
    try {
      const response = await fetch(`${base.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`, init);
      if (response.ok || response.status < 500 || base === targets[targets.length - 1]) return response;
      console.warn(`[Type Drift API] ${base} returned ${response.status}; retrying with ${targets[targets.indexOf(base) + 1]}`);
      lastResponse = response;
    } catch (error) {
      const next = targets[targets.indexOf(base) + 1];
      if (next) console.warn(`[Type Drift API] ${base} failed; retrying with ${next}`, error);
      else console.error(`[Type Drift API] ${base} and all fallback APIs failed`, error);
      lastError = error;
    }
  }

  if (lastResponse) return lastResponse;
  throw lastError ?? new Error("API is unavailable");
}


