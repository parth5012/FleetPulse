export interface QuotaBucket {
  bucketId?: string;
  displayName?: string;
  window?: string;
  remainingFraction?: number;
  resetTime?: string | null;
  description?: string | null;
  disabled?: boolean;
}
export interface QuotaGroup {
  displayName?: string;
  description?: string | null;
  buckets?: QuotaBucket[];
}
export interface FamilySummary {
  family: string;
  window: string;
  remaining: number;
  resetTime?: string | null;
  exhausted?: boolean;
  models?: string[];
}
export interface QuotaEntry {
  model: string;
  family: string;
  window: string;
  remaining: number;
  resetTime?: string | null;
}
export interface AccountSnapshot {
  account_id: string;
  families?: FamilySummary[];
  models?: QuotaEntry[];
  groups?: QuotaGroup[];
  error?: string | null;
}
export interface AntigravitySnapshot {
  accounts: AccountSnapshot[];
  cached?: boolean;
  timestamp: string;
  error?: string | null;
}

export async function fetchLimits(refresh = false): Promise<AntigravitySnapshot> {
  const url = `/api/antigravity/limits?format=json${refresh ? '&refresh=true' : ''}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function syncOmniRoute(): Promise<unknown> {
  const res = await fetch('/api/antigravity/sync', { method: 'POST' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
