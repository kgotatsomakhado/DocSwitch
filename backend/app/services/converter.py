from pathlib import Path
import subprocess
import tempfile
import uuid


# ============================================================
# DOCSWITCH CONVERSION ENGINE
# ============================================================

LIBREOFFICE_PATH = Path(
    r"C:\Program Files\LibreOffice\program\soffice.exe"
)

CONVERSION_TIMEOUT = 60


class ConversionError(Exception):
    """Raised when a file conversion fails."""


def convert_to_pdf(input_file: Path) -> Path:
    """
    Convert a supported document to PDF using LibreOffice.

    Returns:
        Path: Path to the generated PDF.
    """

    if not input_file.exists():
        raise ConversionError("Input file does not exist.")

    if not LIBREOFFICE_PATH.exists():
        raise ConversionError(
            "LibreOffice installation could not be found."
        )

    # --------------------------------------------------------
    # Create an isolated temporary output directory
    # --------------------------------------------------------

    output_directory = Path(
        tempfile.mkdtemp(
            prefix=f"docswitch_{uuid.uuid4().hex}_"
        )
    )

    try:
        command = [
            str(LIBREOFFICE_PATH),
            "--headless",
            "--convert-to",
            "pdf",
            "--outdir",
            str(output_directory),
            str(input_file),
        ]

        # ----------------------------------------------------
        # Execute LibreOffice
        # ----------------------------------------------------

        result = subprocess.run(
            command,
            capture_output=True,
            text=True,
            timeout=CONVERSION_TIMEOUT,
            check=False,
        )

        # ----------------------------------------------------
        # Check LibreOffice process
        # ----------------------------------------------------

        if result.returncode != 0:
            error_message = (
                result.stderr.strip()
                or result.stdout.strip()
                or "LibreOffice failed to convert the file."
            )

            raise ConversionError(error_message)

        # ----------------------------------------------------
        # Determine expected output filename
        # ----------------------------------------------------

        output_file = (
            output_directory
            / f"{input_file.stem}.pdf"
        )

        # ----------------------------------------------------
        # Verify conversion actually produced a file
        # ----------------------------------------------------

        if not output_file.exists():
            raise ConversionError(
                "Conversion completed but no PDF was produced."
            )

        if output_file.stat().st_size == 0:
            raise ConversionError(
                "LibreOffice produced an empty PDF."
            )

        return output_file

    except subprocess.TimeoutExpired as exc:
        raise ConversionError(
            "Conversion timed out. Please try a smaller or simpler file."
        ) from exc

    except ConversionError:
        raise

    except Exception as exc:
        raise ConversionError(
            "An unexpected error occurred during conversion."
        ) from exc