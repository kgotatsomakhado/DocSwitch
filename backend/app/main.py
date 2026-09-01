from fastapi import FastAPI

from app.config import ensure_directories
from app.routes.conversion import router as conversion_router


# ============================================================
# DOCSWITCH API
# ============================================================

ensure_directories()


app = FastAPI(
    title="DocSwitch API",
    description="Free document conversion API",
    version="1.0.0",
)


app.include_router(
    conversion_router,
    prefix="/api/v1",
)


# ============================================================
# HEALTH / ROOT
# ============================================================

@app.get("/")
async def root():
    return {
        "name": "DocSwitch API",
        "status": "online",
        "version": "1.0.0",
    }


@app.get("/health")
async def health():
    return {
        "status": "healthy",
    }