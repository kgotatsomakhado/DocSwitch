/**
 * ============================================================
 * DOCSWITCH — FRONTEND CORE CONTROLLER
 * ============================================================
 *
 * FLOW
 *
 * File selection
 *       ↓
 * FormData
 *       ↓
 * fetch POST
 *       ↓
 * FastAPI /api/v1/convert
 *       ↓
 * Binary response
 *       ↓
 * Blob
 *       ↓
 * Object URL
 *       ↓
 * Browser download
 *
 * BACKEND
 *
 * POST http://127.0.0.1:8000/api/v1/convert
 *
 * FormData:
 *   file
 *   target_format
 * ============================================================
 */

document.addEventListener("DOMContentLoaded", () => {
  // ==========================================================
  // CONFIGURATION
  // ==========================================================

  const API_BASE_URL = "http://127.0.0.1:8000";
  const API_ENDPOINT = `${API_BASE_URL}/api/v1/convert`;

  const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024;
  const REQUEST_TIMEOUT_MS = 180000;

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
  // APPLICATION STATE
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
  console.log("DOCSWITCH FRONTEND");
  console.log("========================================");
  console.log("API:", API_ENDPOINT);
  console.log("Communication: FETCH");
  console.log("========================================");

  // ==========================================================
  // REQUIRED ELEMENT CHECK
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
      console.error(`DocSwitch: missing required element #${name}`);
    }
  });

  // ==========================================================
  // STATE ENGINE
  // ==========================================================

  function setActiveState(targetState) {
    Object.entries(states).forEach(([key, state]) => {
      if (!state) {
        return;
      }

      const active = key === targetState;

      state.classList.toggle("active", active);

      /*
       * Use inert so inactive panels cannot be interacted with.
       *
       * Do not use aria-hidden here.
       * This avoids the browser warning you previously saw
       * when focus remained inside the hidden upload panel.
       */
      state.inert = !active;
    });

    console.log("UI state:", targetState);
  }

  // ==========================================================
  // ACCESSIBILITY
  // ==========================================================

  function announce(message) {
    if (!liveRegion) {
      return;
    }

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
    if (!filename) {
      return "";
    }

    const lastDot = filename.lastIndexOf(".");

    if (lastDot === -1) {
      return "";
    }

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
    if (!currentDownloadUrl) {
      return;
    }

    console.log("Releasing object URL:", currentDownloadUrl);

    URL.revokeObjectURL(currentDownloadUrl);

    currentDownloadUrl = null;
  }

  function setProgress(percent) {
    if (!progressBar) {
      return;
    }

    const safePercent = Math.max(0, Math.min(100, Math.round(percent)));

    progressBar.style.width = `${safePercent}%`;

    progressBar.setAttribute("aria-valuenow", String(safePercent));
  }

  function setConvertButtonLoading(isLoading) {
    if (!btnStartConvert) {
      return;
    }

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
          "Supported formats: PDF, DOCX, DOC, TXT, RTF, " +
          "PPT, PPTX, JPG, JPEG, PNG and WEBP.",
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
        message:
          `File exceeds the maximum upload limit of ` +
          `${formatBytes(MAX_FILE_SIZE_BYTES)}.`,
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
    if (!targetFormatSelect) {
      return;
    }

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
    console.log("FILE SELECTED");
    console.log("Name:", file?.name);
    console.log("Size:", formatBytes(file?.size || 0));
    console.log("========================================");

    const validation = validateFile(file);

    if (!validation.valid) {
      showError(validation.message);
      return;
    }

    // Clear previous output.

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
  // DRAG & DROP
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
      if (conversionInProgress) {
        return;
      }

      const files = event.dataTransfer?.files;

      if (files && files.length > 0) {
        handleFileSelection(files[0]);
      }
    });

    dropZone.addEventListener("click", (event) => {
      /*
       * The browse button has its own handler.
       * Prevent the parent from firing a second click.
       */
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
  // BROWSE BUTTON
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

      if (files && files.length > 0) {
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
  // CONVERT
  // ==========================================================

  if (btnStartConvert) {
    btnStartConvert.addEventListener("click", async (event) => {
      /*
       * This is a real button.
       * Prevent default form/browser behavior.
       */
      event.preventDefault();
      event.stopPropagation();

      console.log("========================================");
      console.log("CONVERT BUTTON CLICKED");
      console.log("========================================");

      // ----------------------------------------------------
      // DOUBLE REQUEST PROTECTION
      // ----------------------------------------------------

      if (conversionInProgress) {
        console.warn("Conversion already running.");
        return;
      }

      // ----------------------------------------------------
      // FILE CHECK
      // ----------------------------------------------------

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
          `Your file is already in ${targetFormat.toUpperCase()} format.`,
        );
        return;
      }

      // ----------------------------------------------------
      // CAPABILITY
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
      // FORM DATA
      // ----------------------------------------------------

      const formData = new FormData();

      formData.append("file", currentFile, currentFile.name);

      formData.append("target_format", targetFormat);

      console.log("FormData prepared.");

      // ----------------------------------------------------
      // TIMEOUT
      // ----------------------------------------------------

      const controller = new AbortController();

      const timeoutId = setTimeout(() => {
        console.warn("DocSwitch request timed out.");

        controller.abort();
      }, REQUEST_TIMEOUT_MS);

      // ----------------------------------------------------
      // FETCH POST
      // ----------------------------------------------------

      try {
        console.log("FETCH POST →", API_ENDPOINT);

        setProgress(15);

        const response = await fetch(API_ENDPOINT, {
          method: "POST",
          body: formData,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        // --------------------------------------------------
        // LOG RESPONSE
        // --------------------------------------------------

        console.log("FASTAPI RESPONSE:", {
          status: response.status,
          ok: response.ok,
          contentType: response.headers.get("Content-Type"),
          contentLength: response.headers.get("Content-Length"),
          contentDisposition: response.headers.get("Content-Disposition"),
        });

        // --------------------------------------------------
        // HTTP ERROR
        // --------------------------------------------------

        if (!response.ok) {
          let message = `Conversion failed (HTTP ${response.status}).`;

          try {
            const contentType = response.headers.get("Content-Type") || "";

            if (contentType.toLowerCase().includes("application/json")) {
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
                message = errorText.trim();
              }
            }
          } catch (parseError) {
            console.error("Unable to parse FastAPI error:", parseError);
          }

          throw new Error(message);
        }

        // --------------------------------------------------
        // SUCCESS
        // --------------------------------------------------

        console.log("HTTP 200 received. Reading binary response...");

        setProgress(70);

        const responseBlob = await response.blob();

        console.log("BINARY RESPONSE RECEIVED:", {
          type: responseBlob.type,
          size: responseBlob.size,
        });

        // --------------------------------------------------
        // VERIFY FILE
        // --------------------------------------------------

        if (!(responseBlob instanceof Blob)) {
          throw new Error("The backend response was not a valid Blob.");
        }

        if (responseBlob.size === 0) {
          throw new Error("The backend returned an empty file.");
        }

        // --------------------------------------------------
        // STORE RESULT
        // --------------------------------------------------

        currentOutputBlob = responseBlob;

        currentOutputFilename = `${getBaseName(
          currentFile.name,
        )}.${targetFormat}`;

        console.log("Output filename:", currentOutputFilename);

        // --------------------------------------------------
        // CREATE OBJECT URL
        // --------------------------------------------------

        releaseDownloadUrl();

        currentDownloadUrl = URL.createObjectURL(currentOutputBlob);

        console.log("Object URL created:", currentDownloadUrl);

        // --------------------------------------------------
        // ACTIVATE DOWNLOAD
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

          console.log("Download control activated.");
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
        // SUCCESS STATE
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
          bytes: currentOutputBlob.size,
          mimeType: currentOutputBlob.type,
          objectUrl: currentDownloadUrl,
        });

        console.log("========================================");
      } catch (error) {
        clearTimeout(timeoutId);

        console.error("========================================");

        console.error("DOCSWITCH CONVERSION FAILED");

        console.error(error);

        console.error("========================================");

        if (error?.name === "AbortError") {
          showError(
            "The conversion request timed out. Please try again with a smaller or simpler file.",
          );
        } else if (error instanceof TypeError) {
          showError(
            "Could not communicate with the DocSwitch backend. Check that FastAPI is running on http://127.0.0.1:8000 and that CORS allows this frontend.",
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
  // DOWNLOAD
  // ==========================================================

  if (btnDownloadResult) {
    btnDownloadResult.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();

      console.log("========================================");
      console.log("DOWNLOAD CLICKED");
      console.log({
        filename: currentOutputFilename,
        size: currentOutputBlob?.size || 0,
        url: currentDownloadUrl,
      });
      console.log("========================================");

      if (!currentOutputBlob) {
        console.error("Download attempted without a valid blob.");
        showError("No converted file available for download.");
        return;
      }

      if (!currentDownloadUrl) {
        currentDownloadUrl = URL.createObjectURL(currentOutputBlob);
      }

      const tempLink = document.createElement("a");
      tempLink.href = currentDownloadUrl;
      tempLink.download = currentOutputFilename || "converted-file";
      document.body.appendChild(tempLink);

      try {
        tempLink.click();
      } catch (err) {
        console.error("Programmatic download click failed:", err);
      } finally {
        document.body.removeChild(tempLink);
      }

      announce(`Downloading ${currentOutputFilename}.`);
    });
  }

  // ==========================================================
  // RESET
  // ==========================================================

  function resetConverter() {
    if (conversionInProgress) {
      return;
    }

    console.log("Resetting converter.");

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

      btnDownloadResult.style.cursor = "default";
    }

    setProgress(0);

    setConvertButtonLoading(false);

    conversionInProgress = false;

    setActiveState("empty");

    announce("Converter reset. Please select a file.");
  }

  // ==========================================================
  // RESET BUTTON
  // ==========================================================

  if (btnResetConverter) {
    btnResetConverter.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();

      resetConverter();
    });
  }

  // ==========================================================
  // RETRY
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
  // NAVIGATION
  // ==========================================================

  document.querySelectorAll('a[href^="#"]').forEach((link) => {
    link.addEventListener("click", (event) => {
      const targetId = link.getAttribute("href");

      if (!targetId || targetId === "#") {
        event.preventDefault();

        window.scrollTo({
          top: 0,
          behavior: "smooth",
        });

        return;
      }

      const target = document.querySelector(targetId);

      if (target) {
        event.preventDefault();

        target.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }
    });
  });

  // ==========================================================
  // INITIAL DOWNLOAD STATE
  // ==========================================================

  if (btnDownloadResult) {
    btnDownloadResult.setAttribute("aria-disabled", "true");

    btnDownloadResult.style.pointerEvents = "none";
  }

  // ==========================================================
  // INITIAL STATE
  // ==========================================================

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

  function resizeCanvas() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    width = window.innerWidth;
    height = window.innerHeight;

    ambientCanvas.width = width * dpr;
    ambientCanvas.height = height * dpr;

    ambientCanvas.style.width = `${width}px`;
    ambientCanvas.style.height = `${height}px`;

    // Reset transform matrix first, then scale to prevent compounding DPR transformations on resize
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
  }

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

  function createStars() {
    const count =
      window.innerWidth < 768 ? config.mobileStars : config.desktopStars;

    stars = [];

    for (let i = 0; i < count; i++) {
      stars.push(new Star());
    }
  }

  function animate(time) {
    ctx.clearRect(0, 0, width, height);

    stars.forEach((star) => {
      star.update(time);
      star.draw(time);
    });

    requestAnimationFrame(animate);
  }

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

  if (!dropZone) {
    return;
  }

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

  if (!btnStartConvert) {
    return;
  }

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
