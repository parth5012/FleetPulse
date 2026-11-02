"""
Qoder CLI Account Quota Tracker.
Mirrors antigravity.py conventions: env-driven config, pydantic models,
TTL-cached service. Reads the Qoder CLI's device token and polls the same
openapi endpoint the CLI itself uses (`GET /api/v2/quota/usage`).
"""

import json
import os
import threading
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

import httpx
from fastapi import APIRouter, Query, Request
from fastapi.responses import JSONResponse, RedirectResponse
from pydantic import BaseModel, Field

# ---------------------------------------------------------------------------
# Configuration & Constants
# ---------------------------------------------------------------------------
DEFAULT_CACHE_TTL = 180.0  # 3 minutes — plan credits drain gradually
QUOTA_USAGE_URL = os.environ.get(
    "QODER_QUOTA_USAGE_URL",
    "https://openapi.qoder.sh/api/v2/quota/usage",
)
ACCOUNTS_FILE_DEFAULT = "~/.config/fleetpulse/qoder-accounts.json"


# ---------------------------------------------------------------------------
# Pydantic Models
# ---------------------------------------------------------------------------
class QuotaAmount(BaseModel):
    total: float = 0.0
    used: float = 0.0
    remaining: float = 0.0
    percentage: Optional[float] = None
    unit: str = "credits"
    detailUrl: Optional[str] = None


class SharedPool(BaseModel):
    used: float = 0.0
    cap: float = 0.0
    remaining: float = 0.0
    percentage: Optional[float] = None
    available: bool = True
    unit: str = "credits"


class ResourcePackage(BaseModel):
    id: str
    name: str = ""
    description: str = ""
    total: float = 0.0
    used: float = 0.0
    remaining: float = 0.0
    percentage: Optional[float] = None
    unit: str = "credits"
    available: bool = False
    status: str = ""
    expiresAt: Optional[int] = None


class QoderAccountSnapshot(BaseModel):
    account_id: str
    userId: str = ""
    userType: str = ""
    usageType: str = ""
    totalUsagePercentage: Optional[float] = None
    isQuotaExceeded: bool = False
    expiresAt: Optional[int] = None
    upgradeUrl: str = ""
    userQuota: Optional[QuotaAmount] = None
    addOnQuota: Optional[QuotaAmount] = None
    sharedQuota: Optional[SharedPool] = None
    packages: List[ResourcePackage] = Field(default_factory=list)
    error: Optional[str] = None


class QoderSnapshot(BaseModel):
    accounts: List[QoderAccountSnapshot] = Field(default_factory=list)
    cached: bool = False
    timestamp: str
    error: Optional[str] = None


def _clean(value: Any) -> str:
    return str(value or "").strip()


