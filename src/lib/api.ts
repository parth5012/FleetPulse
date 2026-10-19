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

export interface MetricStatRange {
  avg_percent: number;
  min_percent?: number;
  max_percent?: number;
  avg_bytes?: number;
}

export interface LoadStatRange {
  avg_1m: number;
  max_1m: number;
  avg_5m: number;
  avg_15m: number;
}

export interface SystemStatsResponse {
  timeframe_hours: number;
  sample_count: number;
  start_time: string | null;
  end_time: string | null;
  memory: MetricStatRange;
  cpu: MetricStatRange;
  load: LoadStatRange;
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

export async function fetchSystemStats(hours = 24): Promise<SystemStatsResponse> {
  const res = await fetch(`${getApiBase()}/api/system/stats?hours=${hours}`);
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

// ---------------------------------------------------------------------------
// Network Inspector (Tailscale & Listening Sockets)
// ---------------------------------------------------------------------------
export interface TailscaleNode {
  hostname: string;
  dns_name: string;
  tailscale_ips: string[];
  os: string;
  online: boolean;
  rx_bytes?: number;
  tx_bytes?: number;
}

export interface TailscalePeer extends TailscaleNode {
  cur_addr: string;
  relay: string;
  is_direct: boolean;
  last_seen?: string | null;
  last_handshake?: string | null;
}

export interface TailscaleServeRoute {
  host: string;
  port: number;
  path: string;
  proxy_target: string;
}

export interface TailscaleStatusResponse {
  installed: boolean;
  backend_state: string;
  self_node: TailscaleNode;
  peers: TailscalePeer[];
  peer_count: number;
  serve_routes: TailscaleServeRoute[];
}

export interface SocketPort {
  protocol: 'tcp' | 'udp';
  state: string;
  local_address: string;
  port: number;
  exposure: 'localhost' | 'tailscale' | 'public';
  process: string;
  pid: number | null;
}

export interface PortsResponse {
  ports: SocketPort[];
  count: number;
}

export async function fetchTailscaleStatus(): Promise<TailscaleStatusResponse> {
  const res = await fetch(`${getApiBase()}/api/network/tailscale`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function fetchListeningPorts(): Promise<PortsResponse> {
  const res = await fetch(`${getApiBase()}/api/network/ports`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ---------------------------------------------------------------------------
// System Journal & Kernel Watcher
// ---------------------------------------------------------------------------
export interface JournalEntry {
  timestamp: string;
  priority_num: number;
  priority_label: string;
  unit: string;
  pid: number | null;
  message: string;
}

export interface JournalLogsResponse {
  logs: JournalEntry[];
  total: number;
  scope: string;
  unit?: string | null;
  priority?: string | null;
}

export interface PSIMetrics {
  avg10?: number;
  avg60?: number;
  avg300?: number;
  total?: number;
}

export interface KernelHealthResponse {
  oom_kill_count: number;
  memory_pressure: {
    some?: PSIMetrics;
    full?: PSIMetrics;
  };
  cpu_pressure: {
    some?: PSIMetrics;
    full?: PSIMetrics;
  };
  io_pressure?: {
    some?: PSIMetrics;
    full?: PSIMetrics;
  };
}

export async function fetchJournalLogs(
  scope = 'user',
  unit?: string,
  priority?: string,
  search?: string,
  limit = 100
): Promise<JournalLogsResponse> {
  const params = new URLSearchParams({ scope, limit: String(limit) });
  if (unit) params.set('unit', unit);
  if (priority) params.set('priority', priority);
  if (search) params.set('search', search);

  const res = await fetch(`${getApiBase()}/api/journal/logs?${params}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function fetchKernelHealth(): Promise<KernelHealthResponse> {
  const res = await fetch(`${getApiBase()}/api/journal/kernel`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ---------------------------------------------------------------------------
// Remote Maintenance & Shortcuts
// ---------------------------------------------------------------------------
export interface DockerDfItem {
  type: string;
  total: string;
  active: string;
  size: string;
  reclaimable: string;
}

export interface DiskRootDf {
  total_bytes: number;
  used_bytes: number;
  free_bytes: number;
  used_percent: number;
}

export interface MaintenanceDfResponse {
  docker: DockerDfItem[];
  disk_root: DiskRootDf;
}

export async function fetchMaintenanceDf(): Promise<MaintenanceDfResponse> {
  const res = await fetch(`${getApiBase()}/api/maintenance/df`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function triggerDockerPrune(): Promise<{ success: boolean; reclaimed_space: string; output: string }> {
  const res = await fetch(`${getApiBase()}/api/maintenance/docker/prune`, { method: 'POST' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function triggerJournalVacuum(time = '3d'): Promise<{ success: boolean; output: string }> {
  const res = await fetch(`${getApiBase()}/api/maintenance/journal/vacuum`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ time }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function triggerServiceRestartShortcut(unit: string): Promise<{ success: boolean; unit: string; message: string }> {
  const res = await fetch(`${getApiBase()}/api/maintenance/services/restart`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ unit }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `HTTP ${res.status}`);
  }
  return res.json();
}
