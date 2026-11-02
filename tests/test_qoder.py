"""Tests for Qoder CLI quota parsing and account loading."""

import sys
from pathlib import Path

# Ensure project root is in sys.path
project_dir = Path(__file__).parent.parent
if str(project_dir) not in sys.path:
    sys.path.insert(0, str(project_dir))

from qoder import (  # noqa: E402
    load_accounts,
    load_token_file,
    parse_packages,
    parse_quota_amount,
    parse_quota_usage,
    parse_shared_pool,
)

REAL_PAYLOAD = {
    "userId": "019f6fcb-3c25-72a1-bebe-7ea14fd89dd3",
    "userType": "personal_professional_trial",
    "usageType": "credits",
    "totalUsagePercentage": 0.31,
    "isQuotaExceeded": False,
    "expiresAt": 1794740180392,
    "upgradeUrl": "https://qoder.com/pricing?client=qoder",
    "outerProviders": [],
    "userQuota": {
        "total": 300.0,
        "used": 94.0,
        "percentage": 0.31,
        "unit": "credits",
    },
    "isPlanQuotaProrated": False,
}


def test_parse_quota_usage_real_payload():
    snap = parse_quota_usage("main", REAL_PAYLOAD)
    assert snap is not None
    assert snap.account_id == "main"
    assert snap.userType == "personal_professional_trial"
    assert snap.usageType == "credits"
    assert snap.totalUsagePercentage == 0.31
    assert snap.isQuotaExceeded is False
    assert snap.expiresAt == 1794740180392
    assert snap.userQuota is not None
    assert snap.userQuota.total == 300.0
    assert snap.userQuota.used == 94.0
    assert snap.userQuota.remaining == 206.0  # derived from total - used
    assert snap.userQuota.percentage == 0.31
    assert snap.userQuota.unit == "credits"
    assert snap.addOnQuota is None
    assert snap.sharedQuota is None
    assert snap.packages == []
    assert snap.error is None


def test_parse_quota_usage_snake_case_variant():
    payload = {
        "userId": "u1",
        "userType": "team",
        "total_usage_percentage": 55.0,
        "is_quota_exceeded": True,
        "user_quota": {"total": 100, "used": 55, "remaining": 45, "unit": "credits"},
        "add_on_quota": {
            "total": 50,
            "used": 10,
            "remaining": 40,
            "detail_url": "https://qoder.com/billing",
        },
        "org_resource_package": {
            "used": 20,
            "cap": 200,
            "remaining": 180,
            "available": True,
            "unit": "credits",
        },
        "dedicated_resource_packages": [
            {
                "id": "pkg-1",
                "name": "Enterprise Pool",
                "total": 1000,
                "used": 250,
                "unit": "credits",
                "available": True,
                "status": "QUOTA_DETAIL_STATUS_UNSPECIFIED",
                "expires_at": 1794740180392,
            }
        ],
    }
    snap = parse_quota_usage("team-acct", payload)
    assert snap is not None
    assert snap.totalUsagePercentage == 0.55
    assert snap.isQuotaExceeded is True
    assert snap.userQuota is not None and snap.userQuota.remaining == 45
    assert snap.addOnQuota is not None
    assert snap.addOnQuota.detailUrl == "https://qoder.com/billing"
    assert snap.sharedQuota is not None
    assert snap.sharedQuota.cap == 200
    assert snap.sharedQuota.available is True
    assert len(snap.packages) == 1
    pkg = snap.packages[0]
    assert pkg.id == "pkg-1"
    assert pkg.name == "Enterprise Pool"
    assert pkg.remaining == 750.0
    assert pkg.percentage == 0.25
    assert pkg.expiresAt == 1794740180392


def test_parse_quota_usage_invalid():
    assert parse_quota_usage("x", None) is None
    assert parse_quota_usage("x", [1, 2, 3]) is None
    assert parse_quota_usage("x", {}) is not None  # empty dict still yields a snapshot


def test_parse_quota_amount_fraction_clamping():
    amount = parse_quota_amount({"total": 100, "used": 30, "percentage": 42})
    assert amount is not None
    assert amount.percentage == 0.42  # percent scale normalized to fraction
    amount2 = parse_quota_amount({"total": 100, "used": 30, "percentage": 0.3})
    assert amount2 is not None
    assert amount2.percentage == 0.3


def test_parse_quota_amount_derives_missing_fields():
    amount = parse_quota_amount({"total": 200, "used": 50})
    assert amount is not None
    assert amount.remaining == 150.0
    assert amount.percentage == 0.25
    assert amount.unit == "credits"


def test_parse_shared_pool_cap_total_fallback():
    pool = parse_shared_pool({"used": 10, "total": 40})
    assert pool is not None
    assert pool.cap == 40.0
    assert pool.remaining == 30.0
    assert pool.available is True


def test_parse_packages_skips_invalid():
    packages = parse_packages([{"id": "a", "total": 10, "used": 5}, None, {"name": "no-id"}])
    assert len(packages) == 1
    assert packages[0].id == "a"


def test_load_accounts_from_env(tmp_path, monkeypatch):
    monkeypatch.setenv(
        "QODER_ACCOUNTS_JSON",
        '[{"id": "a1", "token": "dt-abc"}, {"id": "bad"}, {"id": "a2", "token_file": "missing"}]',
    )
    accounts = load_accounts()
    assert [a["id"] for a in accounts] == ["a1", "a2"]
    assert accounts[0]["token"] == "dt-abc"


def test_load_accounts_from_file(tmp_path, monkeypatch):
    conf = tmp_path / "accounts.json"
    conf.write_text('{"accounts": [{"id": "file-acct", "token": "dt-xyz"}]}')
    monkeypatch.delenv("QODER_ACCOUNTS_JSON", raising=False)
    monkeypatch.setenv("QODER_ACCOUNTS_FILE", str(conf))
    accounts = load_accounts()
    assert len(accounts) == 1
    assert accounts[0]["id"] == "file-acct"


def test_load_token_file_formats(tmp_path):
    raw = tmp_path / "raw.token"
    raw.write_text("dt-rawtoken\n")
    assert load_token_file(str(raw)) == "dt-rawtoken"
    js = tmp_path / "js.token"
    js.write_text('{"token": "dt-fromjson"}')
    assert load_token_file(str(js)) == "dt-fromjson"
    assert load_token_file(str(tmp_path / "missing.token")) is None
