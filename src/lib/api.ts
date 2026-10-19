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

function getApiBase(): string {
  if (typeof window !== 'undefined' && window.location.pathname.startsWith('/dashboard')) {
    return '/dashboard';
  }
  return '';
}

export async function fetchLimits(refresh = false): Promise<AntigravitySnapshot> {
  const url = `${getApiBase()}/api/antigravity/limits?format=json${refresh ? '&refresh=true' : ''}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function syncOmniRoute(): Promise<unknown> {
  const res = await fetch(`${getApiBase()}/api/antigravity/sync`, { method: 'POST' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ---------------------------------------------------------------------------
// System Metrics (Beszel-style)
// ---------------------------------------------------------------------------
export interface CPUMetrics {
  total_percent: number;
  per_core: number[];
  frequency_mhz?: number | null;
  core_count_logical: number;
  core_count_physical: number;
}

export interface MemoryMetrics {
  total_bytes: number;
  available_bytes: number;
  used_bytes: number;
  used_percent: number;
  swap_total_bytes: number;
  swap_used_bytes: number;
  swap_used_percent: number;
}

export interface DiskPartition {
  device: string;
  mountpoint: string;
  fstype: string;
  total_bytes: number;
  used_bytes: number;
  free_bytes: number;
  used_percent: number;
}

export interface DiskMetrics {
  total_bytes: number;
  used_bytes: number;
  free_bytes: number;
  used_percent: number;
  read_bytes_per_sec: number;
  write_bytes_per_sec: number;
  partitions: DiskPartition[];
}

export interface NetworkMetrics {
  bytes_sent_per_sec: number;
  bytes_recv_per_sec: number;
  packets_sent_per_sec: number;
  packets_recv_per_sec: number;
}

export interface HostInfo {
  hostname: string;
  platform: string;
  os_release: string;
  kernel: string;
  architecture: string;
  uptime_seconds: number;
  boot_time: string;
  process_count: number;
}

export interface SystemSnapshot {
  timestamp: string;
  cpu: CPUMetrics;
  memory: MemoryMetrics;
  disk: DiskMetrics;
  network: NetworkMetrics;
  host: HostInfo;
  load_avg: number[];
}

export interface SystemHistoryPoint {
  timestamp: string;
  cpu: number;
  memory: number;
  disk_read_kb: number;
  disk_write_kb: number;
  net_rx_kb: number;
  net_tx_kb: number;
}

export async function fetchSystemMetrics(): Promise<SystemSnapshot> {
  const res = await fetch(`${getApiBase()}/api/system/metrics`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function fetchSystemHistory(): Promise<{ history: SystemHistoryPoint[] }> {
  const res = await fetch(`${getApiBase()}/api/system/history`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ---------------------------------------------------------------------------
// Container & Logs (Dozzel-style)
// ---------------------------------------------------------------------------
export interface ContainerSummary {
  id: string;
  name: string;
  image: string;
  status: string;
  state: string;
  created: string;
  ports: string;
  cpu_percent: number;
  mem_usage: string;
  mem_percent: number;
  net_io: string;
  block_io: string;
  pids: number;
}

export interface LogLine {
  timestamp?: string | null;
  level: string;
  stream: string;
  message: string;
}

export interface LogResponse {
  container: string;
  lines: LogLine[];
  total: number;
}

export async function fetchContainers(): Promise<{ containers: ContainerSummary[] }> {
  const res = await fetch(`${getApiBase()}/api/containers`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function fetchContainerLogs(
  idOrName: string,
  tail = 100,
  timestamps = true,
  search?: string
): Promise<LogResponse> {
  const params = new URLSearchParams({
    tail: String(tail),
    timestamps: String(timestamps),
  });
  if (search) params.set('search', search);
  const res = await fetch(`${getApiBase()}/api/containers/${encodeURIComponent(idOrName)}/logs?${params}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function triggerContainerAction(
  idOrName: string,
  action: string
): Promise<{ success: boolean; message?: string; error?: string }> {
  const res = await fetch(`${getApiBase()}/api/containers/${encodeURIComponent(idOrName)}/action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ---------------------------------------------------------------------------
// Tasks & Processes (btop / Task Manager style)
// ---------------------------------------------------------------------------
export interface TaskItem {
  pid: number;
  name: string;
  username: string;
  status: string;
  cpu_percent: number;
  memory_bytes: number;
  memory_percent: number;
  memory_formatted: string;
  num_threads: number;
  create_time: number;
  cmdline: string;
  nice: number;
}

export interface TasksOverview {
  total_processes: number;
  running: number;
  sleeping: number;
  other: number;
  total_threads: number;
  cpu_total_percent: number;
  memory_used_percent: number;
}

export interface TasksResponse {
  tasks: TaskItem[];
  overview: TasksOverview;
  timestamp: string;
}

export async function fetchTasks(
  sortBy = 'cpu',
  order = 'desc',
  limit = 100,
  search?: string
): Promise<TasksResponse> {
  const params = new URLSearchParams({
    sort_by: sortBy,
    order: order,
    limit: String(limit),
  });
  if (search) params.set('search', search);
  const res = await fetch(`${getApiBase()}/api/tasks?${params}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function triggerTaskAction(
  pid: number,
  action: 'terminate' | 'kill'
): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`${getApiBase()}/api/tasks/${pid}/action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ---------------------------------------------------------------------------
// System Services (systemd User & System Scope)
// ---------------------------------------------------------------------------
export interface ServiceItem {
  unit: string;
  name: string;
  description: string;
  scope: 'user' | 'system';
  load_state: string;
  active_state: string;
  sub_state: string;
  main_pid: number;
  memory_bytes: number;
  memory_percent: number;
  memory_formatted: string;
  cpu_percent: number;
  cpu_usage_nsec: number;
}

export interface ServicesOverview {
  total_services: number;
  running_services: number;
  failed_services: number;
  user_services: number;
  system_services: number;
  total_memory_bytes: number;
  total_memory_formatted: string;
}

export interface ServicesResponse {
  services: ServiceItem[];
  overview: ServicesOverview;
  timestamp: string;
}

export async function fetchServices(
  scope = 'all',
  state = 'all',
  sortBy = 'cpu',
  order = 'desc',
  limit = 150,
  search?: string
): Promise<ServicesResponse> {
  const params = new URLSearchParams({
    scope,
    state,
    sort_by: sortBy,
    order,
    limit: String(limit),
  });
  if (search) params.set('search', search);
  const res = await fetch(`${getApiBase()}/api/services?${params}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function triggerServiceAction(
  scope: 'user' | 'system',
  unit: string,
  action: 'restart' | 'start' | 'stop'
): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`${getApiBase()}/api/services/${scope}/${encodeURIComponent(unit)}/action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
