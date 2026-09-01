from pathlib import Path
import shutil
import subprocess
import tempfile


# ============================================================
# DOCSWITCH CONVERSION ENGINE
# ============================================================

LIBREOFFICE_PATH = Path(
    r"C:\Program Files\LibreOffice\program\soffice.exe"
)

CONVERSION_TIMEOUT = 60


class ConversionError(Exception):
    """Raised when a file conversion fails."""


def convert_to_pdf(input_file: Path, output_directory: Path) -> Path:
    """
    Convert a document to PDF using LibreOffice.

    The caller owns the temporary workspace and is responsible
    for deleting it after the conversion lifecycle is complete.
    """

    if not input_file.exists():
        raise ConversionError("Input file does not exist.")

    if not LIBREOFFICE_PATH.exists():
        raise ConversionError(
            "LibreOffice installation could not be found."
        )

    output_directory.mkdir(
        parents=True,
        exist_ok=True,
    )

    command = [
        str(LIBREOFFICE_PATH),
        "--headless",
        "--convert-to",
        "pdf",
        "--outdir",
        str(output_directory),
        str(input_file),
    ]

    try:
        result = subprocess.run(
            command,
            capture_output=True,
            text=True,
            timeout=CONVERSION_TIMEOUT,
            check=False,
        )

    except subprocess.TimeoutExpired as exc:
        raise ConversionError(
            "Conversion timed out. Please try a smaller "
            "or simpler file."
        ) from exc

    except Exception as exc:
        raise ConversionError(
            "Unable to start the conversion engine."
        ) from exc

    if result.returncode != 0:
        error_message = (
            result.stderr.strip()
            or result.stdout.strip()
            or "LibreOffice failed to convert the file."
        )

        raise ConversionError(error_message)

    output_file = (
        output_directory
        / f"{input_file.stem}.pdf"
    )

    if not output_file.exists():
        raise ConversionError(
            "Conversion completed but no PDF was produced."
        )

    if output_file.stat().st_size == 0:
        raise ConversionError(
            "LibreOffice produced an empty PDF."
        )

    return output_file