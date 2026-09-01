from pathlib import Path
import os
import shutil
import subprocess
from typing import Optional

from docx import Document
from docx.shared import Inches
from PIL import Image

try:
    import fitz  # PyMuPDF
except ImportError:
    fitz = None

try:
    from pdf2docx import Converter as PDF2DOCXConverter
except ImportError:
    PDF2DOCXConverter = None


# ============================================================
# DOCSWITCH CONVERSION ENGINE
# ============================================================

CONVERSION_TIMEOUT = 120


# ============================================================
# SUPPORTED FORMATS
# ============================================================

SUPPORTED_INPUTS = {
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

SUPPORTED_OUTPUTS = {
    "pdf",
    "docx",
}


# ============================================================
# CONVERSION ERROR
# ============================================================

class ConversionError(Exception):
    """
    Raised when a file conversion fails.
    """

    pass


# ============================================================
# LIBREOFFICE DISCOVERY
# ============================================================

def find_libreoffice() -> Optional[Path]:
    """
    Locate LibreOffice on the current machine.

    Priority:

    1. DOCSWITCH_LIBREOFFICE_PATH
    2. Standard Windows installation
    3. PATH
    """

    # --------------------------------------------------------
    # Environment variable
    # --------------------------------------------------------

    configured_path = os.getenv(
        "DOCSWITCH_LIBREOFFICE_PATH"
    )

    if configured_path:
        configured = Path(configured_path)

        if configured.exists() and configured.is_file():
            return configured

    # --------------------------------------------------------
    # Windows
    # --------------------------------------------------------

    windows_paths = [
        Path(
            r"C:\Program Files\LibreOffice\program\soffice.exe"
        ),
        Path(
            r"C:\Program Files (x86)\LibreOffice\program\soffice.exe"
        ),
    ]

    for path in windows_paths:
        if path.exists() and path.is_file():
            return path

    # --------------------------------------------------------
    # PATH
    # --------------------------------------------------------

    executable = shutil.which("soffice")

    if executable:
        return Path(executable)

    executable = shutil.which("libreoffice")

    if executable:
        return Path(executable)

    return None


# ============================================================
# VALIDATE INPUT
# ============================================================

def validate_input(input_file: Path) -> None:
    """
    Validate input file.
    """

    if not input_file.exists():
        raise ConversionError(
            "Input file does not exist."
        )

    if not input_file.is_file():
        raise ConversionError(
            "The selected input is not a valid file."
        )

    if input_file.stat().st_size == 0:
        raise ConversionError(
            "Input file is empty."
        )

    extension = (
        input_file.suffix
        .lower()
        .lstrip(".")
    )

    if extension not in SUPPORTED_INPUTS:
        raise ConversionError(
            f"Input format .{extension} is not supported."
        )


# ============================================================
# VALIDATE OUTPUT
# ============================================================

def validate_output(output_file: Path) -> Path:
    """
    Verify that conversion created a usable file.
    """

    if not output_file.exists():
        raise ConversionError(
            "Conversion completed but no output file was produced."
        )

    if not output_file.is_file():
        raise ConversionError(
            "The conversion output is not a valid file."
        )

    if output_file.stat().st_size == 0:
        raise ConversionError(
            "The conversion engine produced an empty file."
        )

    return output_file


# ============================================================
# LIBREOFFICE CONVERSION
# ============================================================

def run_libreoffice(
    input_file: Path,
    output_directory: Path,
    target_format: str,
) -> Path:
    """
    Convert an Office/document file using LibreOffice.

    A unique LibreOffice user profile is created for every
    conversion. This prevents profile locking and conflicts
    between multiple LibreOffice processes.
    """

    libreoffice = find_libreoffice()

    if not libreoffice:
        raise ConversionError(
            "LibreOffice could not be found. "
            "Install LibreOffice and make sure soffice.exe "
            "is available."
        )

    output_directory.mkdir(
        parents=True,
        exist_ok=True,
    )

    target_format = (
        target_format
        .lower()
        .strip()
        .lstrip(".")
    )

    # --------------------------------------------------------
    # Unique temporary LibreOffice profile
    # --------------------------------------------------------

    profile_directory = (
        output_directory
        / "_libreoffice_profile"
    )

    profile_directory.mkdir(
        parents=True,
        exist_ok=True,
    )

    # LibreOffice requires a file URL for UserInstallation.
    profile_url = profile_directory.resolve().as_uri()

    # --------------------------------------------------------
    # Command
    # --------------------------------------------------------

    command = [
        str(libreoffice),

        "--headless",

        "--invisible",

        "--nodefault",

        "--nologo",

        "--nofirststartwizard",

        f"-env:UserInstallation={profile_url}",

        "--convert-to",
        target_format,

        "--outdir",
        str(output_directory),

        str(input_file),
    ]

    print("------------------------------------------------------------")
    print("DocSwitch LibreOffice conversion")
    print("Executable:", libreoffice)
    print("Input:", input_file)
    print("Output directory:", output_directory)
    print("Target format:", target_format)
    print("------------------------------------------------------------")

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
            "LibreOffice conversion timed out after "
            f"{CONVERSION_TIMEOUT} seconds."
        ) from exc

    except FileNotFoundError as exc:

        raise ConversionError(
            "LibreOffice executable could not be started."
        ) from exc

    except PermissionError as exc:

        raise ConversionError(
            "Permission was denied while starting LibreOffice."
        ) from exc

    except OSError as exc:

        raise ConversionError(
            "Unable to start LibreOffice."
        ) from exc

    except Exception as exc:

        raise ConversionError(
            f"Unexpected LibreOffice error: {exc}"
        ) from exc

    # --------------------------------------------------------
    # DEBUG OUTPUT
    # --------------------------------------------------------

    stdout = (
        result.stdout.strip()
        if result.stdout
        else ""
    )

    stderr = (
        result.stderr.strip()
        if result.stderr
        else ""
    )

    print("LibreOffice return code:", result.returncode)

    if stdout:
        print("LibreOffice stdout:")
        print(stdout)

    if stderr:
        print("LibreOffice stderr:")
        print(stderr)

    # --------------------------------------------------------
    # Process failed
    # --------------------------------------------------------

    if result.returncode != 0:

        error_message = (
            stderr
            or stdout
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
    # Sometimes LibreOffice reports success but the expected
    # file does not exist. Search the output directory before
    # declaring failure.
    # --------------------------------------------------------

    if not output_file.exists():

        candidates = [
            path
            for path in output_directory.iterdir()
            if path.is_file()
            and path.suffix.lower() == f".{target_format}"
        ]

        if len(candidates) == 1:
            output_file = candidates[0]

    return validate_output(output_file)


# ============================================================
# IMAGE → PDF
# ============================================================

def image_to_pdf(
    input_file: Path,
    output_directory: Path,
) -> Path:

    output_directory.mkdir(
        parents=True,
        exist_ok=True,
    )

    output_file = (
        output_directory
        / f"{input_file.stem}.pdf"
    )

    try:

        with Image.open(input_file) as image:

            rgb_image = image.convert("RGB")

            rgb_image.save(
                output_file,
                "PDF",
                resolution=150.0,
            )

    except Exception as exc:

        raise ConversionError(
            "Unable to convert the image to PDF."
        ) from exc

    return validate_output(output_file)


# ============================================================
# IMAGE → DOCX
# ============================================================

def image_to_docx(
    input_file: Path,
    output_directory: Path,
) -> Path:

    output_directory.mkdir(
        parents=True,
        exist_ok=True,
    )

    output_file = (
        output_directory
        / f"{input_file.stem}.docx"
    )

    try:

        document = Document()

        section = document.sections[0]

        available_width = (
            section.page_width
            - section.left_margin
            - section.right_margin
        )

        with Image.open(input_file) as image:

            width_px, height_px = image.size

            if width_px <= 0 or height_px <= 0:
                raise ConversionError(
                    "The image dimensions are invalid."
                )

            aspect_ratio = height_px / width_px

            width_inches = (
                available_width / 914400
            )

            height_inches = (
                width_inches * aspect_ratio
            )

            document.add_picture(
                str(input_file),
                width=Inches(width_inches),
                height=Inches(height_inches),
            )

        document.save(output_file)

    except ConversionError:
        raise

    except Exception as exc:

        raise ConversionError(
            "Unable to convert the image to DOCX."
        ) from exc

    return validate_output(output_file)


# ============================================================
# PDF → DOCX
# ============================================================

def pdf_to_docx(
    input_file: Path,
    output_directory: Path,
) -> Path:

    if PDF2DOCXConverter is None:

        raise ConversionError(
            "PDF to DOCX support is unavailable. "
            "Install pdf2docx."
        )

    output_directory.mkdir(
        parents=True,
        exist_ok=True,
    )

    output_file = (
        output_directory
        / f"{input_file.stem}.docx"
    )

    converter = None

    try:

        converter = PDF2DOCXConverter(
            str(input_file)
        )

        converter.convert(
            str(output_file)
        )

    except Exception as exc:

        raise ConversionError(
            "Unable to convert the PDF to DOCX. "
            "The PDF may contain complex layouts, "
            "scanned pages, unusual fonts, or content "
            "that cannot be reconstructed as an editable "
            "Word document."
        ) from exc

    finally:

        if converter is not None:

            try:
                converter.close()

            except Exception:
                pass

    return validate_output(output_file)


# ============================================================
# PDF → RENDERED PAGES
# ============================================================

def render_pdf_pages(
    input_file: Path,
    output_directory: Path,
) -> list[Path]:

    if fitz is None:

        raise ConversionError(
            "PDF rendering support is unavailable. "
            "Install PyMuPDF."
        )

    output_directory.mkdir(
        parents=True,
        exist_ok=True,
    )

    rendered_pages: list[Path] = []

    try:

        pdf = fitz.open(
            str(input_file)
        )

        try:

            for page_number in range(len(pdf)):

                page = pdf.load_page(
                    page_number
                )

                matrix = fitz.Matrix(
                    1.5,
                    1.5,
                )

                pixmap = page.get_pixmap(
                    matrix=matrix,
                    alpha=False,
                )

                page_path = (
                    output_directory
                    / (
                        f"{input_file.stem}"
                        f"_page_{page_number + 1}.png"
                    )
                )

                pixmap.save(
                    str(page_path)
                )

                rendered_pages.append(
                    page_path
                )

        finally:

            pdf.close()

    except Exception as exc:

        raise ConversionError(
            "Unable to render the PDF pages."
        ) from exc

    if not rendered_pages:

        raise ConversionError(
            "The PDF contains no renderable pages."
        )

    return rendered_pages


# ============================================================
# PDF → VISUAL DOCX
# ============================================================

def pdf_to_visual_docx(
    input_file: Path,
    output_directory: Path,
) -> Path:

    if fitz is None:

        raise ConversionError(
            "PDF rendering support is unavailable. "
            "Install PyMuPDF."
        )

    output_directory.mkdir(
        parents=True,
        exist_ok=True,
    )

    render_directory = (
        output_directory
        / "_rendered_pages"
    )

    output_file = (
        output_directory
        / f"{input_file.stem}.docx"
    )

    pages = render_pdf_pages(
        input_file=input_file,
        output_directory=render_directory,
    )

    try:

        document = Document()

        section = document.sections[0]

        available_width = (
            section.page_width
            - section.left_margin
            - section.right_margin
        )

        width_inches = (
            available_width / 914400
        )

        for index, page_path in enumerate(pages):

            if index > 0:
                document.add_page_break()

            document.add_picture(
                str(page_path),
                width=Inches(width_inches),
            )

        document.save(output_file)

    except Exception as exc:

        raise ConversionError(
            "Unable to create the DOCX document from the PDF."
        ) from exc

    return validate_output(output_file)


# ============================================================
# OFFICE → PDF
# ============================================================

def office_to_pdf(
    input_file: Path,
    output_directory: Path,
) -> Path:

    return run_libreoffice(
        input_file=input_file,
        output_directory=output_directory,
        target_format="pdf",
    )


# ============================================================
# OFFICE → DOCX
# ============================================================

def office_to_docx(
    input_file: Path,
    output_directory: Path,
) -> Path:

    return run_libreoffice(
        input_file=input_file,
        output_directory=output_directory,
        target_format="docx",
    )


# ============================================================
# PRESENTATION → DOCX
# ============================================================

def presentation_to_docx(
    input_file: Path,
    output_directory: Path,
) -> Path:

    pdf_directory = (
        output_directory
        / "_presentation_pdf"
    )

    pdf_file = office_to_pdf(
        input_file=input_file,
        output_directory=pdf_directory,
    )

    return pdf_to_visual_docx(
        input_file=pdf_file,
        output_directory=output_directory,
    )


# ============================================================
# GENERAL CONVERSION DISPATCHER
# ============================================================

def convert_file(
    input_file: Path,
    output_directory: Path,
    target_format: str,
) -> Path:

    validate_input(input_file)

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

    source_format = (
        input_file.suffix
        .lower()
        .lstrip(".")
    )

    # --------------------------------------------------------
    # SAME FORMAT
    # --------------------------------------------------------

    if source_format == target_format:

        raise ConversionError(
            f"The file is already in "
            f"{target_format.upper()} format."
        )

    # --------------------------------------------------------
    # PDF → DOCX
    # --------------------------------------------------------

    if (
        source_format == "pdf"
        and target_format == "docx"
    ):

        return pdf_to_docx(
            input_file=input_file,
            output_directory=output_directory,
        )

    # --------------------------------------------------------
    # DOCX → PDF
    # --------------------------------------------------------

    if (
        source_format == "docx"
        and target_format == "pdf"
    ):

        return office_to_pdf(
            input_file=input_file,
            output_directory=output_directory,
        )

    # --------------------------------------------------------
    # DOCUMENT → PDF
    # --------------------------------------------------------

    if target_format == "pdf":

        if source_format in {
            "doc",
            "txt",
            "rtf",
            "pptx",
            "ppt",
        }:

            return office_to_pdf(
                input_file=input_file,
                output_directory=output_directory,
            )

        if source_format in {
            "jpg",
            "jpeg",
            "png",
            "webp",
        }:

            return image_to_pdf(
                input_file=input_file,
                output_directory=output_directory,
            )

    # --------------------------------------------------------
    # DOCUMENT → DOCX
    # --------------------------------------------------------

    if target_format == "docx":

        if source_format in {
            "doc",
            "txt",
            "rtf",
        }:

            return office_to_docx(
                input_file=input_file,
                output_directory=output_directory,
            )

        if source_format in {
            "pptx",
            "ppt",
        }:

            return presentation_to_docx(
                input_file=input_file,
                output_directory=output_directory,
            )

        if source_format in {
            "jpg",
            "jpeg",
            "png",
            "webp",
        }:

            return image_to_docx(
                input_file=input_file,
                output_directory=output_directory,
            )

    # --------------------------------------------------------
    # UNSUPPORTED
    # --------------------------------------------------------

    raise ConversionError(
        f"Conversion from .{source_format} "
        f"to .{target_format} is not supported."
    )


# ============================================================
# CONVENIENCE FUNCTIONS
# ============================================================

def convert_to_pdf(
    input_file: Path,
    output_directory: Path,
) -> Path:

    return convert_file(
        input_file=input_file,
        output_directory=output_directory,
        target_format="pdf",
    )


def convert_to_docx(
    input_file: Path,
    output_directory: Path,
) -> Path:

    return convert_file(
        input_file=input_file,
        output_directory=output_directory,
        target_format="docx",
    )