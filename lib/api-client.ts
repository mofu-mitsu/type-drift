const PRIMARY_API = process.env.NEXT_PUBLIC_API_URL || "https://type-drift-api.onrender.com";
const FALLBACK_API = process.env.NEXT_PUBLIC_FALLBACK_API_URL;

/** Render stays primary. Only transport errors and server errors move the request to Cloudflare. */
export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const targets = [PRIMARY_API, FALLBACK_API].filter((value, index, all): value is string => Boolean(value) && all.indexOf(value) === index);
  let lastError: unknown;
  let lastResponse: Response | undefined;

  for (const base of targets) {
    try {
      const response = await fetch(`${base.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`, init);
      if (response.ok || response.status < 500 || base === targets[targets.length - 1]) return response;
      lastResponse = response;
    } catch (error) {
      lastError = error;
    }
  }

  if (lastResponse) return lastResponse;
  throw lastError ?? new Error("API is unavailable");
}

