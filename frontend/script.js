/**
 * DocSwitch — Frontend Core Controller
 * Handles UI state management, validation, drag-and-drop,
 * conversion workflow and navigation.
 */

document.addEventListener("DOMContentLoaded", () => {
  // ==========================================================
  // CONFIGURATION
  // ==========================================================

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

  const API_ENDPOINT = "/api/v1/convert";

  let currentFile = null;

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
    return filename
      .slice(((filename.lastIndexOf(".") - 1) >>> 0) + 2)
      .toLowerCase();
  }

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
          `Please select a valid document or image.`,
      };
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      return {
        valid: false,
        message:
          `File exceeds maximum limit of ` +
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
      errorMessageText.textContent = validation.message;

      setActiveState("error");

      announce(validation.message);

      return;
    }

    currentFile = file;

    selectedFileName.textContent = file.name;

    selectedFileSize.textContent = formatBytes(file.size);

    const ext = getFileExtension(file.name);

    targetFormatSelect.value = ext === "pdf" ? "docx" : "pdf";

    setActiveState("selected");

    announce(`${file.name} selected. Ready to convert.`);
  }

  // ==========================================================
  // DRAG & DROP
  // ==========================================================

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

    if (files.length > 0) {
      handleFileSelection(files[0]);
    }
  });

  dropZone.addEventListener("click", () => fileInput.click());

  dropZone.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();

      fileInput.click();
    }
  });

  if (browseTrigger) {
    browseTrigger.addEventListener("click", (e) => {
      e.stopPropagation();

      fileInput.click();
    });
  }

  fileInput.addEventListener("change", (e) => {
    if (e.target.files.length > 0) {
      handleFileSelection(e.target.files[0]);
    }
  });

  // ==========================================================
  // REMOVE FILE
  // ==========================================================

  btnRemoveFile.addEventListener("click", () => {
    currentFile = null;

    fileInput.value = "";

    setActiveState("empty");

    announce("File removed.");
  });

  // ==========================================================
  // CONVERSION
  // ==========================================================

  btnStartConvert.addEventListener("click", async () => {
    if (!currentFile) {
      return;
    }

    convertingFileName.textContent = currentFile.name;

    progressBar.style.width = "0%";

    setActiveState("converting");

    announce(`Converting ${currentFile.name}.`);

    const targetFormat = targetFormatSelect.value;

    const formData = new FormData();

    formData.append("file", currentFile);

    formData.append("target_format", targetFormat);

    try {
      const convertedBlob = await executeUploadRequest(
        API_ENDPOINT,
        formData,
        (progressPercent) => {
          progressBar.style.width = `${progressPercent}%`;
        },
      );

      const downloadUrl = URL.createObjectURL(convertedBlob);

      const outputFilename =
        currentFile.name.replace(/\.[^/.]+$/, "") + `.${targetFormat}`;

      btnDownloadResult.href = downloadUrl;

      btnDownloadResult.download = outputFilename;

      successFileDetails.textContent = `${outputFilename} · ${formatBytes(
        convertedBlob.size,
      )}`;

      setActiveState("success");

      announce(
        `Your file is ready. ` + `${outputFilename} can now be downloaded.`,
      );
    } catch (error) {
      if (error.isBackendUnavailable) {
        try {
          await runDemoConversion(currentFile, targetFormat);
        } catch (demoError) {
          errorMessageText.textContent = demoError.message;

          setActiveState("error");

          announce(demoError.message);
        }

        return;
      }

      errorMessageText.textContent =
        error.message || "An unexpected error occurred during processing.";

      setActiveState("error");

      announce(errorMessageText.textContent);
    }
  });

  // ==========================================================
  // DEMO FALLBACK
  // ==========================================================

  function simulateDemoProgress(duration = 1600) {
    return new Promise((resolve) => {
      const start = performance.now();

      function tick(now) {
        const ratio = Math.min((now - start) / duration, 1);

        const eased = 1 - Math.pow(1 - ratio, 3);

        progressBar.style.width = `${Math.round(eased * 100)}%`;

        if (ratio < 1) {
          requestAnimationFrame(tick);
        } else {
          resolve();
        }
      }

      requestAnimationFrame(tick);
    });
  }

  async function runDemoConversion(file, targetFormat) {
    if (targetFormat !== "pdf") {
      throw new Error(
        "The live backend isn't connected yet, " +
          "so this preview can only demo conversions to PDF. " +
          "Select PDF as the target to see the full flow.",
      );
    }

    await simulateDemoProgress();

    const baseName = file.name.replace(/\.[^/.]+$/, "");

    const pdfBytes = buildDemoPDF([
      baseName,

      `Converted from ${file.name}`,

      "This is a placeholder file from the DocSwitch frontend preview.",

      "Connect the FastAPI backend at /api/v1/convert to produce a real conversion.",
    ]);

    const blob = new Blob([pdfBytes], {
      type: "application/pdf",
    });

    const downloadUrl = URL.createObjectURL(blob);

    const outputFilename = `${baseName}.pdf`;

    btnDownloadResult.href = downloadUrl;

    btnDownloadResult.download = outputFilename;

    successFileDetails.textContent = `${outputFilename} · ${formatBytes(
      blob.size,
    )}`;

    setActiveState("success");

    announce(
      `Your file is ready. ` + `${outputFilename} can now be downloaded.`,
    );
  }

  // ==========================================================
  // DEMO PDF BUILDER
  // ==========================================================

  function buildDemoPDF(lines) {
    const offsets = [];

    let pdf = "%PDF-1.4\n";

    function addObj(str) {
      offsets.push(pdf.length);

      pdf += str;
    }

    addObj("1 0 obj\n" + "<< /Type /Catalog /Pages 2 0 R >>\n" + "endobj\n");

    addObj(
      "2 0 obj\n" + "<< /Type /Pages /Kids [3 0 R] /Count 1 >>\n" + "endobj\n",
    );

    addObj(
      "3 0 obj\n" +
        "<< /Type /Page /Parent 2 0 R " +
        "/MediaBox [0 0 612 792] " +
        "/Resources << /Font << /F1 4 0 R >> >> " +
        "/Contents 5 0 R >>\n" +
        "endobj\n",
    );

    addObj(
      "4 0 obj\n" +
        "<< /Type /Font /Subtype /Type1 " +
        "/BaseFont /Helvetica >>\n" +
        "endobj\n",
    );

    let stream = "BT /F1 16 Tf 72 720 Td ";

    lines.forEach((line, i) => {
      const esc = String(line).replace(/([()\\])/g, "\\$1");

      stream += i === 0 ? `(${esc}) Tj ` : `0 -26 Td (${esc}) Tj `;
    });

    stream += "ET";

    addObj(
      `5 0 obj\n` +
        `<< /Length ${stream.length} >>\n` +
        `stream\n${stream}\n` +
        `endstream\nendobj\n`,
    );

    const xrefStart = pdf.length;

    let xref = `xref\n0 ${offsets.length + 1}\n` + "0000000000 65535 f \n";

    offsets.forEach((off) => {
      xref += String(off).padStart(10, "0") + " 00000 n \n";
    });

    pdf += xref;

    pdf +=
      `trailer\n` +
      `<< /Size ${offsets.length + 1} /Root 1 0 R >>\n` +
      `startxref\n` +
      `${xrefStart}\n` +
      `%%EOF`;

    const bytes = new Uint8Array(pdf.length);

    for (let i = 0; i < pdf.length; i++) {
      bytes[i] = pdf.charCodeAt(i);
    }

    return bytes;
  }

  // ==========================================================
  // XHR REQUEST
  // ==========================================================

  function executeUploadRequest(url, data, onProgress) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();

      xhr.upload.addEventListener("progress", (e) => {
        if (e.lengthComputable) {
          const percent = Math.round((e.loaded / e.total) * 90);

          onProgress(percent);
        }
      });

      xhr.addEventListener("load", () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          onProgress(100);

          resolve(xhr.response);

          return;
        }

        if (xhr.status === 404 || xhr.status === 0) {
          const err = new Error("Conversion endpoint not available.");

          err.isBackendUnavailable = true;

          reject(err);

          return;
        }

        try {
          const errorResponse = JSON.parse(xhr.responseText);

          reject(
            new Error(errorResponse.detail || "Server failed to process file."),
          );
        } catch {
          reject(
            new Error(
              "Conversion failed. " + "Please verify your file and try again.",
            ),
          );
        }
      });

      xhr.addEventListener("error", () => {
        const err = new Error("Network failure. Check your connection.");

        err.isBackendUnavailable = true;

        reject(err);
      });

      xhr.responseType = "blob";

      xhr.open("POST", url);

      xhr.send(data);
    });
  }

  // ==========================================================
  // RESET
  // ==========================================================

  btnResetConverter.addEventListener("click", () => {
    currentFile = null;

    fileInput.value = "";

    setActiveState("empty");

    announce("Converter reset.");
  });

  btnErrorRetry.addEventListener("click", () => {
    if (currentFile) {
      setActiveState("selected");
    } else {
      setActiveState("empty");
    }
  });

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

    // Remove previously generated clones.
    track
      .querySelectorAll(".format-set[data-clone]")
      .forEach((clone) => clone.remove());

    /*
     * Measure the original content.
     * getBoundingClientRect() gives us the exact rendered width,
     * including responsive font sizing and spacing.
     */
    const setWidth = originalSet.getBoundingClientRect().width;

    if (!setWidth) return;

    /*
     * We need enough copies to completely cover the viewport.
     * This prevents blank space on large monitors.
     */
    const viewportWidth = window.innerWidth;

    const copiesNeeded = Math.ceil(viewportWidth / setWidth) + 2;

    /*
     * Create enough identical copies.
     */
    for (let i = 0; i < copiesNeeded; i++) {
      const clone = originalSet.cloneNode(true);

      clone.setAttribute("data-clone", "true");
      clone.setAttribute("aria-hidden", "true");

      track.appendChild(clone);
    }

    /*
     * Move exactly ONE sequence width.
     *
     * Because the next sequence is identical,
     * the final frame and first frame look identical.
     */
    track.style.setProperty("--marquee-distance", `${setWidth}px`);

    /*
     * Slightly different speeds create a more natural
     * editorial / premium feel.
     */
    const direction = track.dataset.direction;

    if (direction === "left") {
      track.style.setProperty("--marquee-duration", "30s");
    } else {
      track.style.setProperty("--marquee-duration", "34s");
    }
  });
}

