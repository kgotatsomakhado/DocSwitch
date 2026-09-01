/**
 * ============================================================
 * DocSwitch — Frontend Core Controller
 * ============================================================
 *
 * Production frontend controller.
 *
 * Handles:
 * - File selection
 * - Drag & drop
 * - File validation
 * - Backend capability matching
 * - FastAPI conversion
 * - Upload progress
 * - Converted Blob handling
 * - Real browser download
 * - Error handling
 * - Reset / retry
 * - Navigation
 * - Format marquee
 * - Cinematic starfield
 * - Cursor lighting
 *
 * FastAPI endpoint:
 *
 * POST /api/v1/convert
 *
 * FormData:
 *   file
 *   target_format
 *
 * Expected successful backend response:
 *   Converted file as binary response
 * ============================================================
 */

document.addEventListener("DOMContentLoaded", () => {
  // ==========================================================
  // CONFIGURATION
  // ==========================================================

  const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024;

  const API_ENDPOINT = "http://127.0.0.1:8000/api/v1/convert";

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
  let currentDownloadUrl = null;
  let currentOutputFilename = null;
  let currentOutputBlob = null;

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
  // STATE ENGINE
  // ==========================================================

  function setActiveState(targetStateKey) {
    Object.entries(states).forEach(([key, state]) => {
      if (!state) return;

      const isActive = key === targetStateKey;

      state.classList.toggle("active", isActive);

      state.setAttribute("aria-hidden", String(!isActive));
    });
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
    const base = 1024;

    const index = Math.min(
      Math.floor(Math.log(bytes) / Math.log(base)),
      units.length - 1,
    );

    const value = bytes / Math.pow(base, index);

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
  // BACKEND CAPABILITY MATRIX
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

  function isConversionSupported(sourceFormat, targetFormat) {
    return Boolean(
      CONVERSION_MATRIX[sourceFormat] &&
      CONVERSION_MATRIX[sourceFormat][targetFormat],
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
          "Supported formats include PDF, DOCX, DOC, TXT, RTF, PPT, PPTX, JPG, JPEG, PNG and WEBP.",
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
          "File exceeds the maximum upload limit of " +
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
    if (errorMessageText) {
      errorMessageText.textContent = message;
    }

    setActiveState("error");

    announce(message);
  }

  // ==========================================================
  // TARGET FORMAT CONFIGURATION
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
      return;
    }

    if (sourceFormat === "docx" && pdfSupported) {
      targetFormatSelect.value = "pdf";
      return;
    }

    if (pdfSupported) {
      targetFormatSelect.value = "pdf";
      return;
    }

    if (docxSupported) {
      targetFormatSelect.value = "docx";
      return;
    }

    targetFormatSelect.value = "";
  }

  // ==========================================================
  // FILE SELECTION
  // ==========================================================

  function handleFileSelection(file) {
    const validation = validateFile(file);

    if (!validation.valid) {
      showError(validation.message);
      return;
    }

    // Clear previous result.
    releaseDownloadUrl();

    currentOutputBlob = null;
    currentOutputFilename = null;

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
      if (conversionInProgress) return;

      const files = event.dataTransfer?.files;

      if (files && files.length > 0) {
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

      if (conversionInProgress) return;

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

      if (conversionInProgress) {
        return;
      }

      if (!currentFile) {
        showError("Please select a file first.");
        return;
      }

      const sourceFormat = getFileExtension(currentFile.name);

      const targetFormat = targetFormatSelect?.value?.toLowerCase()?.trim();

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
          `Your file is already in ${targetFormat.toUpperCase()} format. ` +
            "Please choose a different output format.",
        );
        return;
      }

      // ----------------------------------------------------
      // CAPABILITY CHECK
      // ----------------------------------------------------

      if (!isConversionSupported(sourceFormat, targetFormat)) {
        showError(
          `Conversion from ${sourceFormat.toUpperCase()} to ` +
            `${targetFormat.toUpperCase()} is not supported by the current backend.`,
        );
        return;
      }

      // ----------------------------------------------------
      // LOCK APPLICATION STATE
      // ----------------------------------------------------

      conversionInProgress = true;

      setConvertButtonLoading(true);

      if (convertingFileName) {
        convertingFileName.textContent = currentFile.name;
      }

      setProgress(0);

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

      // ----------------------------------------------------
      // SEND REQUEST
      // ----------------------------------------------------

      try {
        const response = await executeUploadRequest(
          API_ENDPOINT,
          formData,
          (progress) => {
            setProgress(progress);
          },
        );

        // --------------------------------------------------
        // VALIDATE RESPONSE
        // --------------------------------------------------

        if (!response || !(response instanceof Blob) || response.size === 0) {
          throw new Error("The server returned an empty conversion file.");
        }

        // --------------------------------------------------
        // STORE RESULT
        // --------------------------------------------------

        currentOutputBlob = response;

        currentOutputFilename = `${getBaseName(currentFile.name)}.${targetFormat}`;

        // --------------------------------------------------
        // CREATE DOWNLOAD URL
        // --------------------------------------------------

        releaseDownloadUrl();

        currentDownloadUrl = URL.createObjectURL(currentOutputBlob);

        // --------------------------------------------------
        // CONFIGURE DOWNLOAD BUTTON
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
        }

        // --------------------------------------------------
        // UPDATE SUCCESS UI
        // --------------------------------------------------

        if (successFileDetails) {
          successFileDetails.textContent = `${currentOutputFilename} · ${formatBytes(
            currentOutputBlob.size,
          )}`;
        }

        setProgress(100);

        /*
         * CRITICAL:
         *
         * Do not reset currentFile here.
         * Do not reset currentDownloadUrl here.
         *
         * The success screen needs both values
         * to remain alive until the user downloads
         * or resets the converter.
         */

        setActiveState("success");

        announce(
          `Conversion complete. ${currentOutputFilename} is ready for download.`,
        );
      } catch (error) {
        console.error("DocSwitch conversion error:", error);

        const message =
          error?.message || "An unexpected error occurred during conversion.";

        showError(message);
      } finally {
        conversionInProgress = false;

        setConvertButtonLoading(false);
      }
    });
  }

  // ==========================================================
  // FASTAPI REQUEST
  // ==========================================================

  function executeUploadRequest(url, data, onProgress) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();

      // ----------------------------------------------------
      // UPLOAD PROGRESS
      // ----------------------------------------------------

      xhr.upload.addEventListener("progress", (event) => {
        if (!event.lengthComputable) {
          return;
        }

        const uploadPercent = (event.loaded / event.total) * 90;

        onProgress(uploadPercent);
      });

      // ----------------------------------------------------
      // RESPONSE
      // ----------------------------------------------------

      xhr.addEventListener("load", async () => {
        const contentType = xhr.getResponseHeader("Content-Type") || "";

        const contentDisposition =
          xhr.getResponseHeader("Content-Disposition") || "";

        console.log("DocSwitch response:", {
          status: xhr.status,
          contentType,
          contentDisposition,
          size: xhr.response?.size ?? 0,
        });

        // ================================================
        // SUCCESS
        // ================================================

        if (xhr.status >= 200 && xhr.status < 300) {
          const blob = xhr.response;

          if (blob instanceof Blob && blob.size > 0) {
            onProgress(100);

            resolve(blob);

            return;
          }

          reject(new Error("The server returned an invalid conversion file."));

          return;
        }

        // ================================================
        // ERROR RESPONSE
        // ================================================

        let message = `Conversion failed (HTTP ${xhr.status}).`;

        try {
          const responseBlob = xhr.response;

          if (responseBlob instanceof Blob) {
            const responseText = await responseBlob.text();

            if (responseText.trim()) {
              try {
                const json = JSON.parse(responseText);

                if (typeof json.detail === "string") {
                  message = json.detail;
                } else if (Array.isArray(json.detail)) {
                  message = json.detail
                    .map((item) => {
                      if (typeof item === "string") {
                        return item;
                      }

                      return item?.msg || "Invalid request.";
                    })
                    .join(" ");
                } else if (typeof json.message === "string") {
                  message = json.message;
                }
              } catch {
                message = responseText;
              }
            }
          }
        } catch (parseError) {
          console.error("Unable to parse backend error:", parseError);
        }

        reject(new Error(message));
      });

      // ----------------------------------------------------
      // NETWORK ERROR
      // ----------------------------------------------------

      xhr.addEventListener("error", () => {
        reject(
          new Error(
            "Unable to connect to the DocSwitch conversion server. " +
              "Make sure the FastAPI backend is running on port 8000.",
          ),
        );
      });

      // ----------------------------------------------------
      // ABORT
      // ----------------------------------------------------

      xhr.addEventListener("abort", () => {
        reject(new Error("The conversion request was cancelled."));
      });

      // ----------------------------------------------------
      // TIMEOUT
      // ----------------------------------------------------

      xhr.timeout = 120000;

      xhr.addEventListener("timeout", () => {
        reject(
          new Error(
            "The conversion took too long and timed out. " +
              "Please try again with a smaller or simpler file.",
          ),
        );
      });

      // ----------------------------------------------------
      // REQUEST
      // ----------------------------------------------------

      /*
       * DO NOT manually set Content-Type.
       *
       * The browser automatically generates:
       *
       * multipart/form-data;
       * boundary=...
       */

      xhr.open("POST", url, true);

      xhr.responseType = "blob";

      xhr.send(data);
    });
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

      /*
       * IMPORTANT:
       *
       * Do NOT revoke the object URL here.
       *
       * The browser needs it to complete
       * the download.
       */

      announce(`Downloading ${currentOutputFilename}.`);
    });
  }

  // ==========================================================
  // RESET CONVERTER
  // ==========================================================

  function resetConverter() {
    if (conversionInProgress) {
      return;
    }

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
  // INITIAL STATE
  // ==========================================================

  setActiveState("empty");

  setProgress(0);
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

  if (!dropZone) {
    return;
  }

  dropZone.addEventListener("pointermove", (event) => {
    const rect = dropZone.getBoundingClientRect();

    const x = event.clientX - rect.left;

    const y = event.clientY - rect.top;

    dropZone.style.setProperty("--mouse-x", `${x}px`);

    dropZone.style.setProperty("--mouse-y", `${y}px`);
  });
});

// ============================================================
// CONVERT BUTTON — CURSOR LIGHT
// ============================================================

document.addEventListener("DOMContentLoaded", () => {
  const btnStartConvert = document.getElementById("btn-start-convert");

  if (!btnStartConvert) {
    return;
  }

  btnStartConvert.addEventListener("pointermove", (event) => {
    const rect = btnStartConvert.getBoundingClientRect();

    const x = event.clientX - rect.left;

    const y = event.clientY - rect.top;

    btnStartConvert.style.setProperty("--button-x", `${x}px`);

    btnStartConvert.style.setProperty("--button-y", `${y}px`);
  });
});
