"""Unit and Integration Tests for SQLite Metrics Persistence & Aggregations."""

import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

project_dir = Path(__file__).parent.parent
if str(project_dir) not in sys.path:
    sys.path.insert(0, str(project_dir))

import pytest
from fastapi.testclient import TestClient

from main import app
from metrics_db import MetricsDatabase
from system_metrics import SystemMetricsService

client = TestClient(app)


@pytest.fixture
def mem_db(tmp_path):
    """Fixture providing an isolated SQLite database."""
    db_file = tmp_path / "test_metrics.db"
    return MetricsDatabase(db_path=str(db_file))


def test_metrics_db_init_and_insert(mem_db):
    """Test schema creation and metric row insertion."""
    now_iso = datetime.now(timezone.utc).isoformat()
    now_ts = time.time()

    mem_db.insert_metric(
        timestamp=now_iso,
        timestamp_epoch=now_ts,
        cpu_percent=15.5,
        memory_used_percent=45.2,
        memory_used_bytes=4520000000,
        memory_total_bytes=10000000000,
        swap_used_percent=5.0,
        load_1m=0.85,
        load_5m=0.75,
        load_15m=0.65,
        disk_used_percent=60.0,
        disk_read_kb=120.5,
        disk_write_kb=340.2,
        net_rx_kb=50.0,
        net_tx_kb=25.0,
    )

    history = mem_db.get_recent_history(limit=10)
    assert len(history) == 1
    row = history[0]
    assert row["cpu"] == 15.5
    assert row["memory"] == 45.2
    assert row["load_1m"] == 0.85


def test_metrics_db_aggregations(mem_db):
    """Test accurate computation of average, min, max for RAM and System Load."""
    now = datetime.now(timezone.utc)
    now_ts = now.timestamp()

    # Insert point 1 (1 hour ago)
    mem_db.insert_metric(
        timestamp=(now - timedelta(hours=1)).isoformat(),
        timestamp_epoch=now_ts - 3600,
        cpu_percent=10.0,
        memory_used_percent=40.0,
        memory_used_bytes=4000000000,
        memory_total_bytes=10000000000,
        swap_used_percent=0.0,
        load_1m=1.0,
        load_5m=0.8,
        load_15m=0.5,
        disk_used_percent=50.0,
        disk_read_kb=0,
        disk_write_kb=0,
        net_rx_kb=0,
        net_tx_kb=0,
    )

    # Insert point 2 (30 mins ago)
    mem_db.insert_metric(
        timestamp=(now - timedelta(minutes=30)).isoformat(),
        timestamp_epoch=now_ts - 1800,
        cpu_percent=20.0,
        memory_used_percent=60.0,
        memory_used_bytes=6000000000,
        memory_total_bytes=10000000000,
        swap_used_percent=0.0,
        load_1m=2.0,
        load_5m=1.5,
        load_15m=1.0,
        disk_used_percent=50.0,
        disk_read_kb=0,
        disk_write_kb=0,
        net_rx_kb=0,
        net_tx_kb=0,
    )

    # Insert point 3 (older point: 36 hours ago, outside 24h window)
    mem_db.insert_metric(
        timestamp=(now - timedelta(hours=36)).isoformat(),
        timestamp_epoch=now_ts - 36 * 3600,
        cpu_percent=90.0,
        memory_used_percent=95.0,
        memory_used_bytes=9500000000,
        memory_total_bytes=10000000000,
        swap_used_percent=50.0,
        load_1m=10.0,
        load_5m=8.0,
        load_15m=5.0,
        disk_used_percent=50.0,
        disk_read_kb=0,
        disk_write_kb=0,
        net_rx_kb=0,
        net_tx_kb=0,
    )

    # Query 24h aggregates
    stats_24h = mem_db.get_aggregates(hours=24)
    assert stats_24h["sample_count"] == 2
    assert stats_24h["memory"]["avg_percent"] == 50.0
    assert stats_24h["memory"]["min_percent"] == 40.0
    assert stats_24h["memory"]["max_percent"] == 60.0
    assert stats_24h["memory"]["avg_bytes"] == 5000000000

    assert stats_24h["cpu"]["avg_percent"] == 15.0
    assert stats_24h["cpu"]["max_percent"] == 20.0

    assert stats_24h["load"]["avg_1m"] == 1.5
    assert stats_24h["load"]["max_1m"] == 2.0
    assert stats_24h["load"]["avg_5m"] == 1.15
    assert stats_24h["load"]["avg_15m"] == 0.75

    # Query 48h aggregates (should include all 3 points)
    stats_48h = mem_db.get_aggregates(hours=48)
    assert stats_48h["sample_count"] == 3


def test_metrics_db_pruning(mem_db):
    """Test pruning data older than retention window."""
    now = datetime.now(timezone.utc)
    now_ts = now.timestamp()

    # 10 days ago
    mem_db.insert_metric(
        timestamp=(now - timedelta(days=10)).isoformat(),
        timestamp_epoch=now_ts - 10 * 86400,
        cpu_percent=10.0,
        memory_used_percent=40.0,
        memory_used_bytes=4000000000,
        memory_total_bytes=10000000000,
        swap_used_percent=0.0,
        load_1m=1.0,
        load_5m=0.8,
        load_15m=0.5,
        disk_used_percent=50.0,
        disk_read_kb=0,
        disk_write_kb=0,
        net_rx_kb=0,
        net_tx_kb=0,
    )
    # Today
    mem_db.insert_metric(
        timestamp=now.isoformat(),
        timestamp_epoch=now_ts,
        cpu_percent=10.0,
        memory_used_percent=40.0,
        memory_used_bytes=4000000000,
        memory_total_bytes=10000000000,
        swap_used_percent=0.0,
        load_1m=1.0,
        load_5m=0.8,
        load_15m=0.5,
        disk_used_percent=50.0,
        disk_read_kb=0,
        disk_write_kb=0,
        net_rx_kb=0,
        net_tx_kb=0,
    )

    deleted = mem_db.prune_older_than(days=7)
    assert deleted == 1
    recent = mem_db.get_recent_history(limit=10)
    assert len(recent) == 1


def test_api_system_stats_endpoint():
    """Test /api/system/stats HTTP endpoint returns aggregated averages."""
    response = client.get("/api/system/stats?hours=24")
    assert response.status_code == 200
    data = response.json()
    assert "timeframe_hours" in data
    assert "sample_count" in data
    assert "memory" in data
    assert "avg_percent" in data["memory"]
    assert "load" in data
    assert "avg_1m" in data["load"]
    assert "cpu" in data
