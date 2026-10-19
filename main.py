import os
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse, HTMLResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles

from antigravity import router as antigravity_router
from containers import router as containers_router
from system_metrics import router as system_router
from system_services import router as services_router
from tasks import router as tasks_router

BASE_DIR = Path(__file__).resolve().parent
DIST_DIR = BASE_DIR / "dist"

app = FastAPI(title="Dashboard Service", version="0.2.0")

# Mount API routers at root
app.include_router(antigravity_router)
app.include_router(system_router)
app.include_router(containers_router)
app.include_router(tasks_router)
app.include_router(services_router)

# Mount API routers under /dashboard prefix for reverse proxy / path prefix setups
app.include_router(antigravity_router, prefix="/dashboard")
app.include_router(system_router, prefix="/dashboard")
app.include_router(containers_router, prefix="/dashboard")
app.include_router(tasks_router, prefix="/dashboard")
app.include_router(services_router, prefix="/dashboard")


# Static & PWA file handling
if DIST_DIR.exists():
    app.mount("/assets", StaticFiles(directory=str(DIST_DIR / "assets")), name="assets")
    app.mount("/dashboard/assets", StaticFiles(directory=str(DIST_DIR / "assets")), name="dashboard-assets")

    # Direct PWA routes
    @app.get("/manifest.json")
    @app.get("/dashboard/manifest.json")
    async def get_manifest():
        p = DIST_DIR / "manifest.json"
        if p.exists():
            return FileResponse(p, media_type="application/manifest+json")
        return HTMLResponse(content="{}", status_code=404)

    @app.get("/sw.js")
    @app.get("/dashboard/sw.js")
    async def get_service_worker():
        p = DIST_DIR / "sw.js"
        if p.exists():
            return FileResponse(p, media_type="application/javascript", headers={"Service-Worker-Allowed": "/"})
        return HTMLResponse(content="", status_code=404)

    @app.get("/icon.svg")
    @app.get("/dashboard/icon.svg")
    async def get_icon_svg():
        p = DIST_DIR / "icon.svg"
        if p.exists():
            return FileResponse(p, media_type="image/svg+xml")
        return HTMLResponse(content="", status_code=404)

    @app.get("/icon-192.png")
    @app.get("/dashboard/icon-192.png")
    async def get_icon_192():
        p = DIST_DIR / "icon-192.png"
        if p.exists():
            return FileResponse(p, media_type="image/png")
        return HTMLResponse(content="", status_code=404)

    @app.get("/icon-512.png")
    @app.get("/dashboard/icon-512.png")
    async def get_icon_512():
        p = DIST_DIR / "icon-512.png"
        if p.exists():
            return FileResponse(p, media_type="image/png")
        return HTMLResponse(content="", status_code=404)

    @app.get("/dashboard", response_class=RedirectResponse)
    async def dashboard_redirect():
        return RedirectResponse(url="/dashboard/", status_code=307)

    @app.api_route("/{full_path:path}", methods=["GET", "HEAD"], response_class=HTMLResponse)
    async def spa_fallback(full_path: str):
        # Check if direct file exists in DIST_DIR (e.g. icon or custom asset)
        clean_path = full_path.removeprefix("dashboard/").removeprefix("dashboard")
        candidate = DIST_DIR / clean_path
        if candidate.is_file():
            return FileResponse(candidate)

        index = DIST_DIR / "index.html"
        if index.exists():
            return HTMLResponse(content=index.read_text(encoding="utf-8"))
        return HTMLResponse(content="<h1>Not built</h1>", status_code=404)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
