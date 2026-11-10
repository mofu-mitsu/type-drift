import { apiFetch } from './api-client';

export function getGuestKey() {
  if (typeof window === 'undefined') return '';
  // Logged-in identities must never share the browser-wide guest key.
  // Keep a separate opaque key for each authenticated account, while preserving
  // the legacy anonymous key for users who are not signed in.
  const userKey = localStorage.getItem('type-drift-user-key');
  const storageKey = userKey
    ? `type-drift-guest-key:user:${userKey}`
    : 'type-drift-guest-key';
  let key = localStorage.getItem(storageKey);
  if (!key) {
    key = crypto.randomUUID();
    localStorage.setItem(storageKey, key);
  }
  return key;
}
export function logActivity(eventType: string, payload: Record<string, unknown> = {}, entity?: { type?: string; id?: string | number }) {
  if (typeof window === 'undefined') return;
  void apiFetch('/api/activity-events', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', 'X-Guest-Key': getGuestKey() },
    body: JSON.stringify({ event_type: eventType, entity_type: entity?.type, entity_id: entity?.id == null ? undefined : String(entity.id), payload }),
    keepalive: true,
  }).catch(() => undefined);
}

export function logConsultation(entry: { externalId: string; parentExternalId?: string; entryType: 'thread' | 'reply' | 'followup'; category?: string; body?: string; payload?: Record<string, unknown> }) {
  if (typeof window === 'undefined') return;
  void apiFetch('/api/consultations/events', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', 'X-Guest-Key': getGuestKey() },
    body: JSON.stringify({ external_id: entry.externalId, parent_external_id: entry.parentExternalId, entry_type: entry.entryType, category: entry.category, body: entry.body, payload: entry.payload }),
    keepalive: true,
  }).catch(() => undefined);
}

