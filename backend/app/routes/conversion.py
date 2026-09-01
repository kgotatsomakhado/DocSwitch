from pathlib import Path
import shutil
import tempfile
from uuid import uuid4

from fastapi import (
    APIRouter,
    BackgroundTasks,
    File,
    Form,
    HTTPException,
    UploadFile,
)
from fastapi.responses import FileResponse

from app.config import (
    ALLOWED_EXTENSIONS,
    ALLOWED_TARGET_FORMATS,
    MAX_FILE_SIZE,
    TEMP_DIR,
)

from app.services.converter import (
    ConversionError,
    convert_file,
)


# ============================================================
# ROUTER
# ============================================================

router = APIRouter(
    prefix="/convert",
    tags=["Conversion"],
)


# ============================================================
# CONVERSION MATRIX
# ============================================================

CONVERSION_MATRIX = {
    "pdf": {
        "docx",
    },

    "docx": {
        "pdf",
    },

    "doc": {
        "pdf",
        "docx",
    },

    "txt": {
        "pdf",
        "docx",
    },

    "rtf": {
        "pdf",
        "docx",
    },

    "pptx": {
        "pdf",
    },

    "ppt": {
        "pdf",
    },

    "jpg": {
        "pdf",
    },

    "jpeg": {
        "pdf",
    },

    "png": {
        "pdf",
    },

    "webp": {
        "pdf",
    },
}


# ============================================================
# MIME TYPES
# ============================================================

MEDIA_TYPES = {
    "pdf": "application/pdf",

    "docx": (
        "application/"
        "vnd.openxmlformats-officedocument."
        "wordprocessingml.document"
    ),
}


# ============================================================
# CLEANUP
# ============================================================

def cleanup_workspace(workspace: Path) -> None:
    """
    Delete the temporary conversion workspace.
    """

    shutil.rmtree(
        workspace,
        ignore_errors=True,
    )


# ============================================================
# CONVERSION ENDPOINT
# ============================================================

@router.post("")
async def convert_file_endpoint(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    target_format: str = Form(...),
):

    # ========================================================
    # VALIDATE FILE
    # ========================================================

    if not file.filename:
        raise HTTPException(
            status_code=400,
            detail="No file selected.",
        )

    # ========================================================
    # SOURCE FORMAT
    # ========================================================

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

    # ========================================================
    # TARGET FORMAT
    # ========================================================

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

    # ========================================================
    # CONVERSION MATRIX
    # ========================================================

    allowed_targets = CONVERSION_MATRIX.get(
        source_format,
        set(),
    )

    if target_format not in allowed_targets:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Conversion from .{source_format} "
                f"to .{target_format} is not supported."
            ),
        )

    # ========================================================
    # CREATE WORKSPACE
    # ========================================================

    workspace = Path(
        tempfile.mkdtemp(
            prefix="docswitch_",
            dir=TEMP_DIR,
        )
    )

    input_path = (
        workspace
        / f"{uuid4().hex}.{source_format}"
    )

    output_directory = (
        workspace / "output"
    )

    total_size = 0

    try:

        # ====================================================
        # SAVE UPLOAD
        # ====================================================

        with input_path.open("wb") as buffer:

            while True:

                chunk = await file.read(
                    1024 * 1024
                )

                if not chunk:
                    break

                total_size += len(chunk)

                # --------------------------------------------
                # ENFORCE SIZE LIMIT
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

        # ====================================================
        # CONVERT
        # ====================================================

        converted_file = convert_file(
            input_file=input_path,
            output_directory=output_directory,
            target_format=target_format,
        )

        # ====================================================
        # OUTPUT FILENAME
        # ====================================================

        output_filename = (
            Path(file.filename).stem
            + "."
            + target_format
        )

        # ====================================================
        # CLOSE UPLOAD
        # ====================================================

        await file.close()

        # ====================================================
        # MIME TYPE
        # ====================================================

        media_type = MEDIA_TYPES.get(
            target_format,
            "application/octet-stream",
        )

        # ====================================================
        # CLEANUP AFTER RESPONSE
        # ====================================================

        background_tasks.add_task(
            cleanup_workspace,
            workspace,
        )

        # ====================================================
        # RETURN FILE
        # ====================================================

        return FileResponse(
            path=converted_file,
            media_type=media_type,
            filename=output_filename,
            background=background_tasks,
        )

    # ========================================================
    # HTTP ERRORS
    # ========================================================

    except HTTPException:

        await file.close()

        cleanup_workspace(
            workspace
        )

        raise

    # ========================================================
    # CONVERSION ERRORS
    # ========================================================

    except ConversionError as exc:

        await file.close()

        cleanup_workspace(
            workspace
        )

        raise HTTPException(
            status_code=500,
            detail=str(exc),
        ) from exc

    # ========================================================
    # UNEXPECTED ERRORS
    # ========================================================

    except Exception as exc:

        await file.close()

        cleanup_workspace(
            workspace
        )

        raise HTTPException(
            status_code=500,
            detail=(
                "An unexpected error occurred "
                "during conversion."
            ),
        ) from exc