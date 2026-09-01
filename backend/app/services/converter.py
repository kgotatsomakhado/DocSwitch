from pathlib import Path
import subprocess


# ============================================================
# DOCSWITCH CONVERSION ENGINE
# ============================================================

LIBREOFFICE_PATH = Path(
    r"C:\Program Files\LibreOffice\program\soffice.exe"
)

CONVERSION_TIMEOUT = 60


class ConversionError(Exception):
    """
    Raised when a file conversion fails.
    """
    pass


# ============================================================
# FORMAT CONFIGURATION
# ============================================================

SUPPORTED_OUTPUTS = {
    "pdf",
    "docx",
}


# ============================================================
# LIBREOFFICE CONVERTER
# ============================================================

def convert_file(
    input_file: Path,
    output_directory: Path,
    target_format: str,
) -> Path:
    """
    Convert a file using LibreOffice.

    Supports output to:
        - PDF
        - DOCX

    The caller owns the temporary workspace and is
    responsible for deleting it after the response lifecycle.
    """

    # --------------------------------------------------------
    # Validate input
    # --------------------------------------------------------

    if not input_file.exists():
        raise ConversionError(
            "Input file does not exist."
        )

    # --------------------------------------------------------
    # Validate LibreOffice
    # --------------------------------------------------------

    if not LIBREOFFICE_PATH.exists():
        raise ConversionError(
            "LibreOffice installation could not be found."
        )

    # --------------------------------------------------------
    # Normalize target
    # --------------------------------------------------------

    target_format = (
        target_format
        .lower()
        .strip()
        .lstrip(".")
    )

    if target_format not in SUPPORTED_OUTPUTS:
        raise ConversionError(
            f"Conversion to .{target_format} is not supported."
        )

    # --------------------------------------------------------
    # Prepare output directory
    # --------------------------------------------------------

    output_directory.mkdir(
        parents=True,
        exist_ok=True,
    )

    # --------------------------------------------------------
    # LibreOffice command
    # --------------------------------------------------------

    command = [
        str(LIBREOFFICE_PATH),
        "--headless",
        "--convert-to",
        target_format,
        "--outdir",
        str(output_directory),
        str(input_file),
    ]

    # --------------------------------------------------------
    # Execute LibreOffice
    # --------------------------------------------------------

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

    # --------------------------------------------------------
    # Check LibreOffice result
    # --------------------------------------------------------

    if result.returncode != 0:
        error_message = (
            result.stderr.strip()
            or result.stdout.strip()
            or "LibreOffice failed to convert the file."
        )

        raise ConversionError(
            error_message
        )

    # --------------------------------------------------------
    # Expected output
    # --------------------------------------------------------

    output_file = (
        output_directory
        / f"{input_file.stem}.{target_format}"
    )

    # --------------------------------------------------------
    # Verify output
    # --------------------------------------------------------

    if not output_file.exists():
        raise ConversionError(
            "Conversion completed but no output file was produced."
        )

    if output_file.stat().st_size == 0:
        raise ConversionError(
            "LibreOffice produced an empty output file."
        )

    return output_file


# ============================================================
# PDF CONVENIENCE FUNCTION
# ============================================================

def convert_to_pdf(
    input_file: Path,
    output_directory: Path,
) -> Path:
    """
    Convert a file to PDF.
    """

    return convert_file(
        input_file=input_file,
        output_directory=output_directory,
        target_format="pdf",
    )


# ============================================================
# DOCX CONVENIENCE FUNCTION
# ============================================================

def convert_to_docx(
    input_file: Path,
    output_directory: Path,
) -> Path:
    """
    Convert a file to DOCX.
    """

    return convert_file(
        input_file=input_file,
        output_directory=output_directory,
        target_format="docx",
    )