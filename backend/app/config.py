from pathlib import Path


# ============================================================
# DOCSWITCH CONFIGURATION
# ============================================================

# Root directory of the backend
BASE_DIR = Path(__file__).resolve().parent.parent


# Temporary workspace
TEMP_DIR = BASE_DIR / "temp"


# Maximum upload size
MAX_FILE_SIZE = 25 * 1024 * 1024  # 25 MB


# Supported input formats
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


# Supported output formats
ALLOWED_TARGET_FORMATS = {
    "pdf",
    "docx",
}


def ensure_directories() -> None:
    """
    Make sure required backend directories exist.
    """
    TEMP_DIR.mkdir(
        parents=True,
        exist_ok=True,
    )