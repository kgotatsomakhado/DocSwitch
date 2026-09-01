/**
 * DocSwitch — Frontend Core Controller
 *
 * Production frontend controller.
 *
 * Responsibilities:
 * - UI state management
 * - File validation
 * - Drag & drop
 * - PDF ↔ DOCX conversion workflow
 * - Upload progress
 * - Real backend communication
 * - Real converted-file download
 * - Navigation
 *
 * Visual / UX systems are intentionally preserved.
 */

document.addEventListener("DOMContentLoaded", () => {
  // ==========================================================
  // CONFIGURATION
  // ==========================================================

  const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024;

  // DocSwitch currently supports PDF and DOCX only.
  const ALLOWED_EXTENSIONS = ["pdf", "docx"];

  // FastAPI conversion endpoint.
  const API_ENDPOINT = "http://127.0.0.1:8000/api/v1/convert";

  let currentFile = null;
  let currentDownloadUrl = null;

  // ==========================================================
  // DOM
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
    Object.keys(states).forEach((key) => {
      if (!states[key]) return;

      if (key === targetStateKey) {
        states[key].classList.add("active");
      } else {
        states[key].classList.remove("active");
      }
    });
  }

  // ==========================================================
  // HELPERS
  // ==========================================================

  function announce(message) {
    if (liveRegion) {
      liveRegion.textContent = message;
    }
  }

  function formatBytes(bytes) {
    if (bytes === 0) {
      return "0 Bytes";
    }

    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  }

  function getFileExtension(filename) {
    const lastDot = filename.lastIndexOf(".");

    if (lastDot === -1) {
      return "";
    }

    return filename.slice(lastDot + 1).toLowerCase();
  }

  function getBaseName(filename) {
    const lastDot = filename.lastIndexOf(".");

    if (lastDot === -1) {
      return filename;
    }

    return filename.substring(0, lastDot);
  }

  function getMimeType(format) {
    if (format === "pdf") {
      return "application/pdf";
    }

    if (format === "docx") {
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    }

    return "application/octet-stream";
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

    const ext = getFileExtension(file.name);

    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      return {
        valid: false,
        message:
          `.${ext.toUpperCase()} files are not supported. ` +
          "DocSwitch currently supports PDF and DOCX files only.",
      };
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      return {
        valid: false,
        message:
          "File exceeds the maximum limit of " +
          `${formatBytes(MAX_FILE_SIZE_BYTES)}.`,
      };
    }

    return {
      valid: true,
    };
  }

  // ==========================================================
  // FILE SELECTION
  // ==========================================================

  function handleFileSelection(file) {
    const validation = validateFile(file);

    if (!validation.valid) {
      if (errorMessageText) {
        errorMessageText.textContent = validation.message;
      }

      setActiveState("error");
      announce(validation.message);

      return;
    }

    currentFile = file;

    selectedFileName.textContent = file.name;
    selectedFileSize.textContent = formatBytes(file.size);

    const ext = getFileExtension(file.name);

    // PDF → DOCX
    // DOCX → PDF
    if (ext === "pdf") {
      targetFormatSelect.value = "docx";
    } else if (ext === "docx") {
      targetFormatSelect.value = "pdf";
    }

    setActiveState("selected");

    announce(`${file.name} selected. Ready to convert.`);
  }

  // ==========================================================
  // DRAG & DROP
  // ==========================================================

  if (dropZone) {
    ["dragenter", "dragover"].forEach((eventName) => {
      dropZone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();

        dropZone.classList.add("drag-over");
      });
    });

    ["dragleave", "drop"].forEach((eventName) => {
      dropZone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();

        dropZone.classList.remove("drag-over");
      });
    });

    dropZone.addEventListener("drop", (e) => {
      const files = e.dataTransfer.files;

      if (files && files.length > 0) {
        handleFileSelection(files[0]);
      }
    });

    dropZone.addEventListener("click", () => {
      if (fileInput) {
        fileInput.click();
      }
    });

    dropZone.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();

        if (fileInput) {
          fileInput.click();
        }
      }
    });
  }

  if (browseTrigger) {
    browseTrigger.addEventListener("click", (e) => {
      e.stopPropagation();

      if (fileInput) {
        fileInput.click();
      }
    });
  }

  if (fileInput) {
    fileInput.addEventListener("change", (e) => {
      if (e.target.files && e.target.files.length > 0) {
        handleFileSelection(e.target.files[0]);
      }
    });
  }

  // ==========================================================
  // REMOVE FILE
  // ==========================================================

  if (btnRemoveFile) {
    btnRemoveFile.addEventListener("click", () => {
      currentFile = null;

      releaseDownloadUrl();

      if (fileInput) {
        fileInput.value = "";
      }

      setActiveState("empty");

      announce("File removed.");
    });
  }

  // ==========================================================
  // CONVERSION
  // ==========================================================

  if (btnStartConvert) {
    btnStartConvert.addEventListener("click", async () => {
      if (!currentFile) {
        announce("Please select a file first.");
        return;
      }

      const targetFormat = targetFormatSelect.value;

      // --------------------------------------------------------
      // HARD SAFETY CHECK
      // --------------------------------------------------------

      if (!["pdf", "docx"].includes(targetFormat)) {
        const message =
          "Please select either PDF or DOCX as the output format.";

        errorMessageText.textContent = message;
        setActiveState("error");
        announce(message);

        return;
      }

      const sourceFormat = getFileExtension(currentFile.name);

      // Prevent PDF → PDF and DOCX → DOCX.
      if (sourceFormat === targetFormat) {
        const message =
          `Your file is already in ${targetFormat.toUpperCase()} format. ` +
          "Please choose the other format.";

        errorMessageText.textContent = message;
        setActiveState("error");
        announce(message);

        return;
      }

      // --------------------------------------------------------
      // PREPARE UI
      // --------------------------------------------------------

      convertingFileName.textContent = currentFile.name;

      setProgress(0);

      setActiveState("converting");

      announce(
        `Converting ${currentFile.name} to ${targetFormat.toUpperCase()}.`,
      );

      // --------------------------------------------------------
      // PREPARE FORM DATA
      // --------------------------------------------------------

      const formData = new FormData();

      formData.append("file", currentFile);
      formData.append("target_format", targetFormat);

      // --------------------------------------------------------
      // BACKEND REQUEST
      // --------------------------------------------------------

      try {
        const convertedBlob = await executeUploadRequest(
          API_ENDPOINT,
          formData,
          (progressPercent) => {
            setProgress(progressPercent);
          },
        );

        // ------------------------------------------------------
        // VALIDATE BACKEND RESPONSE
        // ------------------------------------------------------

        if (!convertedBlob || convertedBlob.size === 0) {
          throw new Error("The server returned an empty conversion file.");
        }

        // ------------------------------------------------------
        // CREATE DOWNLOAD
        // ------------------------------------------------------

        releaseDownloadUrl();

        currentDownloadUrl = URL.createObjectURL(convertedBlob);

        const outputFilename = `${getBaseName(currentFile.name)}.${targetFormat}`;

        btnDownloadResult.href = currentDownloadUrl;
        btnDownloadResult.download = outputFilename;

        successFileDetails.textContent = `${outputFilename} · ${formatBytes(convertedBlob.size)}`;

        setProgress(100);

        setActiveState("success");

        announce(
          `Your file is ready. ${outputFilename} can now be downloaded.`,
        );
      } catch (error) {
        console.error("DocSwitch conversion error:", error);

        const message =
          error?.message || "An unexpected error occurred during processing.";

        if (errorMessageText) {
          errorMessageText.textContent = message;
        }

        setActiveState("error");

        announce(message);
      }
    });
  }

  // ==========================================================
  // REAL BACKEND REQUEST
  // ==========================================================

  function executeUploadRequest(url, data, onProgress) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();

      // --------------------------------------------------------
      // UPLOAD PROGRESS
      // --------------------------------------------------------

      xhr.upload.addEventListener("progress", (e) => {
        if (!e.lengthComputable) {
          return;
        }

        /*
         * Upload represents approximately 90% of the visual
         * progress. The remaining 10% represents backend
         * processing / response.
         */

        const uploadPercent = (e.loaded / e.total) * 90;

        onProgress(uploadPercent);
      });

      // --------------------------------------------------------
      // REQUEST COMPLETE
      // --------------------------------------------------------

      xhr.addEventListener("load", async () => {
        const contentType = xhr.getResponseHeader("Content-Type") || "";

        // ------------------------------------------------------
        // SUCCESS
        // ------------------------------------------------------

        if (xhr.status >= 200 && xhr.status < 300) {
          onProgress(100);

          const blob = xhr.response;

          /*
           * Some backends may return application/octet-stream
           * rather than the exact MIME type. Preserve the
           * backend bytes while giving the browser a useful
           * content type.
           */

          if (blob instanceof Blob && blob.size > 0) {
            resolve(blob);
            return;
          }

          reject(new Error("The server returned an invalid conversion file."));

          return;
        }

        // ------------------------------------------------------
        // BACKEND ERROR
        // ------------------------------------------------------

        let message = "Conversion failed. Please try again.";

        /*
         * FastAPI normally returns errors as JSON:
         *
         * {
         *   "detail": "..."
         * }
         *
         * Because xhr.responseType is blob, we must read
         * the Blob before parsing it.
         */

        try {
          if (contentType.includes("application/json")) {
            const text = await xhr.response.text();

            const errorResponse = JSON.parse(text);

            if (typeof errorResponse.detail === "string") {
              message = errorResponse.detail;
            } else if (Array.isArray(errorResponse.detail)) {
              message = errorResponse.detail
                .map((item) => {
                  if (typeof item === "string") {
                    return item;
                  }

                  return item?.msg || "Invalid request.";
                })
                .join(" ");
            }
          } else if (xhr.response) {
            const text = await xhr.response.text();

            if (text.trim()) {
              message = text;
            }
          }
        } catch (parseError) {
          console.error("Unable to parse backend error:", parseError);
        }

        reject(new Error(message));
      });

      // --------------------------------------------------------
      // NETWORK ERROR
      // --------------------------------------------------------

      xhr.addEventListener("error", () => {
        reject(
          new Error(
            "Unable to connect to the DocSwitch conversion server. " +
              "Make sure the FastAPI backend is running.",
          ),
        );
      });

      // --------------------------------------------------------
      // ABORT
      // --------------------------------------------------------

      xhr.addEventListener("abort", () => {
        reject(new Error("The conversion request was cancelled."));
      });

      // --------------------------------------------------------
      // TIMEOUT
      // --------------------------------------------------------

      xhr.timeout = 120000;

      xhr.addEventListener("timeout", () => {
        reject(
          new Error(
            "The conversion took too long and timed out. " +
              "Please try again.",
          ),
        );
      });

      // --------------------------------------------------------
      // IMPORTANT
      // --------------------------------------------------------

      /*
       * Do NOT manually set Content-Type here.
       *
       * The browser automatically generates:
       *
       * multipart/form-data; boundary=...
       *
       * when FormData is supplied.
       */

      xhr.responseType = "blob";

      xhr.open("POST", url, true);

      xhr.send(data);
    });
  }

  // ==========================================================
  // RESET
  // ==========================================================

  if (btnResetConverter) {
    btnResetConverter.addEventListener("click", () => {
      currentFile = null;

      releaseDownloadUrl();

      if (fileInput) {
        fileInput.value = "";
      }

      setProgress(0);

      setActiveState("empty");

      announce("Converter reset.");
    });
  }

  // ==========================================================
  // ERROR RETRY
  // ==========================================================

  if (btnErrorRetry) {
    btnErrorRetry.addEventListener("click", () => {
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
});

// ============================================================
// SEAMLESS FORMAT MARQUEE
// ============================================================

function initializeFormatMarquee() {
  const tracks = document.querySelectorAll(".format-track");

  tracks.forEach((track) => {
    const originalSet = track.querySelector(".format-set");

    if (!originalSet) return;

    track
      .querySelectorAll(".format-set[data-clone]")
      .forEach((clone) => clone.remove());

    const setWidth = originalSet.getBoundingClientRect().width;

    if (!setWidth) return;

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

    if (direction === "left") {
      track.style.setProperty("--marquee-duration", "30s");
    } else {
      track.style.setProperty("--marquee-duration", "34s");
    }
  });
}

initializeFormatMarquee();

let marqueeResizeTimeout;

window.addEventListener("resize", () => {
  clearTimeout(marqueeResizeTimeout);

  marqueeResizeTimeout = setTimeout(() => {
    initializeFormatMarquee();
  }, 150);
});

// ============================================================
// DOCSWITCH — REFINED CINEMATIC STARFIELD
// ============================================================

const ambientCanvas = document.getElementById("ambient-canvas");

if (ambientCanvas) {
  const ctx = ambientCanvas.getContext("2d");

  let width = 0;
  let height = 0;
  let stars = [];

  const reducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;

  const config = {
    desktopStars: 250,
    mobileStars: 125,
    minRadius: 0.34,
    maxRadius: 1.35,
    minOpacity: 0.19,
    maxOpacity: 0.63,
    speed: 0.025,
  };

  // ------------------------------------------------------------
  // RESIZE
  // ------------------------------------------------------------

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

  // ------------------------------------------------------------
  // STAR
  // ------------------------------------------------------------

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

    // ----------------------------------------------------------
    // UPDATE
    // ----------------------------------------------------------

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

    // ----------------------------------------------------------
    // DRAW
    // ----------------------------------------------------------

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

  // ------------------------------------------------------------
  // CREATE STARFIELD
  // ------------------------------------------------------------

  function createStars() {
    const count =
      window.innerWidth < 768 ? config.mobileStars : config.desktopStars;

    stars = [];

    for (let i = 0; i < count; i++) {
      stars.push(new Star());
    }
  }

  // ------------------------------------------------------------
  // ANIMATION
  // ------------------------------------------------------------

  function animate(time) {
    ctx.clearRect(0, 0, width, height);

    stars.forEach((star) => {
      star.update(time);
      star.draw(time);
    });

    requestAnimationFrame(animate);
  }

  // ------------------------------------------------------------
  // INITIALIZE
  // ------------------------------------------------------------

  resizeCanvas();
  createStars();

  window.addEventListener(
    "resize",
    () => {
      resizeCanvas();
      createStars();
    },
    { passive: true },
  );

  if (!reducedMotion) {
    requestAnimationFrame(animate);
  }
}

// ============================================================
// DROPZONE — SUBTLE CURSOR LIGHT
// ============================================================

const dropZone = document.getElementById("drop-zone");

if (dropZone) {
  dropZone.addEventListener("pointermove", (e) => {
    const rect = dropZone.getBoundingClientRect();

    const x = e.clientX - rect.left;

    const y = e.clientY - rect.top;

    dropZone.style.setProperty("--mouse-x", `${x}px`);

    dropZone.style.setProperty("--mouse-y", `${y}px`);
  });
}

// ============================================================
// CONVERT BUTTON — CURSOR LIGHT
// ============================================================

const btnStartConvert = document.getElementById("btn-start-convert");

if (btnStartConvert) {
  btnStartConvert.addEventListener("pointermove", (e) => {
    const rect = btnStartConvert.getBoundingClientRect();

    const x = e.clientX - rect.left;

    const y = e.clientY - rect.top;

    btnStartConvert.style.setProperty("--button-x", `${x}px`);

    btnStartConvert.style.setProperty("--button-y", `${y}px`);
  });
}