// Initialize after the page has rendered.
initializeFormatMarquee();

/*
 * Recalculate when the viewport changes.
 *
 * ResizeObserver is preferable to repeatedly firing
 * calculations on every resize event.
 */
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

  // ------------------------------------------------------------
  // CONFIGURATION
  // ------------------------------------------------------------

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

      /*
       * Natural star size distribution.
       */

      const sizeRoll = Math.random();

      if (sizeRoll > 0.965) {
        // Rare larger stars
        this.radius = 1.15 + Math.random() * 0.25;
      } else if (sizeRoll > 0.83) {
        // Medium stars
        this.radius = 0.68 + Math.random() * 0.38;
      } else {
        // Small stars
        this.radius = 0.34 + Math.random() * 0.38;
      }

      /*
       * Brightness.
       */

      this.opacity =
        config.minOpacity +
        Math.random() * (config.maxOpacity - config.minOpacity);

      /*
       * Depth.
       */

      this.depth = 0.4 + Math.random() * 1.2;

      this.speed = config.speed * this.depth;

      /*
       * Subtle twinkle.
       */

      this.twinkle = Math.random() > 0.8;

      this.twinkleSpeed = 0.0015 + Math.random() * 0.004;

      this.twinkleOffset = Math.random() * Math.PI * 2;
    }

    // ----------------------------------------------------------
    // UPDATE
    // ----------------------------------------------------------

    update(time) {
      if (!reducedMotion) {
        /*
         * Slow atmospheric movement.
         */

        this.y += this.speed;

        /*
         * Almost invisible horizontal drift.
         */

        this.x += Math.sin(time * 0.00015 + this.x * 0.01) * 0.006;
      }

      /*
       * Wrap around.
       */

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

      /*
       * Gentle twinkle.
       */

      if (this.twinkle && !reducedMotion) {
        alpha *=
          0.74 + Math.sin(time * this.twinkleSpeed + this.twinkleOffset) * 0.26;
      }

      // --------------------------------------------------------
      // STAR
      // --------------------------------------------------------

      ctx.beginPath();

      ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);

      ctx.fillStyle = `rgba(220, 228, 245, ${alpha})`;

      ctx.fill();

      // --------------------------------------------------------
      // SOFT BLUE GLOW
      // --------------------------------------------------------

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

if (btnStartConvert) {
  btnStartConvert.addEventListener("pointermove", (e) => {
    const rect = btnStartConvert.getBoundingClientRect();

    const x = e.clientX - rect.left;

    const y = e.clientY - rect.top;

    btnStartConvert.style.setProperty("--button-x", `${x}px`);

    btnStartConvert.style.setProperty("--button-y", `${y}px`);
  });
}
