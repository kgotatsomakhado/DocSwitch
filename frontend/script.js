/**
 * ============================================================
 * DocSwitch — Frontend Core Controller
 * ============================================================
 *
 * Frontend → Fetch POST → FastAPI → Binary Blob → Download
 *
 * POST:
 *   http://127.0.0.1:8000/api/v1/convert
 *
 * FormData:
 *   file
 *   target_format
 *
 * Expected response:
 *   Converted binary file
 * ============================================================
 */

document.addEventListener("DOMContentLoaded", () => {
  // ==========================================================
  // CONFIGURATION
  // ==========================================================

  const API_BASE_URL = "http://127.0.0.1:8000";
  const API_ENDPOINT = `${API_BASE_URL}/api/v1/convert`;

  const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024;

  const ALLOWED_EXTENSIONS = [
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
  ];

  const ALLOWED_OUTPUT_FORMATS = ["pdf", "docx"];

  // ==========================================================
  // STATE
  // ==========================================================

  let currentFile = null;
  let currentOutputBlob = null;
  let currentOutputFilename = null;
  let currentDownloadUrl = null;

  let conversionInProgress = false;

  // ==========================================================
  // DOM REFERENCES
  // ==========================================================

  const states = {
    empty: document.getElementById("state-empty"),
    selected: document.getElementById("state-selected"),
    converting: document.getElementById("state-converting"),
    success: document.getElementById("state-success"),
    error: document.getElementById("state-error"),
  };

  const dropZone = document.getElementById("drop-zone");
  const fileInput = document.getElementById("file-input");
  const browseTrigger = document.getElementById("browse-trigger");

  const selectedFileName = document.getElementById("selected-file-name");
  const selectedFileSize = document.getElementById("selected-file-size");

  const targetFormatSelect = document.getElementById("target-format-select");

  const btnRemoveFile = document.getElementById("btn-remove-file");
  const btnStartConvert = document.getElementById("btn-start-convert");

  const convertingFileName = document.getElementById("converting-file-name");

  const progressBar = document.getElementById("conversion-progress-bar");

  const successFileDetails = document.getElementById("success-file-details");

  const btnDownloadResult = document.getElementById("btn-download-result");

  const btnResetConverter = document.getElementById("btn-reset-converter");

  const errorMessageText = document.getElementById("error-message-text");

  const btnErrorRetry = document.getElementById("btn-error-retry");

  const liveRegion = document.getElementById("live-region");

  // ==========================================================
  // DEBUG
  // ==========================================================

  console.log("========================================");
  console.log("DocSwitch frontend initialized.");
  console.log("API endpoint:", API_ENDPOINT);
  console.log("Communication:", "FETCH");
  console.log("========================================");

  // ==========================================================
  // REQUIRED DOM CHECK
  // ==========================================================

  const requiredElements = {
    "state-empty": states.empty,
    "state-selected": states.selected,
    "state-converting": states.converting,
    "state-success": states.success,
    "state-error": states.error,
    "drop-zone": dropZone,
    "file-input": fileInput,
    "target-format-select": targetFormatSelect,
    "btn-start-convert": btnStartConvert,
    "btn-download-result": btnDownloadResult,
  };

  Object.entries(requiredElements).forEach(([name, element]) => {
    if (!element) {
      console.error(`DocSwitch: required DOM element missing: #${name}`);
    }
  });

  // ==========================================================
  // STATE ENGINE
  // ==========================================================

  function setActiveState(targetState) {
    Object.entries(states).forEach(([key, state]) => {
      if (!state) return;

      const active = key === targetState;

      state.classList.toggle("active", active);
      state.setAttribute("aria-hidden", String(!active));
    });

    console.log("UI state:", targetState);
  }

  // ==========================================================
  // ACCESSIBILITY
  // ==========================================================

  function announce(message) {
    if (!liveRegion) return;

    liveRegion.textContent = "";

    requestAnimationFrame(() => {
      liveRegion.textContent = message;
    });
  }

  // ==========================================================
  // HELPERS
  // ==========================================================

  function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes <= 0) {
      return "0 Bytes";
    }

    const units = ["Bytes", "KB", "MB", "GB"];

    const index = Math.min(
      Math.floor(Math.log(bytes) / Math.log(1024)),
      units.length - 1,
    );

    const value = bytes / Math.pow(1024, index);

    return `${parseFloat(value.toFixed(1))} ${units[index]}`;
  }

  function getFileExtension(filename) {
    if (!filename) return "";

    const lastDot = filename.lastIndexOf(".");

    if (lastDot === -1) return "";

    return filename
      .slice(lastDot + 1)
      .toLowerCase()
      .trim();
  }

  function getBaseName(filename) {
    if (!filename) {
      return "converted-file";
    }

    const lastDot = filename.lastIndexOf(".");

    if (lastDot === -1) {
      return filename;
    }

    return filename.substring(0, lastDot);
  }

  function releaseDownloadUrl() {
    if (currentDownloadUrl) {
      console.log("Releasing previous object URL:", currentDownloadUrl);

      URL.revokeObjectURL(currentDownloadUrl);

      currentDownloadUrl = null;
    }
  }

  function setProgress(percent) {
    if (!progressBar) return;

    const safePercent = Math.max(0, Math.min(100, Math.round(percent)));

    progressBar.style.width = `${safePercent}%`;

    progressBar.setAttribute("aria-valuenow", String(safePercent));
  }

  function setConvertButtonLoading(isLoading) {
    if (!btnStartConvert) return;

    btnStartConvert.disabled = isLoading;

    btnStartConvert.setAttribute("aria-busy", String(isLoading));

    btnStartConvert.classList.toggle("is-loading", isLoading);
  }

  // ==========================================================
  // CONVERSION MATRIX
  // ==========================================================

  const CONVERSION_MATRIX = {
    pdf: {
      pdf: false,
      docx: true,
    },

    docx: {
      pdf: true,
      docx: false,
    },

    doc: {
      pdf: true,
      docx: true,
    },

    txt: {
      pdf: true,
      docx: true,
    },

    rtf: {
      pdf: true,
      docx: true,
    },

    pptx: {
      pdf: true,
      docx: true,
    },

    ppt: {
      pdf: true,
      docx: true,
    },

    jpg: {
      pdf: true,
      docx: true,
    },

    jpeg: {
      pdf: true,
      docx: true,
    },

    png: {
      pdf: true,
      docx: true,
    },

    webp: {
      pdf: true,
      docx: true,
    },
  };

  function isConversionSupported(source, target) {
    return Boolean(
      CONVERSION_MATRIX[source] && CONVERSION_MATRIX[source][target],
    );
  }

  // ==========================================================
  // FILE VALIDATION
  // ==========================================================

  function validateFile(file) {
    if (!file) {
      return {
        valid: false,
        message: "No file selected.",
      };
    }

    const extension = getFileExtension(file.name);

    if (!extension) {
      return {
        valid: false,
        message: "This file has no recognizable extension.",
      };
    }

    if (!ALLOWED_EXTENSIONS.includes(extension)) {
      return {
        valid: false,
        message:
          `.${extension.toUpperCase()} files are not supported. ` +
          "Supported formats: PDF, DOCX, DOC, TXT, RTF, PPT, PPTX, JPG, JPEG, PNG and WEBP.",
      };
    }

    if (file.size === 0) {
      return {
        valid: false,
        message: "The selected file is empty.",
      };
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      return {
        valid: false,
        message: `File exceeds the maximum upload limit of ${formatBytes(
          MAX_FILE_SIZE_BYTES,
        )}.`,
      };
    }

    return {
      valid: true,
    };
  }

  // ==========================================================
  // ERROR HANDLING
  // ==========================================================

  function showError(message) {
    console.error("DocSwitch error:", message);

    if (errorMessageText) {
      errorMessageText.textContent = message;
    }

    setActiveState("error");

    announce(message);
  }

  // ==========================================================
  // TARGET FORMAT
  // ==========================================================

  function configureTargetFormat(sourceFormat) {
    if (!targetFormatSelect) return;

    const pdfSupported = isConversionSupported(sourceFormat, "pdf");

    const docxSupported = isConversionSupported(sourceFormat, "docx");

    Array.from(targetFormatSelect.options).forEach((option) => {
      const value = option.value.toLowerCase().trim();

      if (!ALLOWED_OUTPUT_FORMATS.includes(value)) {
        option.disabled = true;
        return;
      }

      if (value === "pdf") {
        option.disabled = !pdfSupported;
      }

      if (value === "docx") {
        option.disabled = !docxSupported;
      }
    });

    if (sourceFormat === "pdf" && docxSupported) {
      targetFormatSelect.value = "docx";
    } else if (sourceFormat === "docx" && pdfSupported) {
      targetFormatSelect.value = "pdf";
    } else if (pdfSupported) {
      targetFormatSelect.value = "pdf";
    } else if (docxSupported) {
      targetFormatSelect.value = "docx";
    } else {
      targetFormatSelect.value = "";
    }

    console.log("Target format:", targetFormatSelect.value);
  }

  // ==========================================================
  // FILE SELECTION
  // ==========================================================

  function handleFileSelection(file) {
    console.log("========================================");
    console.log("File selected:", file.name);
    console.log("File size:", formatBytes(file.size));
    console.log("========================================");

    const validation = validateFile(file);

    if (!validation.valid) {
      showError(validation.message);
      return;
    }

    // Clear previous converted file.

    releaseDownloadUrl();

    currentOutputBlob = null;
    currentOutputFilename = null;

    if (btnDownloadResult) {
      btnDownloadResult.removeAttribute("href");
      btnDownloadResult.removeAttribute("download");

      btnDownloadResult.setAttribute("aria-disabled", "true");

      btnDownloadResult.style.pointerEvents = "none";
    }

    currentFile = file;

    const extension = getFileExtension(file.name);

    if (selectedFileName) {
      selectedFileName.textContent = file.name;
    }

    if (selectedFileSize) {
      selectedFileSize.textContent = formatBytes(file.size);
    }

    configureTargetFormat(extension);

    setProgress(0);

    setActiveState("selected");

    announce(`${file.name} selected. Ready to convert.`);
  }

  // ==========================================================
  // DROPZONE
  // ==========================================================

  if (dropZone) {
    ["dragenter", "dragover"].forEach((eventName) => {
      dropZone.addEventListener(eventName, (event) => {
        event.preventDefault();
        event.stopPropagation();

        if (!conversionInProgress) {
          dropZone.classList.add("drag-over");
        }
      });
    });

    ["dragleave", "drop"].forEach((eventName) => {
      dropZone.addEventListener(eventName, (event) => {
        event.preventDefault();
        event.stopPropagation();

        dropZone.classList.remove("drag-over");
      });
    });

    dropZone.addEventListener("drop", (event) => {
      if (conversionInProgress) return;

      const files = event.dataTransfer?.files;

      if (files?.length) {
        handleFileSelection(files[0]);
      }
    });

    dropZone.addEventListener("click", (event) => {
      if (event.target.closest("#browse-trigger")) {
        return;
      }

      if (fileInput && !conversionInProgress) {
        fileInput.click();
      }
    });

    dropZone.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();

        if (fileInput && !conversionInProgress) {
          fileInput.click();
        }
      }
    });
  }

  // ==========================================================
  // BROWSE
  // ==========================================================

  if (browseTrigger) {
    browseTrigger.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();

      if (fileInput && !conversionInProgress) {
        fileInput.click();
      }
    });
  }

  // ==========================================================
  // FILE INPUT
  // ==========================================================

  if (fileInput) {
    fileInput.addEventListener("change", (event) => {
      const files = event.target.files;

      if (files?.length) {
        handleFileSelection(files[0]);
      }
    });
  }

  // ==========================================================
  // REMOVE FILE
  // ==========================================================

  if (btnRemoveFile) {
    btnRemoveFile.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();

      if (conversionInProgress) {
        return;
      }

      resetConverter();
    });
  }

  // ==========================================================
  // START CONVERSION
  // ==========================================================

  if (btnStartConvert) {
    btnStartConvert.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();

      console.log("========================================");
      console.log("CONVERT BUTTON CLICKED");
      console.log("========================================");

      if (conversionInProgress) {
        console.warn("Conversion already in progress.");

        return;
      }

      if (!currentFile) {
        showError("Please select a file first.");

        return;
      }

      const sourceFormat = getFileExtension(currentFile.name);

      const targetFormat = targetFormatSelect?.value?.toLowerCase()?.trim();

      console.log("Conversion request:", {
        filename: currentFile.name,
        sourceFormat,
        targetFormat,
        size: currentFile.size,
      });

      // ----------------------------------------------------
      // TARGET VALIDATION
      // ----------------------------------------------------

      if (!ALLOWED_OUTPUT_FORMATS.includes(targetFormat)) {
        showError("Please select either PDF or DOCX as the output format.");

        return;
      }

      // ----------------------------------------------------
      // SAME FORMAT
      // ----------------------------------------------------

      if (sourceFormat === targetFormat) {
        showError(
          `Your file is already in ${targetFormat.toUpperCase()} format. Please choose a different output format.`,
        );

        return;
      }

      // ----------------------------------------------------
      // MATRIX CHECK
      // ----------------------------------------------------

      if (!isConversionSupported(sourceFormat, targetFormat)) {
        showError(
          `Conversion from ${sourceFormat.toUpperCase()} to ${targetFormat.toUpperCase()} is not supported.`,
        );

        return;
      }

      // ----------------------------------------------------
      // LOCK UI
      // ----------------------------------------------------

      conversionInProgress = true;

      setConvertButtonLoading(true);

      if (convertingFileName) {
        convertingFileName.textContent = currentFile.name;
      }

      setProgress(5);

      setActiveState("converting");

      announce(
        `Converting ${currentFile.name} to ${targetFormat.toUpperCase()}.`,
      );

      // ----------------------------------------------------
      // BUILD FORMDATA
      // ----------------------------------------------------

      const formData = new FormData();

      formData.append("file", currentFile, currentFile.name);

      formData.append("target_format", targetFormat);

      console.log("FormData created:", {
        file: currentFile.name,
        target_format: targetFormat,
      });

      // ----------------------------------------------------
      // FETCH → FASTAPI
      // ----------------------------------------------------

      try {
        console.log("FETCH POST →", API_ENDPOINT);

        setProgress(10);

        const response = await fetch(API_ENDPOINT, {
          method: "POST",
          body: formData,
        });

        console.log("FastAPI response received:", {
          status: response.status,
          statusText: response.statusText,
          contentType: response.headers.get("Content-Type"),
          contentDisposition: response.headers.get("Content-Disposition"),
        });

        // --------------------------------------------------
        // HANDLE HTTP ERRORS
        // --------------------------------------------------

        if (!response.ok) {
          let message = `Conversion failed (HTTP ${response.status}).`;

          try {
            const contentType = response.headers.get("Content-Type") || "";

            if (contentType.includes("application/json")) {
              const errorData = await response.json();

              if (typeof errorData.detail === "string") {
                message = errorData.detail;
              } else if (Array.isArray(errorData.detail)) {
                message = errorData.detail
                  .map((item) => item?.msg || String(item))
                  .join(" ");
              } else if (typeof errorData.message === "string") {
                message = errorData.message;
              }
            } else {
              const errorText = await response.text();

              if (errorText.trim()) {
                message = errorText;
              }
            }
          } catch (parseError) {
            console.error("Could not parse FastAPI error:", parseError);
          }

          throw new Error(message);
        }

        // --------------------------------------------------
        // RESPONSE IS SUCCESSFUL
        // --------------------------------------------------

        setProgress(70);

        console.log("Reading FastAPI response as Blob...");

        const responseBlob = await response.blob();

        console.log("========================================");

        console.log("CONVERTED FILE RECEIVED");

        console.log({
          blobType: responseBlob.type,
          blobSize: responseBlob.size,
        });

        console.log("========================================");

        // --------------------------------------------------
        // VERIFY BLOB
        // --------------------------------------------------

        if (!(responseBlob instanceof Blob)) {
          throw new Error("The backend response was not a file.");
        }

        if (responseBlob.size === 0) {
          throw new Error("The backend returned an empty file.");
        }

        // --------------------------------------------------
        // STORE BLOB
        // --------------------------------------------------

        currentOutputBlob = responseBlob;

        // --------------------------------------------------
        // OUTPUT FILENAME
        // --------------------------------------------------

        const serverFilename = getFilenameFromDisposition(
          response.headers.get("Content-Disposition"),
        );

        currentOutputFilename =
          serverFilename || `${getBaseName(currentFile.name)}.${targetFormat}`;

        console.log("Output filename:", currentOutputFilename);

        // --------------------------------------------------
        // CREATE DOWNLOAD URL
        // --------------------------------------------------

        releaseDownloadUrl();

        currentDownloadUrl = URL.createObjectURL(currentOutputBlob);

        console.log("Browser object URL created:", currentDownloadUrl);

        // --------------------------------------------------
        // CONFIGURE DOWNLOAD CONTROL
        // --------------------------------------------------

        if (btnDownloadResult) {
          btnDownloadResult.href = currentDownloadUrl;

          btnDownloadResult.download = currentOutputFilename;

          btnDownloadResult.setAttribute("download", currentOutputFilename);

          btnDownloadResult.setAttribute(
            "aria-label",
            `Download ${currentOutputFilename}`,
          );

          btnDownloadResult.removeAttribute("aria-disabled");

          btnDownloadResult.style.pointerEvents = "auto";

          btnDownloadResult.style.cursor = "pointer";

          console.log("Download control configured.");
        }

        // --------------------------------------------------
        // SUCCESS DETAILS
        // --------------------------------------------------

        if (successFileDetails) {
          successFileDetails.textContent = `${currentOutputFilename} · ${formatBytes(
            currentOutputBlob.size,
          )}`;
        }

        // --------------------------------------------------
        // COMPLETE
        // --------------------------------------------------

        setProgress(100);

        setActiveState("success");

        announce(
          `Conversion complete. ${currentOutputFilename} is ready for download.`,
        );

        console.log("========================================");

        console.log("DOCSWITCH CONVERSION SUCCESS");

        console.log({
          filename: currentOutputFilename,
          size: formatBytes(currentOutputBlob.size),
          type: currentOutputBlob.type,
          downloadUrl: currentDownloadUrl,
        });

        console.log("========================================");
      } catch (error) {
        console.error("========================================");

        console.error("DOCSWITCH CONVERSION FAILED");

        console.error(error);

        console.error("========================================");

        // Fetch throws TypeError on network/CORS
        // connection failures.

        if (error instanceof TypeError) {
          showError(
            "Could not connect to the DocSwitch backend. Make sure FastAPI is running at http://127.0.0.1:8000 and that CORS is configured correctly.",
          );
        } else {
          showError(error?.message || "Unable to convert the file.");
        }
      } finally {
        conversionInProgress = false;

        setConvertButtonLoading(false);
      }
    });
  }

  // ==========================================================
  // EXTRACT FILENAME FROM CONTENT-DISPOSITION
  // ==========================================================

  function getFilenameFromDisposition(contentDisposition) {
    if (!contentDisposition) {
      return null;
    }

    // filename*=UTF-8''filename.pdf
    const utf8Match = contentDisposition.match(
      /filename\*\s*=\s*UTF-8''([^;]+)/i,
    );

    if (utf8Match?.[1]) {
      try {
        return decodeURIComponent(utf8Match[1].trim());
      } catch {
        return utf8Match[1].trim();
      }
    }

    // filename="filename.pdf"
    const quotedMatch = contentDisposition.match(/filename\s*=\s*"([^"]+)"/i);

    if (quotedMatch?.[1]) {
      return quotedMatch[1].trim();
    }

    // filename=filename.pdf
    const plainMatch = contentDisposition.match(/filename\s*=\s*([^;]+)/i);

    if (plainMatch?.[1]) {
      return plainMatch[1].trim().replace(/^["']|["']$/g, "");
    }

    return null;
  }

  // ==========================================================
  // DOWNLOAD RESULT
  // ==========================================================

  if (btnDownloadResult) {
    btnDownloadResult.addEventListener("click", (event) => {
      if (!currentDownloadUrl || !currentOutputBlob) {
        event.preventDefault();

        showError("No converted file is currently available.");

        return;
      }

      console.log("========================================");

      console.log("DOWNLOAD CLICKED");

      console.log({
        filename: currentOutputFilename,
        size: formatBytes(currentOutputBlob.size),
        type: currentOutputBlob.type,
        url: currentDownloadUrl,
      });

      console.log("========================================");

      announce(`Downloading ${currentOutputFilename}.`);

      // Do NOT revoke the URL here.
      //
      // The browser still needs the object URL
      // for the download.
    });
  }

  // ==========================================================
  // RESET
  // ==========================================================

  function resetConverter() {
    if (conversionInProgress) {
      return;
    }

    console.log("Resetting DocSwitch converter.");

    currentFile = null;
    currentOutputBlob = null;
    currentOutputFilename = null;

    releaseDownloadUrl();

    if (fileInput) {
      fileInput.value = "";
    }

    if (selectedFileName) {
      selectedFileName.textContent = "filename.pdf";
    }

    if (selectedFileSize) {
      selectedFileSize.textContent = "0 KB";
    }

    if (successFileDetails) {
      successFileDetails.textContent = "converted.pdf";
    }

    if (btnDownloadResult) {
      btnDownloadResult.removeAttribute("href");

      btnDownloadResult.removeAttribute("download");

      btnDownloadResult.setAttribute("aria-disabled", "true");

      btnDownloadResult.style.pointerEvents = "none";
    }

    setProgress(0);

    setConvertButtonLoading(false);

    setActiveState("empty");

    announce("Converter reset. Please select a file.");
  }

  if (btnResetConverter) {
    btnResetConverter.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();

      resetConverter();
    });
  }

  // ==========================================================
  // ERROR RETRY
  // ==========================================================

  if (btnErrorRetry) {
    btnErrorRetry.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();

      if (conversionInProgress) {
        return;
      }

      if (currentFile) {
        setActiveState("selected");

        announce(`${currentFile.name} is ready to convert again.`);
      } else {
        setActiveState("empty");

        announce("Please select a file.");
      }
    });
  }

  // ==========================================================
  // INITIAL STATE
  // ==========================================================

  if (btnDownloadResult) {
    btnDownloadResult.setAttribute("aria-disabled", "true");

    btnDownloadResult.style.pointerEvents = "none";
  }

  setActiveState("empty");
  setProgress(0);

  console.log("DocSwitch converter ready.");
});

