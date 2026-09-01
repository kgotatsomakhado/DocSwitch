from pathlib import Path


# ============================================================
# DOCSWITCH CONFIGURATION
# ============================================================

BASE_DIR = Path(__file__).resolve().parent.parent


# ============================================================
# TEMPORARY WORKSPACE
# ============================================================

TEMP_DIR = BASE_DIR / "temp"


# ============================================================
# UPLOAD LIMIT
# ============================================================

MAX_FILE_SIZE = 25 * 1024 * 1024  # 25 MB


# ============================================================
# SUPPORTED INPUT FORMATS
# ============================================================

ALLOWED_EXTENSIONS = {
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
}


# ============================================================
# SUPPORTED OUTPUT FORMATS
# ============================================================

ALLOWED_TARGET_FORMATS = {
    "pdf",
    "docx",
}


# ============================================================
# DIRECTORY INITIALIZATION
# ============================================================

def ensure_directories() -> None:
    """
    Ensure required backend directories exist.
    """

    TEMP_DIR.mkdir(
        parents=True,
        exist_ok=True,
    )