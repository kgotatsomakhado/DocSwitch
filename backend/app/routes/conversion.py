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
    Delete a temporary DocSwitch conversion workspace.
    """

    if not workspace.exists():
        return

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
    Convert an uploaded file.

    The converted file remains in the temporary workspace.

    Response:

        {
            "success": true,
            "conversion_id": "...",
            "filename": "...",
            "target_format": "pdf",
            "size": 123456,
            "download_url": "/api/v1/convert/download/..."
        }

    The frontend uses download_url to retrieve the
    converted file through the download endpoint.
    """

    print()
    print("=" * 60)
    print("DOCSWITCH CONVERSION REQUEST")
    print("=" * 60)

    workspace = None

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

    conversion_id = workspace.name

    print(
        f"Workspace: {workspace}"
    )

    print(
        f"Conversion ID: {conversion_id}"
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
        # RENAME OUTPUT TO FINAL DOWNLOAD NAME
        # ====================================================

        final_output_path = (
            output_directory
            / output_filename
        )

        if converted_file != final_output_path:
            if final_output_path.exists():
                final_output_path.unlink()

            converted_file.rename(
                final_output_path
            )

        print(
            f"Final output path: {final_output_path}"
        )

        # ====================================================
        # VERIFY FINAL OUTPUT
        # ====================================================

        if not final_output_path.exists():
            raise ConversionError(
                "Converted file could not be prepared for download."
            )

        final_output_size = (
            final_output_path.stat().st_size
        )

        if final_output_size == 0:
            raise ConversionError(
                "Final converted file is empty."
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
        # IMPORTANT:
        # DO NOT DELETE THE WORKSPACE HERE.
        #
        # The file must remain available for the frontend's
        # subsequent GET download request.
        # ====================================================

        download_url = (
            f"/api/v1/convert/download/"
            f"{conversion_id}"
        )

        print()
        print("-" * 60)
        print("CONVERSION ARTIFACT READY")
        print("-" * 60)

        print(
            f"Conversion ID: {conversion_id}"
        )

        print(
            f"Filename: {output_filename}"
        )

        print(
            f"Path: {final_output_path}"
        )

        print(
            f"Size: {final_output_size} bytes"
        )

        print(
            f"Download URL: {download_url}"
        )

        print("-" * 60)

        # ====================================================
        # RETURN JSON
        # ====================================================

        return {
            "success": True,
            "conversion_id": conversion_id,
            "filename": output_filename,
            "target_format": target_format,
            "size": final_output_size,
            "media_type": media_type,
            "download_url": download_url,
        }

    # ========================================================
    # HTTP ERRORS
    # ========================================================

    except HTTPException:

        try:
            await file.close()
        except Exception:
            pass

        if workspace:
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

        if workspace:
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

        if workspace:
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


# ============================================================
# DOWNLOAD ENDPOINT
# ============================================================

@router.get("/download/{conversion_id}")
async def download_converted_file(
    conversion_id: str,
    background_tasks: BackgroundTasks,
):
    """
    Download a previously converted file.

    The conversion workspace is deleted after FastAPI
    finishes sending the file to the client.
    """

    print()
    print("=" * 60)
    print("DOCSWITCH DOWNLOAD REQUEST")
    print("=" * 60)

    print(
        f"Conversion ID: {conversion_id}"
    )

    # ========================================================
    # VALIDATE CONVERSION ID
    # ========================================================

    if not conversion_id:
        raise HTTPException(
            status_code=400,
            detail="Invalid conversion ID.",
        )

    # Prevent path traversal and unexpected characters.
    if (
        Path(conversion_id).name != conversion_id
        or not conversion_id.startswith("docswitch_")
    ):
        raise HTTPException(
            status_code=400,
            detail="Invalid conversion ID.",
        )

    # ========================================================
    # RESOLVE WORKSPACE
    # ========================================================

    workspace = (
        TEMP_DIR / conversion_id
    )

    # ========================================================
    # VERIFY WORKSPACE
    # ========================================================

    if not workspace.exists():
        raise HTTPException(
            status_code=404,
            detail=(
                "The converted file could not be found. "
                "It may have already been downloaded or expired."
            ),
        )

    if not workspace.is_dir():
        raise HTTPException(
            status_code=404,
            detail="Conversion workspace was not found.",
        )

    # ========================================================
    # OUTPUT DIRECTORY
    # ========================================================

    output_directory = (
        workspace / "output"
    )

    if not output_directory.exists():
        raise HTTPException(
            status_code=404,
            detail="Converted output was not found.",
        )

    # ========================================================
    # FIND CONVERTED FILE
    # ========================================================

    output_files = [
        path
        for path in output_directory.iterdir()
        if path.is_file()
        and path.suffix.lower() in {
            ".pdf",
            ".docx",
        }
    ]

    if not output_files:
        raise HTTPException(
            status_code=404,
            detail="No converted file is available for download.",
        )

    # ========================================================
    # EXPECT EXACTLY ONE OUTPUT
    # ========================================================

    if len(output_files) > 1:
        print(
            "Warning: multiple converted files found:",
            output_files,
        )

    converted_file = output_files[0]

    print(
        f"Download file: {converted_file}"
    )

    # ========================================================
    # VERIFY FILE
    # ========================================================

    if not converted_file.exists():
        raise HTTPException(
            status_code=404,
            detail="Converted file no longer exists.",
        )

    if not converted_file.is_file():
        raise HTTPException(
            status_code=404,
            detail="Converted output is not a valid file.",
        )

    file_size = converted_file.stat().st_size

    if file_size == 0:
        raise HTTPException(
            status_code=500,
            detail="Converted file is empty.",
        )

    # ========================================================
    # MIME TYPE
    # ========================================================

    extension = (
        converted_file.suffix
        .lower()
        .lstrip(".")
    )

    media_type = MEDIA_TYPES.get(
        extension,
        "application/octet-stream",
    )

    # ========================================================
    # CLEANUP AFTER DOWNLOAD
    # ========================================================

    background_tasks.add_task(
        cleanup_workspace,
        workspace,
    )

    print(
        f"Size: {file_size} bytes"
    )

    print(
        f"Media type: {media_type}"
    )

    print(
        "FileResponse prepared."
    )

    print(
        "Workspace scheduled for cleanup "
        "after download completes."
    )

    print(
        "=" * 60
    )

    # ========================================================
    # RETURN FILE
    # ========================================================

    return FileResponse(
        path=converted_file,
        media_type=media_type,
        filename=converted_file.name,
        background=background_tasks,
    )