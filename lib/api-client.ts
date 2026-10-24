const PRIMARY_API = process.env.NEXT_PUBLIC_API_URL || "https://type-drift-api.onrender.com";
const FALLBACK_API = process.env.NEXT_PUBLIC_FALLBACK_API_URL || "https://type-drift-api-fallback.mitsuki-momoka.workers.dev";

/** Render stays primary. Only transport errors and server errors move the request to Cloudflare. */
export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const targets = [PRIMARY_API, FALLBACK_API].filter((value, index, all): value is string => Boolean(value) && all.indexOf(value) === index);
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
