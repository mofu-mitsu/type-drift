export function getGuestKey() {
  if (typeof window === 'undefined') return '';
  let key = localStorage.getItem('type-drift-guest-key');
  if (!key) {
    key = crypto.randomUUID();
    localStorage.setItem('type-drift-guest-key', key);
  }
  return key;
}

export function logActivity(eventType: string, payload: Record<string, unknown> = {}, entity?: { type?: string; id?: string | number }) {
  const api = process.env.NEXT_PUBLIC_API_URL;
  if (!api || typeof window === 'undefined') return;
  void fetch(`${api}/api/activity-events`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', 'X-Guest-Key': getGuestKey() },
    body: JSON.stringify({ event_type: eventType, entity_type: entity?.type, entity_id: entity?.id == null ? undefined : String(entity.id), payload }),
    keepalive: true,
  }).catch(() => undefined);
}

export function logConsultation(entry: { externalId: string; parentExternalId?: string; entryType: 'thread' | 'reply' | 'followup'; category?: string; body?: string; payload?: Record<string, unknown> }) {
  const api = process.env.NEXT_PUBLIC_API_URL;
  if (!api || typeof window === 'undefined') return;
  void fetch(`${api}/api/consultations/events`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', 'X-Guest-Key': getGuestKey() },
    body: JSON.stringify({ external_id: entry.externalId, parent_external_id: entry.parentExternalId, entry_type: entry.entryType, category: entry.category, body: entry.body, payload: entry.payload }),
    keepalive: true,
  }).catch(() => undefined);
}
