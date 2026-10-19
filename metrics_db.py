"""
SQLite Persistence & Aggregation Engine for System Telemetry.
Stores historical metrics in WAL mode and computes rolling statistics
such as Average RAM usage, Peak RAM, Average Load (1m, 5m, 15m), and Peak Load.
"""

import os
import sqlite3
import threading
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional


DEFAULT_DB_PATH = Path(__file__).resolve().parent / "data" / "system_metrics.db"


class MetricsDatabase:
    """Thread-safe SQLite manager for system metrics and telemetry aggregations."""

    def __init__(self, db_path: Optional[str] = None):
        self.db_path = db_path if db_path is not None else os.getenv("METRICS_DB_PATH", str(DEFAULT_DB_PATH))
        self._lock = threading.Lock()
        self._is_memory = self.db_path == ":memory:" or self.db_path.startswith("file:")

        if not self._is_memory:
            db_dir = Path(self.db_path).parent
            db_dir.mkdir(parents=True, exist_ok=True)

        self._conn = sqlite3.connect(
            self.db_path,
            check_same_thread=False,
            timeout=10.0,
            uri=self.db_path.startswith("file:"),
        )
        self._conn.row_factory = sqlite3.Row
        self._init_db()

    def _init_db(self) -> None:
        with self._lock:
            if not self._is_memory:
                self._conn.execute("PRAGMA journal_mode=WAL;")
                self._conn.execute("PRAGMA synchronous=NORMAL;")
            self._conn.execute(
                """
                CREATE TABLE IF NOT EXISTS system_metrics (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    timestamp TEXT NOT NULL,
                    timestamp_epoch REAL NOT NULL,
                    cpu_percent REAL NOT NULL,
                    memory_used_percent REAL NOT NULL,
                    memory_used_bytes INTEGER NOT NULL,
                    memory_total_bytes INTEGER NOT NULL,
                    swap_used_percent REAL NOT NULL,
                    load_1m REAL NOT NULL,
                    load_5m REAL NOT NULL,
                    load_15m REAL NOT NULL,
                    disk_used_percent REAL NOT NULL,
                    disk_read_kb REAL NOT NULL,
                    disk_write_kb REAL NOT NULL,
                    net_rx_kb REAL NOT NULL,
                    net_tx_kb REAL NOT NULL
                );
                """
            )
            self._conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_metrics_epoch ON system_metrics(timestamp_epoch);"
            )
            self._conn.commit()

    def insert_metric(
        self,
        timestamp: str,
        timestamp_epoch: float,
        cpu_percent: float,
        memory_used_percent: float,
        memory_used_bytes: int,
        memory_total_bytes: int,
        swap_used_percent: float,
        load_1m: float,
        load_5m: float,
        load_15m: float,
        disk_used_percent: float,
        disk_read_kb: float,
        disk_write_kb: float,
        net_rx_kb: float,
        net_tx_kb: float,
    ) -> None:
        """Insert a single snapshot of system telemetry."""
        with self._lock:
            self._conn.execute(
                """
                INSERT INTO system_metrics (
                    timestamp, timestamp_epoch, cpu_percent, memory_used_percent,
                    memory_used_bytes, memory_total_bytes, swap_used_percent,
                    load_1m, load_5m, load_15m, disk_used_percent,
                    disk_read_kb, disk_write_kb, net_rx_kb, net_tx_kb
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
                """,
                (
                    timestamp,
                    timestamp_epoch,
                    cpu_percent,
                    memory_used_percent,
                    memory_used_bytes,
                    memory_total_bytes,
                    swap_used_percent,
                    load_1m,
                    load_5m,
                    load_15m,
                    disk_used_percent,
                    disk_read_kb,
                    disk_write_kb,
                    net_rx_kb,
                    net_tx_kb,
                ),
            )
            self._conn.commit()

    def get_aggregates(self, hours: float = 24.0) -> Dict[str, Any]:
        """Compute average, min, max, and peak statistics over a specified window."""
        since_epoch = time.time() - (hours * 3600.0)

        with self._lock:
            cursor = self._conn.cursor()
            cursor.execute(
                """
                SELECT
                    COUNT(*) as count,
                    MIN(timestamp_epoch) as min_ts,
                    MAX(timestamp_epoch) as max_ts,
                    AVG(memory_used_percent) as avg_mem_pct,
                    MIN(memory_used_percent) as min_mem_pct,
                    MAX(memory_used_percent) as max_mem_pct,
                    AVG(memory_used_bytes) as avg_mem_bytes,
                    AVG(cpu_percent) as avg_cpu_pct,
                    MAX(cpu_percent) as max_cpu_pct,
                    AVG(load_1m) as avg_load_1m,
                    MAX(load_1m) as max_load_1m,
                    AVG(load_5m) as avg_load_5m,
                    AVG(load_15m) as avg_load_15m
                FROM system_metrics
                WHERE timestamp_epoch >= ?;
                """,
                (since_epoch,),
            )
            row = cursor.fetchone()

            count = row["count"] if row and row["count"] else 0
            if count == 0:
                return {
                    "timeframe_hours": hours,
                    "sample_count": 0,
                    "start_time": None,
                    "end_time": None,
                    "memory": {
                        "avg_percent": 0.0,
                        "min_percent": 0.0,
                        "max_percent": 0.0,
                        "avg_bytes": 0,
                    },
                    "cpu": {
                        "avg_percent": 0.0,
                        "max_percent": 0.0,
                    },
                    "load": {
                        "avg_1m": 0.0,
                        "max_1m": 0.0,
                        "avg_5m": 0.0,
                        "avg_15m": 0.0,
                    },
                }

            start_iso = (
                datetime.fromtimestamp(row["min_ts"], tz=timezone.utc).isoformat()
                if row["min_ts"]
                else None
            )
            end_iso = (
                datetime.fromtimestamp(row["max_ts"], tz=timezone.utc).isoformat()
                if row["max_ts"]
                else None
            )

            return {
                "timeframe_hours": hours,
                "sample_count": count,
                "start_time": start_iso,
                "end_time": end_iso,
                "memory": {
                    "avg_percent": round(float(row["avg_mem_pct"]), 1) if row["avg_mem_pct"] is not None else 0.0,
                    "min_percent": round(float(row["min_mem_pct"]), 1) if row["min_mem_pct"] is not None else 0.0,
                    "max_percent": round(float(row["max_mem_pct"]), 1) if row["max_mem_pct"] is not None else 0.0,
                    "avg_bytes": int(row["avg_mem_bytes"]) if row["avg_mem_bytes"] is not None else 0,
                },
                "cpu": {
                    "avg_percent": round(float(row["avg_cpu_pct"]), 1) if row["avg_cpu_pct"] is not None else 0.0,
                    "max_percent": round(float(row["max_cpu_pct"]), 1) if row["max_cpu_pct"] is not None else 0.0,
                },
                "load": {
                    "avg_1m": round(float(row["avg_load_1m"]), 2) if row["avg_load_1m"] is not None else 0.0,
                    "max_1m": round(float(row["max_load_1m"]), 2) if row["max_load_1m"] is not None else 0.0,
                    "avg_5m": round(float(row["avg_load_5m"]), 2) if row["avg_load_5m"] is not None else 0.0,
                    "avg_15m": round(float(row["avg_load_15m"]), 2) if row["avg_load_15m"] is not None else 0.0,
                },
            }

    def get_recent_history(self, limit: int = 120, hours: Optional[float] = None) -> List[Dict[str, Any]]:
        """Retrieve recent historical data points for chart rendering with optional timeframe."""
        query = "SELECT * FROM system_metrics"
        params: List[Any] = []

        if hours is not None:
            since_epoch = time.time() - (hours * 3600.0)
            query += " WHERE timestamp_epoch >= ? ORDER BY timestamp_epoch ASC"
            params.append(since_epoch)

            with self._lock:
                cursor = self._conn.cursor()
                cursor.execute(query, params)
                all_rows = cursor.fetchall()

            if len(all_rows) > limit:
                step = max(1, len(all_rows) // limit)
                selected_rows = all_rows[::step]
                # Ensure the most recent point is always included
                if all_rows[-1] not in selected_rows:
                    selected_rows.append(all_rows[-1])
            else:
                selected_rows = all_rows
        else:
            query += " ORDER BY timestamp_epoch DESC LIMIT ?"
            params.append(limit)

            with self._lock:
                cursor = self._conn.cursor()
                cursor.execute(query, params)
                rows = cursor.fetchall()
            selected_rows = list(reversed(rows))

        result = []
        for r in selected_rows:
            result.append(
                {
                    "timestamp": r["timestamp"],
                    "timestamp_epoch": r["timestamp_epoch"] if "timestamp_epoch" in r.keys() else 0.0,
                    "cpu": float(r["cpu_percent"]),
                    "memory": float(r["memory_used_percent"]),
                    "memory_used_bytes": int(r["memory_used_bytes"]) if "memory_used_bytes" in r.keys() else 0,
                    "memory_total_bytes": int(r["memory_total_bytes"]) if "memory_total_bytes" in r.keys() else 0,
                    "swap": float(r["swap_used_percent"]) if "swap_used_percent" in r.keys() else 0.0,
                    "disk_used_percent": float(r["disk_used_percent"]) if "disk_used_percent" in r.keys() else 0.0,
                    "disk_read_kb": float(r["disk_read_kb"]),
                    "disk_write_kb": float(r["disk_write_kb"]),
                    "net_rx_kb": float(r["net_rx_kb"]),
                    "net_tx_kb": float(r["net_tx_kb"]),
                    "load_1m": float(r["load_1m"]),
                    "load_5m": float(r["load_5m"]),
                    "load_15m": float(r["load_15m"]),
                }
            )
        return result

    def prune_older_than(self, days: int = 7) -> int:
        """Prune records older than specified days to conserve disk space."""
        cutoff_epoch = time.time() - (days * 86400.0)
        with self._lock:
            cursor = self._conn.cursor()
            cursor.execute("DELETE FROM system_metrics WHERE timestamp_epoch < ?;", (cutoff_epoch,))
            self._conn.commit()
            return cursor.rowcount

    def close(self) -> None:
        """Close connection cleanly."""
        with self._lock:
            try:
                self._conn.close()
            except Exception:
                pass