def _num(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _fraction(value: Any) -> Optional[float]:
    """API reports percentages as 0-1 fractions; normalize other scales."""
    if value is None:
        return None
    try:
        frac = float(value)
    except (TypeError, ValueError):
        return None
    if frac > 1.0:
        frac = frac / 100.0
    return max(0.0, min(1.0, frac))


def load_accounts() -> List[Dict[str, str]]:
    """Read account registry from QODER_ACCOUNTS_JSON or the default file."""
    raw = os.environ.get("QODER_ACCOUNTS_JSON", "").strip()
    entries: Any = None
    if raw:
        try:
            entries = json.loads(raw)
        except (ValueError, TypeError):
            return []
    else:
        accounts_file = os.environ.get("QODER_ACCOUNTS_FILE", ACCOUNTS_FILE_DEFAULT)
        path = Path(os.path.expanduser(accounts_file))
        try:
            entries = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return []
        if isinstance(entries, dict):
            entries = entries.get("accounts", entries)

    if not isinstance(entries, list):
        return []
    accounts: List[Dict[str, str]] = []
    for item in entries:
        if not isinstance(item, dict):
            continue
        account_id = _clean(item.get("id") or item.get("account_id"))
        token = _clean(item.get("token") or item.get("access_token"))
        token_file = _clean(item.get("token_file") or item.get("tokenFile"))
        if not account_id or (not token and not token_file):
            continue
        entry = {"id": account_id}
        if token:
            entry["token"] = token
        if token_file:
            entry["token_file"] = token_file
        accounts.append(entry)
    return accounts


def load_token_file(path: str) -> Optional[str]:
    """Read a token from a file — raw value or {"token": ...} / {"access_token": ...}."""
    try:
        text = Path(os.path.expanduser(path)).read_text(encoding="utf-8").strip()
    except OSError:
        return None
    if not text:
        return None
    if text.startswith("{"):
        try:
            data = json.loads(text)
            return _clean(data.get("token") or data.get("access_token")) or None
        except (ValueError, TypeError):
            return None
    return text


def _pick(data: Dict[str, Any], *names: str) -> Any:
    for name in names:
        if name in data and data[name] is not None:
            return data[name]
    return None


def parse_quota_amount(data: Any, with_detail_url: bool = False) -> Optional[QuotaAmount]:
    if not isinstance(data, dict):
        return None
    total = _num(_pick(data, "total"))
    used = _num(_pick(data, "used"))
    remaining_raw = _pick(data, "remaining")
    remaining = _num(remaining_raw) if remaining_raw is not None else max(total - used, 0.0)
    percentage = _fraction(_pick(data, "percentage"))
    if percentage is None and total > 0:
        percentage = max(0.0, min(1.0, used / total))
    kwargs: Dict[str, Any] = {
        "total": total,
        "used": used,
        "remaining": remaining,
        "percentage": percentage,
        "unit": _clean(_pick(data, "unit")) or "credits",
    }
    if with_detail_url:
        kwargs["detailUrl"] = _clean(_pick(data, "detail_url", "detailUrl")) or None
    return QuotaAmount(**kwargs)


def parse_shared_pool(data: Any) -> Optional[SharedPool]:
    if not isinstance(data, dict):
        return None
    used = _num(_pick(data, "used"))
    cap = _num(_pick(data, "cap", "total"))
    remaining_raw = _pick(data, "remaining")
    remaining = _num(remaining_raw) if remaining_raw is not None else max(cap - used, 0.0)
    percentage = _fraction(_pick(data, "percentage"))
    if percentage is None and cap > 0:
        percentage = max(0.0, min(1.0, used / cap))
    available = bool(data["available"]) if "available" in data else cap > 0
    return SharedPool(
        used=used,
        cap=cap,
        remaining=remaining,
        percentage=percentage,
        available=available,
        unit=_clean(_pick(data, "unit")) or "credits",
    )


def parse_packages(data: Any) -> List[ResourcePackage]:
    if not isinstance(data, list):
        return []
    packages: List[ResourcePackage] = []
    for item in data:
        if not isinstance(item, dict):
            continue
        pkg_id = _clean(_pick(item, "id"))
        if not pkg_id:
            continue
        total = _num(_pick(item, "total"))
        used = _num(_pick(item, "used"))
        remaining_raw = _pick(item, "remaining")
        remaining = _num(remaining_raw) if remaining_raw is not None else max(total - used, 0.0)
        percentage = _fraction(_pick(item, "percentage"))
        if percentage is None and total > 0:
            percentage = max(0.0, min(1.0, used / total))
        expires_raw = _pick(item, "expires_at", "expiresAt")
        try:
            expires_at = int(expires_raw) if expires_raw else None
        except (TypeError, ValueError):
            expires_at = None
        packages.append(
            ResourcePackage(
                id=pkg_id,
                name=_clean(_pick(item, "name")),
                description=_clean(_pick(item, "description")),
                total=total,
                used=used,
                remaining=remaining,
                percentage=percentage,
                unit=_clean(_pick(item, "unit")) or "credits",
                available=bool(_pick(item, "available")),
                status=_clean(_pick(item, "status")),
                expiresAt=expires_at,
            )
        )
    return packages


def parse_quota_usage(account_id: str, payload: Any) -> Optional[QoderAccountSnapshot]:
    """Normalize the /api/v2/quota/usage response into an account snapshot."""
    if not isinstance(payload, dict):
        return None
    total_usage = _fraction(_pick(payload, "total_usage_percentage", "totalUsagePercentage"))
    user_quota = parse_quota_amount(_pick(payload, "user_quota", "userQuota"))
    add_on = parse_quota_amount(_pick(payload, "add_on_quota", "addOnQuota"), with_detail_url=True)
    shared = parse_shared_pool(
        _pick(payload, "org_resource_package", "orgResourcePackage", "shared_quota", "sharedQuota")
    )
    packages = parse_packages(_pick(payload, "dedicated_resource_packages", "dedicatedResourcePackages"))
    exceeded_raw = _pick(payload, "is_quota_exceeded", "isQuotaExceeded")
    exceeded = bool(exceeded_raw) if exceeded_raw is not None else bool(
        total_usage is not None and total_usage >= 1.0
    )
    expires_raw = _pick(payload, "expires_at", "expiresAt")
    try:
        expires_at = int(expires_raw) if expires_raw else None
    except (TypeError, ValueError):
        expires_at = None
    return QoderAccountSnapshot(
        account_id=account_id,
        userId=_clean(_pick(payload, "userId")),
        userType=_clean(_pick(payload, "userType")),
        usageType=_clean(_pick(payload, "usageType")),
        totalUsagePercentage=total_usage,
        isQuotaExceeded=exceeded,
        expiresAt=expires_at,
        upgradeUrl=_clean(_pick(payload, "upgrade_url", "upgradeUrl")),
        userQuota=user_quota,
        addOnQuota=add_on,
        sharedQuota=shared,
        packages=packages,
    )


# ---------------------------------------------------------------------------
# Quota service with TTL cache (mirrors AntigravityService)
# ---------------------------------------------------------------------------
class QoderService:
    def __init__(self, cache_ttl: float = DEFAULT_CACHE_TTL):
        self.cache_ttl = cache_ttl
        self._lock = threading.Lock()
        self._cached: Optional[QoderSnapshot] = None
        self._cached_at: float = 0.0

    def _headers_for(self, token: str) -> Dict[str, str]:
        return {
            "Authorization": f"Bearer {token}",
            "Accept": "application/json",
            "User-Agent": "qodercli/1.1.81",
        }

    def _effective_token(self, account: Dict[str, str]) -> str:
        if account.get("token"):
            return account["token"]
        token_file = account.get("token_file") or ""
        if token_file:
            token = load_token_file(token_file)
            if token:
                return token
        return ""

    async def _fetch_one(self, client: httpx.AsyncClient, account: Dict[str, str]) -> QoderAccountSnapshot:
        account_id = account["id"]
        token = self._effective_token(account)
        if not token:
            return QoderAccountSnapshot(account_id=account_id, error="no device token configured")

        try:
            response = await client.get(QUOTA_USAGE_URL, headers=self._headers_for(token))
        except Exception as exc:
            return QoderAccountSnapshot(account_id=account_id, error=f"connect failed: {exc}")

        if response.status_code in (401, 403):
            return QoderAccountSnapshot(
                account_id=account_id,
                error="device token rejected upstream — re-capture the Qoder CLI token",
            )
        if response.status_code != 200:
            detail = (response.text or "")[:200]
            return QoderAccountSnapshot(
                account_id=account_id, error=f"upstream {response.status_code}: {detail}"
            )
        try:
            payload = response.json()
        except ValueError:
            return QoderAccountSnapshot(account_id=account_id, error="upstream returned non-JSON body")
        snapshot = parse_quota_usage(account_id, payload)
        if snapshot is None:
            return QoderAccountSnapshot(account_id=account_id, error="invalid quota payload")
        return snapshot

    async def _fetch_snapshot(self) -> QoderSnapshot:
        accounts = load_accounts()
        if not accounts:
            return QoderSnapshot(
                accounts=[],
                timestamp=datetime.now(timezone.utc).isoformat(),
                error="no Qoder accounts configured (QODER_ACCOUNTS_JSON or "
                f"{ACCOUNTS_FILE_DEFAULT})",
            )
        async with httpx.AsyncClient(timeout=15.0, follow_redirects=True) as client:
            snapshots = [await self._fetch_one(client, account) for account in accounts]
        return QoderSnapshot(
            accounts=snapshots, timestamp=datetime.now(timezone.utc).isoformat()
        )

    async def get_snapshot(self, refresh: bool = False) -> QoderSnapshot:
        with self._lock:
            now = time.monotonic()
            if (
                not refresh
                and self._cached is not None
                and (now - self._cached_at) < self.cache_ttl
            ):
                return self._cached.model_copy(update={"cached": True})
            snapshot = await self._fetch_snapshot()
            self._cached = snapshot
            self._cached_at = time.monotonic()
            return snapshot


_service: Optional[QoderService] = None
_service_lock = threading.Lock()


def get_qoder_service() -> QoderService:
    global _service
    with _service_lock:
        if _service is None:
            _service = QoderService()
        return _service


# ---------------------------------------------------------------------------
# FastAPI APIRouter Definition
# ---------------------------------------------------------------------------
router = APIRouter(tags=["qoder"])


@router.get("/api/qoder/limits", response_model=QoderSnapshot)
async def get_qoder_limits(
    request: Request,
    refresh: bool = Query(False, description="Bypass TTL cache and poll upstream now"),
):
    """Per-account Qoder CLI plan credit usage (same endpoint the CLI polls)."""
    accept = request.headers.get("accept", "")
    if "text/html" in accept and "application/json" not in accept:
        return RedirectResponse(url="/antigravity", status_code=303)
    try:
        service = get_qoder_service()
        snapshot = await service.get_snapshot(refresh=refresh)
        return JSONResponse(
            content=snapshot.model_dump(),
            headers={"Cache-Control": "no-cache, no-store, must-revalidate", "Pragma": "no-cache"},
        )
    except Exception as exc:
        now_iso = datetime.now(timezone.utc).isoformat()
        return QoderSnapshot(accounts=[], timestamp=now_iso, error=f"quota service error: {exc}")
