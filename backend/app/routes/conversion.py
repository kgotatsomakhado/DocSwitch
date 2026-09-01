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

from fastapi.concurrency import run_in_threadpool

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
        "docx",
    },

    "ppt": {
        "pdf",
        "docx",
    },

    "jpg": {
        "pdf",
        "docx",
    },

    "jpeg": {
        "pdf",
        "docx",
    },

    "png": {
        "pdf",
        "docx",
    },

    "webp": {
        "pdf",
        "docx",
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

def cleanup_workspace(
    workspace: Path,
) -> None:
    """
    Delete a temporary conversion workspace.
    """

    try:

        shutil.rmtree(
            workspace,
            ignore_errors=True,
        )

    except Exception as exc:

        print(
            "DocSwitch cleanup error:",
            repr(exc),
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
    """
    Convert an uploaded file.

    Request:

        multipart/form-data

        file
        target_format

    Response:

        Converted binary file.
    """

    workspace = None

    # ========================================================
    # VALIDATE FILE NAME
    # ========================================================

    if not file.filename:

        await file.close()

        raise HTTPException(
            status_code=400,
            detail="No file selected.",
        )

    original_filename = Path(
        file.filename
    ).name

    # ========================================================
    # SOURCE FORMAT
    # ========================================================

    source_format = (
        Path(original_filename)
        .suffix
        .lower()
        .lstrip(".")
    )

    if source_format not in ALLOWED_EXTENSIONS:

        await file.close()

        raise HTTPException(
            status_code=400,
            detail=(
                f".{source_format.upper()} files "
                "are not supported. "
                "Supported formats are PDF, DOCX, DOC, TXT, "
                "RTF, PPTX, PPT, JPG, JPEG, PNG and WEBP."
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

        await file.close()

        raise HTTPException(
            status_code=400,
            detail=(
                f"Conversion to .{target_format} "
                "is not supported. "
                "DocSwitch currently outputs PDF and DOCX."
            ),
        )

    # ========================================================
    # SAME FORMAT
    # ========================================================

    if source_format == target_format:

        await file.close()

        raise HTTPException(
            status_code=400,
            detail=(
                f"Your file is already in "
                f"{target_format.upper()} format."
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

        await file.close()

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
        workspace
        / "output"
    )

    total_size = 0

    print("========================================")
    print("DOCSWITCH — CONVERSION REQUEST")
    print("========================================")
    print("Filename:", original_filename)
    print("Source:", source_format)
    print("Target:", target_format)
    print("Workspace:", workspace)
    print("========================================")

    try:

        # ====================================================
        # SAVE UPLOAD
        # ====================================================

        print("Saving uploaded file...")

        with input_path.open("wb") as buffer:

            while True:

                chunk = await file.read(
                    1024 * 1024
                )

                if not chunk:
                    break

                total_size += len(chunk)

                # --------------------------------------------
                # SIZE LIMIT
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

        print(
            "Upload saved:",
            total_size,
            "bytes",
        )

        # ====================================================
        # CLOSE UPLOAD STREAM
        # ====================================================

        await file.close()

        print(
            "Upload stream closed."
        )

        # ====================================================
        # VERIFY INPUT
        # ====================================================

        if not input_path.exists():

            raise ConversionError(
                "Uploaded file could not be saved."
            )

        if input_path.stat().st_size == 0:

            raise ConversionError(
                "Uploaded file is empty."
            )

        # ====================================================
        # CONVERT
        # ====================================================

        print("Starting conversion...")
        print(
            "Running conversion in worker thread."
        )

        converted_file = await run_in_threadpool(
            convert_file,
            input_path=input_path,
            output_directory=output_directory,
            target_format=target_format,
        )

        print(
            "Conversion completed:",
            converted_file,
        )

        # ====================================================
        # VERIFY OUTPUT
        # ====================================================

        if not converted_file.exists():

            raise ConversionError(
                "Conversion completed but "
                "the output file does not exist."
            )

        if converted_file.stat().st_size == 0:

            raise ConversionError(
                "The converted file is empty."
            )

        # ====================================================
        # OUTPUT FILENAME
        # ====================================================

        output_filename = (
            Path(original_filename).stem
            + "."
            + target_format
        )

        # ====================================================
        # MIME TYPE
        # ========================================================

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
        # RETURN BINARY FILE
        # ====================================================

        print("========================================")
        print("RETURNING FILE TO FRONTEND")
        print("========================================")
        print("Output:", converted_file)
        print("Filename:", output_filename)
        print(
            "Size:",
            converted_file.stat().st_size,
            "bytes",
        )
        print("MIME:", media_type)
        print("========================================")

        return FileResponse(
            path=str(converted_file),
            media_type=media_type,
            filename=output_filename,
            background=background_tasks,
        )

    # ========================================================
    # HTTP ERRORS
    # ========================================================

    except HTTPException:

        try:
            await file.close()
        except Exception:
            pass

        cleanup_workspace(
            workspace
        )

        raise

    # ========================================================
    # CONVERSION ERRORS
    # ========================================================

    except ConversionError as exc:

        try:
            await file.close()
        except Exception:
            pass

        cleanup_workspace(
            workspace
        )

        print(
            "DocSwitch conversion error:",
            repr(exc),
        )

        raise HTTPException(
            status_code=500,
            detail=str(exc),
        ) from exc

    # ========================================================
    # UNEXPECTED ERRORS
    # ========================================================

    except Exception as exc:

        try:
            await file.close()
        except Exception:
            pass

        cleanup_workspace(
            workspace
        )

        print(
            "========================================"
        )

        print(
            "DOCSWITCH UNEXPECTED ERROR"
        )

        print(
            repr(exc)
        )

        print(
            "========================================"
        )

        raise HTTPException(
            status_code=500,
            detail=(
                "An unexpected error occurred "
                "during conversion."
            ),
        ) from exc