// ============================================================
// FORMAT MARQUEE
// ============================================================

function initializeFormatMarquee() {
  const tracks = document.querySelectorAll(".format-track");

  tracks.forEach((track) => {
    const originalSet = track.querySelector(".format-set");

    if (!originalSet) {
      return;
    }

    track
      .querySelectorAll('.format-set[data-clone="true"]')
      .forEach((clone) => {
        clone.remove();
      });

    const setWidth = originalSet.getBoundingClientRect().width;

    if (!setWidth) {
      return;
    }

    const viewportWidth = window.innerWidth;

    const copiesNeeded = Math.ceil(viewportWidth / setWidth) + 2;

    for (let i = 0; i < copiesNeeded; i++) {
      const clone = originalSet.cloneNode(true);

      clone.setAttribute("data-clone", "true");

      clone.setAttribute("aria-hidden", "true");

      track.appendChild(clone);
    }

    track.style.setProperty("--marquee-distance", `${setWidth}px`);

    const direction = track.dataset.direction;

    track.style.setProperty(
      "--marquee-duration",
      direction === "left" ? "30s" : "34s",
    );
  });
}

document.addEventListener("DOMContentLoaded", () => {
  initializeFormatMarquee();
});

let marqueeResizeTimeout;

window.addEventListener("resize", () => {
  clearTimeout(marqueeResizeTimeout);

  marqueeResizeTimeout = setTimeout(() => {
    initializeFormatMarquee();
  }, 150);
});

