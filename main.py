import os
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse, HTMLResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles

from antigravity import router as antigravity_router
from containers import router as containers_router
from system_metrics import router as system_router

BASE_DIR = Path(__file__).resolve().parent
DIST_DIR = BASE_DIR / "dist"

app = FastAPI(title="Dashboard Service", version="0.1.0")
app.include_router(antigravity_router)
app.include_router(system_router)
app.include_router(containers_router)

# Also mount under /dashboard prefix for reverse proxy / path prefix setups
app.include_router(antigravity_router, prefix="/dashboard")
app.include_router(system_router, prefix="/dashboard")
app.include_router(containers_router, prefix="/dashboard")

# Serve Vite build (SPA) if present
if DIST_DIR.exists():
    app.mount("/assets", StaticFiles(directory=str(DIST_DIR / "assets")), name="assets")
    app.mount("/dashboard/assets", StaticFiles(directory=str(DIST_DIR / "assets")), name="dashboard-assets")

    @app.get("/dashboard", response_class=RedirectResponse)
    async def dashboard_redirect():
        return RedirectResponse(url="/dashboard/", status_code=307)

    @app.api_route("/{full_path:path}", methods=["GET", "HEAD"], response_class=HTMLResponse)
    async def spa_fallback(full_path: str):
        index = DIST_DIR / "index.html"
        if index.exists():
            return HTMLResponse(content=index.read_text(encoding="utf-8"))
        return HTMLResponse(content="<h1>Not built</h1>", status_code=404)

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
