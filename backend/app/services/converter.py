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

    Supports:
        - DOCSWITCH_LIBREOFFICE_PATH environment variable
        - Windows installations
        - PATH-based installations
        - Linux installations
    """

    # --------------------------------------------------------
    # Explicit environment variable
    # --------------------------------------------------------

    configured_path = os.getenv("DOCSWITCH_LIBREOFFICE_PATH")

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
# VALIDATION
# ============================================================

def validate_input(input_file: Path) -> None:
    """
    Validate that the input file exists, is not empty,
    and uses a supported extension.
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
# OUTPUT VALIDATION
# ============================================================

def validate_output(output_file: Path) -> Path:
    """
    Verify that the conversion produced a valid file.
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
# LIBREOFFICE COMMAND
# ============================================================

def run_libreoffice(
    input_file: Path,
    output_directory: Path,
    target_format: str,
) -> Path:
    """
    Use LibreOffice for native office/document conversions.
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

    command = [
        str(libreoffice),
        "--headless",
        "--convert-to",
        target_format,
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

    except OSError as exc:
        raise ConversionError(
            "Unable to start LibreOffice. "
            "Make sure LibreOffice is installed correctly."
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
        / f"{input_file.stem}.{target_format}"
    )

    return validate_output(output_file)


# ============================================================
# IMAGE → PDF
# ============================================================

def image_to_pdf(
    input_file: Path,
    output_directory: Path,
) -> Path:
    """
    Convert JPG/JPEG/PNG/WEBP to PDF.
    """

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

            image = image.convert("RGB")

            image.save(
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
    """
    Convert an image into a DOCX document.

    The image is inserted into the document while preserving
    its aspect ratio.
    """

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
    """
    Convert PDF to editable DOCX using pdf2docx.
    """

    if PDF2DOCXConverter is None:
        raise ConversionError(
            "PDF to DOCX support is unavailable. "
            "Install the pdf2docx package."
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
# PDF → IMAGES
# ============================================================

def render_pdf_pages(
    input_file: Path,
    output_directory: Path,
) -> list[Path]:
    """
    Render PDF pages to PNG files.

    Used when a PDF needs to be embedded into a DOCX
    while preserving visual appearance.
    """

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

        pdf = fitz.open(str(input_file))

        try:

            for page_number in range(len(pdf)):

                page = pdf.load_page(page_number)

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
    """
    Create a DOCX containing rendered PDF pages.

    This preserves visual appearance when editable PDF
    reconstruction is unreliable.
    """

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
# OFFICE/DOCUMENT → PDF
# ============================================================

def office_to_pdf(
    input_file: Path,
    output_directory: Path,
) -> Path:
    """
    Convert Office/document formats to PDF through LibreOffice.
    """

    return run_libreoffice(
        input_file=input_file,
        output_directory=output_directory,
        target_format="pdf",
    )


# ============================================================
# OFFICE/DOCUMENT → DOCX
# ============================================================

def office_to_docx(
    input_file: Path,
    output_directory: Path,
) -> Path:
    """
    Convert supported Office/document formats to DOCX
    through LibreOffice.
    """

    return run_libreoffice(
        input_file=input_file,
        output_directory=output_directory,
        target_format="docx",
    )


# ============================================================
# PPT/PPTX → DOCX
# ============================================================

def presentation_to_docx(
    input_file: Path,
    output_directory: Path,
) -> Path:
    """
    Convert a presentation to PDF using LibreOffice and then
    place the rendered slides into a DOCX.

    This prioritizes visual fidelity.
    """

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
    """
    Main DocSwitch conversion dispatcher.

    Supported inputs:
        PDF
        DOCX
        DOC
        TXT
        RTF
        PPTX
        PPT
        JPG
        JPEG
        PNG
        WEBP

    Supported outputs:
        PDF
        DOCX
    """

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
    # Prevent same-format conversion
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
    # Office/document → PDF
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
    # Office/document → DOCX
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
    # Unsupported combination
    # --------------------------------------------------------

    raise ConversionError(
        f"Conversion from .{source_format} "
        f"to .{target_format} is not supported."
    )


# ============================================================
# PDF CONVENIENCE FUNCTION
# ============================================================

def convert_to_pdf(
    input_file: Path,
    output_directory: Path,
) -> Path:
    """
    Convert a supported input file to PDF.
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
    Convert a supported input file to DOCX.
    """

    return convert_file(
        input_file=input_file,
        output_directory=output_directory,
        target_format="docx",
    )