// ============================================================
// DOCSWITCH — CINEMATIC STARFIELD
// ============================================================

document.addEventListener("DOMContentLoaded", () => {
  const ambientCanvas = document.getElementById("ambient-canvas");

  if (!ambientCanvas) {
    return;
  }

  const ctx = ambientCanvas.getContext("2d");

  if (!ctx) {
    return;
  }

  let width = 0;
  let height = 0;
  let stars = [];

  const reducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;

  const config = {
    desktopStars: 250,
    mobileStars: 125,

    minOpacity: 0.19,
    maxOpacity: 0.63,

    speed: 0.025,
  };

  // --------------------------------------------------------
  // RESIZE
  // --------------------------------------------------------

  function resizeCanvas() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    width = window.innerWidth;
    height = window.innerHeight;

    ambientCanvas.width = width * dpr;

    ambientCanvas.height = height * dpr;

    ambientCanvas.style.width = `${width}px`;

    ambientCanvas.style.height = `${height}px`;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // --------------------------------------------------------
  // STAR
  // --------------------------------------------------------

  class Star {
    constructor() {
      this.reset();
    }

    reset() {
      this.x = Math.random() * width;

      this.y = Math.random() * height;

      const sizeRoll = Math.random();

      if (sizeRoll > 0.965) {
        this.radius = 1.15 + Math.random() * 0.25;
      } else if (sizeRoll > 0.83) {
        this.radius = 0.68 + Math.random() * 0.38;
      } else {
        this.radius = 0.34 + Math.random() * 0.38;
      }

      this.opacity =
        config.minOpacity +
        Math.random() * (config.maxOpacity - config.minOpacity);

      this.depth = 0.4 + Math.random() * 1.2;

      this.speed = config.speed * this.depth;

      this.twinkle = Math.random() > 0.8;

      this.twinkleSpeed = 0.0015 + Math.random() * 0.004;

      this.twinkleOffset = Math.random() * Math.PI * 2;
    }

    update(time) {
      if (!reducedMotion) {
        this.y += this.speed;

        this.x += Math.sin(time * 0.00015 + this.x * 0.01) * 0.006;
      }

      if (this.y > height + 10) {
        this.y = -10;

        this.x = Math.random() * width;
      }
    }

    draw(time) {
      let alpha = this.opacity;

      if (this.twinkle && !reducedMotion) {
        alpha *=
          0.74 + Math.sin(time * this.twinkleSpeed + this.twinkleOffset) * 0.26;
      }

      ctx.beginPath();

      ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);

      ctx.fillStyle = `rgba(220, 228, 245, ${alpha})`;

      ctx.fill();

      if (this.radius > 1.0) {
        const glow = ctx.createRadialGradient(
          this.x,
          this.y,
          0,
          this.x,
          this.y,
          this.radius * 4.5,
        );

        glow.addColorStop(0, `rgba(100, 145, 230, ${alpha * 0.24})`);

        glow.addColorStop(0.5, `rgba(80, 120, 210, ${alpha * 0.075})`);

        glow.addColorStop(1, "rgba(80, 120, 210, 0)");

        ctx.beginPath();

        ctx.arc(this.x, this.y, this.radius * 4.5, 0, Math.PI * 2);

        ctx.fillStyle = glow;

        ctx.fill();
      }
    }
  }

  // --------------------------------------------------------
  // CREATE STARS
  // --------------------------------------------------------

  function createStars() {
    const count =
      window.innerWidth < 768 ? config.mobileStars : config.desktopStars;

    stars = [];

    for (let i = 0; i < count; i++) {
      stars.push(new Star());
    }
  }

  // --------------------------------------------------------
  // ANIMATION
  // --------------------------------------------------------

  function animate(time) {
    ctx.clearRect(0, 0, width, height);

    stars.forEach((star) => {
      star.update(time);
      star.draw(time);
    });

    requestAnimationFrame(animate);
  }

  // --------------------------------------------------------
  // INITIALIZE
  // --------------------------------------------------------

  resizeCanvas();

  createStars();

  window.addEventListener(
    "resize",
    () => {
      resizeCanvas();
      createStars();
    },
    {
      passive: true,
    },
  );

  if (!reducedMotion) {
    requestAnimationFrame(animate);
  }
});

// ============================================================
// DROPZONE — CURSOR LIGHT
// ============================================================

document.addEventListener("DOMContentLoaded", () => {
  const dropZone = document.getElementById("drop-zone");

  if (!dropZone) return;

  dropZone.addEventListener("pointermove", (event) => {
    const rect = dropZone.getBoundingClientRect();

    dropZone.style.setProperty("--mouse-x", `${event.clientX - rect.left}px`);

    dropZone.style.setProperty("--mouse-y", `${event.clientY - rect.top}px`);
  });
});

// ============================================================
// CONVERT CONTROL — CURSOR LIGHT
// ============================================================

document.addEventListener("DOMContentLoaded", () => {
  const btnStartConvert = document.getElementById("btn-start-convert");

  if (!btnStartConvert) return;

  btnStartConvert.addEventListener("pointermove", (event) => {
    const rect = btnStartConvert.getBoundingClientRect();

    btnStartConvert.style.setProperty(
      "--button-x",
      `${event.clientX - rect.left}px`,
    );

    btnStartConvert.style.setProperty(
      "--button-y",
      `${event.clientY - rect.top}px`,
    );
  });
});
