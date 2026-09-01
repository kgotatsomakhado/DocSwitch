from pathlib import Path
import shutil
import tempfile
from uuid import uuid4

from fastapi import (
    APIRouter,
    File,
    Form,
    HTTPException,
    UploadFile,
)
from fastapi.responses import Response

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

def cleanup_workspace(workspace: Path) -> None:
    """
    Delete the temporary conversion workspace.
    """

    shutil.rmtree(
        workspace,
        ignore_errors=True,
    )

    print(
        f"DocSwitch workspace cleaned: {workspace}"
    )


# ============================================================
# SANITIZE OUTPUT FILENAME
# ============================================================

def sanitize_filename(filename: str) -> str:
    """
    Create a safe browser download filename.
    """

    name = Path(filename).name

    name = (
        name
        .replace('"', "")
        .replace("\r", "")
        .replace("\n", "")
    )

    if not name:
        name = "converted-file"

    return name


# ============================================================
# CONVERSION ENDPOINT
# ============================================================

@router.post("")
async def convert_file_endpoint(
    file: UploadFile = File(...),
    target_format: str = Form(...),
):
    """
    Convert an uploaded file and return the converted
    binary directly to the frontend.

    Request:

        multipart/form-data

        file
        target_format

    Response:

        Converted PDF or DOCX binary.
    """

    print()
    print("=" * 60)
    print("DOCSWITCH CONVERSION REQUEST")
    print("=" * 60)

    # ========================================================
    # VALIDATE UPLOAD
    # ========================================================

    if not file.filename:
        raise HTTPException(
            status_code=400,
            detail="No file selected.",
        )

    original_filename = file.filename

    print(
        f"Filename: {original_filename}"
    )

    # ========================================================
    # SOURCE FORMAT
    # ========================================================

    source_format = (
        Path(original_filename)
        .suffix
        .lower()
        .lstrip(".")
    )

    print(
        f"Source format: {source_format}"
    )

    if source_format not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=(
                f".{source_format.upper()} files are not supported. "
                "Supported formats are PDF, DOCX, DOC, TXT, RTF, "
                "PPTX, PPT, JPG, JPEG, PNG and WEBP."
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

    print(
        f"Requested target: {target_format}"
    )

    if target_format not in ALLOWED_TARGET_FORMATS:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Conversion to .{target_format} is not supported. "
                "DocSwitch currently outputs PDF and DOCX."
            ),
        )

    # ========================================================
    # SAME FORMAT
    # ========================================================

    if source_format == target_format:
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

    print(
        f"Workspace: {workspace}"
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

        print(
            "Saving uploaded file..."
        )

        with input_path.open("wb") as buffer:

            while True:

                chunk = await file.read(
                    1024 * 1024
                )

                if not chunk:
                    break

                total_size += len(chunk)

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
            f"Upload saved: {total_size} bytes"
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

        print(
            f"Input file verified: {input_path}"
        )

        # ====================================================
        # CONVERT
        # ====================================================

        print()
        print("-" * 60)
        print("STARTING CONVERSION")
        print("-" * 60)

        print(
            f"Source: {source_format}"
        )

        print(
            f"Target: {target_format}"
        )

        print(
            f"Input: {input_path}"
        )

        print(
            f"Output: {output_directory}"
        )

        print("-" * 60)

        converted_file = convert_file(
            input_file=input_path,
            output_directory=output_directory,
            target_format=target_format,
        )

        # ====================================================
        # VERIFY CONVERTED FILE
        # ====================================================

        if not converted_file.exists():
            raise ConversionError(
                "Conversion completed but output file was not found."
            )

        if not converted_file.is_file():
            raise ConversionError(
                "Conversion output is not a valid file."
            )

        output_size = converted_file.stat().st_size

        if output_size == 0:
            raise ConversionError(
                "Conversion produced an empty file."
            )

        print()
        print("-" * 60)
        print("CONVERSION SUCCESSFUL")
        print("-" * 60)

        print(
            f"Output: {converted_file}"
        )

        print(
            f"Size: {output_size} bytes"
        )

        print("-" * 60)

        # ====================================================
        # READ OUTPUT INTO MEMORY
        # ====================================================

        print(
            "Reading converted file into memory..."
        )

        converted_bytes = converted_file.read_bytes()

        if not converted_bytes:
            raise ConversionError(
                "Unable to read the converted file."
            )

        print(
            f"Binary payload ready: {len(converted_bytes)} bytes"
        )

        # ====================================================
        # OUTPUT FILENAME
        # ====================================================

        safe_original_name = sanitize_filename(
            original_filename
        )

        output_filename = (
            Path(safe_original_name).stem
            + "."
            + target_format
        )

        print(
            f"Download filename: {output_filename}"
        )

        # ====================================================
        # MIME TYPE
        # ====================================================

        media_type = MEDIA_TYPES.get(
            target_format,
            "application/octet-stream",
        )

        print(
            f"Media type: {media_type}"
        )

        # ====================================================
        # CLEAN WORKSPACE
        #
        # IMPORTANT:
        #
        # The converted file has already been loaded
        # completely into memory.
        #
        # Therefore it is now safe to remove the
        # temporary workspace BEFORE returning.
        # ====================================================

        cleanup_workspace(workspace)

        # ====================================================
        # RETURN BINARY DIRECTLY
        # ====================================================

        print(
            "Returning converted binary to frontend..."
        )

        return Response(
            content=converted_bytes,
            media_type=media_type,
            headers={
                "Content-Disposition": (
                    f'attachment; filename="{output_filename}"'
                ),
                "Content-Length": str(
                    len(converted_bytes)
                ),
            },
        )

    # ========================================================
    # HTTP ERRORS
    # ========================================================

    except HTTPException:

        try:
            await file.close()
        except Exception:
            pass

        cleanup_workspace(workspace)

        raise

    # ========================================================
    # CONVERSION ERRORS
    # ========================================================

    except ConversionError as exc:

        try:
            await file.close()
        except Exception:
            pass

        cleanup_workspace(workspace)

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

        cleanup_workspace(workspace)

        print(
            "DocSwitch unexpected conversion error:",
            repr(exc),
        )

        raise HTTPException(
            status_code=500,
            detail=(
                "An unexpected error occurred "
                "during conversion."
            ),
        ) from exc