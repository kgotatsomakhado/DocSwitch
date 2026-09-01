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
    convert_to_pdf,
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
    "rtf": {"pdf"},
    "pptx": {"pdf"},
    "ppt": {"pdf"},
    "jpg": {"pdf"},
    "jpeg": {"pdf"},
    "png": {"pdf"},
    "webp": {"pdf"},
}


# ============================================================
# CLEANUP
# ============================================================

def cleanup_workspace(workspace: Path):
    """
    Delete the temporary conversion workspace.

    This runs as a FastAPI background task after the
    FileResponse has finished processing the response.
    """
    shutil.rmtree(
        workspace,
        ignore_errors=True,
    )


# ============================================================
# CONVERSION ENDPOINT
# ============================================================

@router.post("")
async def convert_file(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    target_format: str = Form(...),
):

    # --------------------------------------------------------
    # Validate filename
    # --------------------------------------------------------

    if not file.filename:
        raise HTTPException(
            status_code=400,
            detail="No file selected.",
        )

    # --------------------------------------------------------
    # Extract source extension
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
    # Normalize target format
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
    # Check conversion matrix
    # --------------------------------------------------------

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
    # CREATE ISOLATED CONVERSION WORKSPACE
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

    output_directory = workspace / "output"

    total_size = 0

    try:

        # ----------------------------------------------------
        # Save uploaded file
        # ----------------------------------------------------

        with input_path.open("wb") as buffer:

            while True:

                chunk = await file.read(1024 * 1024)

                if not chunk:
                    break

                total_size += len(chunk)

                # --------------------------------------------
                # Enforce upload size during streaming
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

        # ----------------------------------------------------
        # Conversion
        # ----------------------------------------------------

        if target_format == "pdf":

            converted_file = convert_to_pdf(
                input_file=input_path,
                output_directory=output_directory,
            )

        else:

            raise ConversionError(
                "This conversion is not implemented yet."
            )

        # ----------------------------------------------------
        # Prepare download filename
        # ----------------------------------------------------

        output_filename = (
            Path(file.filename).stem
            + "."
            + target_format
        )

        # ----------------------------------------------------
        # Close uploaded file
        # ----------------------------------------------------

        await file.close()

        # ----------------------------------------------------
        # Schedule workspace cleanup
        #
        # IMPORTANT:
        # Do NOT delete the workspace here.
        #
        # FileResponse still needs access to converted_file.
        # FastAPI will execute this background task after
        # the response has been processed.
        # ----------------------------------------------------

        background_tasks.add_task(
            cleanup_workspace,
            workspace,
        )

        # ----------------------------------------------------
        # Return converted file
        # ----------------------------------------------------

        return FileResponse(
            path=converted_file,
            media_type="application/pdf",
            filename=output_filename,
            background=background_tasks,
        )

    except HTTPException:

        await file.close()

        # The response will not be sent successfully,
        # so cleanup can happen immediately.
        cleanup_workspace(workspace)

        raise

    except ConversionError as exc:

        await file.close()

        cleanup_workspace(workspace)

        raise HTTPException(
            status_code=500,
            detail=str(exc),
        ) from exc

    except Exception as exc:

        await file.close()

        cleanup_workspace(workspace)

        raise HTTPException(
            status_code=500,
            detail=(
                "An unexpected error occurred "
                "during conversion."
            ),
        ) from exc