from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from app.config import (
    ALLOWED_EXTENSIONS,
    ALLOWED_TARGET_FORMATS,
    MAX_FILE_SIZE,
    TEMP_DIR,
)


router = APIRouter(
    prefix="/convert",
    tags=["Conversion"],
)


# ============================================================
# CONVERSION MATRIX
# ============================================================

CONVERSION_MATRIX = {
    "pdf": {"docx", "jpg", "jpeg", "png", "webp"},
    "docx": {"pdf"},
    "doc": {"pdf"},
    "txt": {"pdf", "docx"},
    "rtf": {"pdf", "docx"},
    "pptx": {"pdf"},
    "ppt": {"pdf"},
    "jpg": {"pdf"},
    "jpeg": {"pdf"},
    "png": {"pdf"},
    "webp": {"pdf"},
}


# ============================================================
# CONVERSION ENDPOINT
# ============================================================

@router.post("")
async def convert_file(
    file: UploadFile = File(...),
    target_format: str = Form(...),
):
    """
    Accept and validate a file for conversion.

    Actual conversion will be added in the next phase.
    """

    # --------------------------------------------------------
    # 1. Validate filename
    # --------------------------------------------------------

    if not file.filename:
        raise HTTPException(
            status_code=400,
            detail="No file selected.",
        )

    # --------------------------------------------------------
    # 2. Extract source extension
    # --------------------------------------------------------

    source_format = (
        Path(file.filename)
        .suffix
        .lower()
        .lstrip(".")
    )

    if source_format not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=(
                f".{source_format.upper()} files "
                "are not supported."
            ),
        )

    # --------------------------------------------------------
    # 3. Normalize target format
    # --------------------------------------------------------

    target_format = (
        target_format
        .lower()
        .strip()
        .lstrip(".")
    )

    if target_format not in ALLOWED_TARGET_FORMATS:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Conversion to .{target_format} "
                "is not supported."
            ),
        )

    # --------------------------------------------------------
    # 4. Check conversion matrix
    # --------------------------------------------------------

    allowed_targets = CONVERSION_MATRIX.get(
        source_format,
        set(),
    )

    if target_format not in allowed_targets:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Conversion from "
                f".{source_format} to "
                f".{target_format} is not supported."
            ),
        )

    # --------------------------------------------------------
    # 5. Generate isolated temporary filename
    # --------------------------------------------------------

    temporary_filename = (
        f"{uuid4().hex}.{source_format}"
    )

    temporary_path = TEMP_DIR / temporary_filename

    total_size = 0

    # --------------------------------------------------------
    # 6. Stream upload to disk
    # --------------------------------------------------------

    try:

        with temporary_path.open("wb") as buffer:

            while True:

                chunk = await file.read(1024 * 1024)

                if not chunk:
                    break

                total_size += len(chunk)

                # --------------------------------------------
                # Enforce 25 MB limit while receiving data
                # --------------------------------------------

                if total_size > MAX_FILE_SIZE:

                    raise HTTPException(
                        status_code=413,
                        detail=(
                            "File exceeds maximum "
                            "limit of 25 MB."
                        ),
                    )

                buffer.write(chunk)

    except HTTPException:
        temporary_path.unlink(missing_ok=True)
        raise

    except Exception as exc:

        temporary_path.unlink(missing_ok=True)

        raise HTTPException(
            status_code=500,
            detail="Failed to receive uploaded file.",
        ) from exc

    finally:
        await file.close()

    # --------------------------------------------------------
    # TEMPORARY RESPONSE
    # --------------------------------------------------------

    return {
        "status": "accepted",
        "filename": file.filename,
        "source_format": source_format,
        "target_format": target_format,
        "size": total_size,
        "temporary_file": temporary_filename,
    }