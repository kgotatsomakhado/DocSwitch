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
    description=(
        "DocSwitch file conversion API. "
        "Supports PDF, DOCX, DOC, TXT, RTF, PPTX, PPT, "
        "JPG, JPEG, PNG and WEBP inputs with PDF and DOCX outputs."
    ),
    version="1.0.0",
)


# ============================================================
# CORS
# ============================================================

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],        # Allow everything during dev
    allow_credentials=False,    # Must be False if using "*"
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=[
        "Content-Disposition",
        "Content-Length",
        "Content-Type",
    ],
)

# ============================================================
# ROUTES
# ============================================================

app.include_router(
    conversion_router,
    prefix="/api/v1",
)


# ============================================================
# ROOT
# ============================================================

@app.get("/")
async def root():
    return {
        "name": "DocSwitch API",
        "status": "online",
        "version": "1.0.0",
    }


# ============================================================
# HEALTH
# ============================================================

@app.get("/health")
async def health():
    return {
        "status": "healthy",
    }


# ============================================================
# SUPPORTED FORMATS
# ============================================================

@app.get("/api/v1/formats")
async def supported_formats():
    return {
        "input_formats": [
            "pdf",
            "docx",
            "doc",
            "txt",
            "rtf",
            "pptx",
            "ppt",
            "jpg",
            "jpeg",
            "png",
            "webp",
        ],
        "output_formats": [
            "pdf",
            "docx",
        ],
    }