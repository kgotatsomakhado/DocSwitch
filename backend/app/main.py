from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import ensure_directories
from app.routes.conversion import router as conversion_router


# ============================================================
# DOCSWITCH API
# ============================================================

ensure_directories()

app = FastAPI(
    title="DocSwitch API",
    description="Document conversion API",
    version="1.0.0",
)


# ============================================================
# CORS
# ============================================================

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://127.0.0.1:5500",
        "http://localhost:5500",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================
# ROUTES
# ============================================================

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