/* ============================================================
   DOCSWITCH — SIMPLE FRONTEND CONTROLLER
   ============================================================ */

document.addEventListener("DOMContentLoaded", () => {
  // ==========================================================
  // CONFIG
  // ==========================================================

  const API_BASE_URL = "http://127.0.0.1:8000";

  const CONVERT_URL = `${API_BASE_URL}/api/v1/convert`;

  const MAX_FILE_SIZE = 25 * 1024 * 1024;

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

  const OUTPUT_FORMATS = ["pdf", "docx"];

  // ==========================================================
  // STATE
  // ==========================================================

  let currentFile = null;
  let downloadUrl = null;
  let outputFilename = null;
  let converting = false;

  // Tracks whether the one-time download has already been used.
  let downloadConsumed = false;

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

  const errorMessage = document.getElementById("error-message-text");

  const btnErrorRetry = document.getElementById("btn-error-retry");

  const liveRegion = document.getElementById("live-region");

  // ==========================================================
  // DEBUG
  // ==========================================================

  console.log("DocSwitch frontend loaded.");
  console.log("Convert API:", CONVERT_URL);

  // ==========================================================
  // UI STATE
  // ==========================================================

  function showState(name) {
    Object.entries(states).forEach(([key, state]) => {
      if (!state) return;

      const active = key === name;

      if (!active && state.contains(document.activeElement)) {
        document.activeElement.blur();
      }

      state.classList.toggle("active", active);

      state.inert = !active;
    });

    console.log("UI:", name);
  }

  function announce(message) {
    if (!liveRegion) return;

    liveRegion.textContent = message;
  }

  function setProgress(value) {
    if (!progressBar) return;

    const progress = Math.max(0, Math.min(100, value));

    progressBar.style.width = `${progress}%`;

    progressBar.setAttribute("aria-valuenow", String(progress));
  }

  function setDownloadEnabled(enabled) {
    if (!btnDownloadResult) return;

    btnDownloadResult.disabled = !enabled;

    btnDownloadResult.setAttribute("aria-disabled", String(!enabled));
  }

  // ==========================================================
  // HELPERS
  // ==========================================================

  function getExtension(filename) {
    const dot = filename.lastIndexOf(".");

    if (dot === -1) {
      return "";
    }

    return filename.slice(dot + 1).toLowerCase();
  }

  function getBaseName(filename) {
    const dot = filename.lastIndexOf(".");

    if (dot === -1) {
      return filename;
    }

    return filename.slice(0, dot);
  }

  function formatBytes(bytes) {
    if (!bytes) {
      return "0 KB";
    }

    if (bytes < 1024) {
      return `${bytes} Bytes`;
    }

    if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)} KB`;
    }

    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function getDownloadUrl(url) {
    if (!url) {
      return null;
    }

    return new URL(url, API_BASE_URL).href;
  }

  // ==========================================================
  // FILE VALIDATION
  // ==========================================================

  function validateFile(file) {
    if (!file) {
      return "Please select a file.";
    }

    if (!file.name) {
      return "The selected file has no name.";
    }

    const extension = getExtension(file.name);

    if (!ALLOWED_EXTENSIONS.includes(extension)) {
      return (
        `.${extension.toUpperCase()} files are not supported. ` +
        "Supported formats: PDF, DOCX, DOC, TXT, RTF, PPTX, PPT, JPG, JPEG, PNG and WEBP."
      );
    }

    if (file.size === 0) {
      return "The selected file is empty.";
    }

    if (file.size > MAX_FILE_SIZE) {
      return "File exceeds the 25 MB limit.";
    }

    return null;
  }

  // ==========================================================
  // FILE SELECTION
  // ==========================================================

  function selectFile(file) {
    const error = validateFile(file);

    if (error) {
      showError(error);
      return;
    }

    currentFile = file;
    downloadUrl = null;
    outputFilename = null;

    // New file = new download opportunity.
    downloadConsumed = false;

    setDownloadEnabled(false);

    // Restore original download button label.
    if (btnDownloadResult) {
      btnDownloadResult.textContent = "Download";
    }

    selectedFileName.textContent = file.name;

    selectedFileSize.textContent = formatBytes(file.size);

    convertingFileName.textContent = file.name;

    const sourceFormat = getExtension(file.name);

    /*
     * Only two output formats exist.
     * Disable the format matching the input.
     */

    Array.from(targetFormatSelect.options).forEach((option) => {
      option.disabled = option.value === sourceFormat;
    });

    if (sourceFormat === "pdf") {
      targetFormatSelect.value = "docx";
    } else {
      targetFormatSelect.value = "pdf";
    }

    setProgress(0);

    showState("selected");

    announce(`${file.name} selected.`);

    console.log("File selected:", file.name);
  }

  // ==========================================================
  // ERROR
  // ==========================================================

  function showError(message) {
    console.error("DocSwitch:", message);

    if (errorMessage) {
      errorMessage.textContent = message;
    }

    showState("error");
    announce(message);
  }

  // ==========================================================
  // BROWSE
  // ==========================================================

  browseTrigger?.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();

    if (!converting) {
      fileInput.click();
    }
  });

  // ==========================================================
  // FILE INPUT
  // ==========================================================

  fileInput?.addEventListener("change", () => {
    const file = fileInput.files?.[0];

    if (file) {
      selectFile(file);
    }
  });

  // ==========================================================
  // DROP ZONE
  // ==========================================================

  dropZone?.addEventListener("dragover", (event) => {
    event.preventDefault();

    if (!converting) {
      dropZone.classList.add("drag-over");
    }
  });

  dropZone?.addEventListener("dragleave", () => {
    dropZone.classList.remove("drag-over");
  });

  dropZone?.addEventListener("drop", (event) => {
    event.preventDefault();

    dropZone.classList.remove("drag-over");

    if (converting) {
      return;
    }

    const file = event.dataTransfer?.files?.[0];

    if (file) {
      selectFile(file);
    }
  });

  dropZone?.addEventListener("click", (event) => {
    if (event.target.closest("#browse-trigger")) {
      return;
    }

    if (!converting) {
      fileInput.click();
    }
  });

  dropZone?.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();

      if (!converting) {
        fileInput.click();
      }
    }
  });

  // ==========================================================
  // REMOVE FILE
  // ==========================================================

  btnRemoveFile?.addEventListener("click", () => {
    if (converting) {
      return;
    }

    reset();
  });

  // ==========================================================
  // CONVERT
  // ==========================================================

  btnStartConvert?.addEventListener("click", async () => {
    if (converting) {
      return;
    }

    if (!currentFile) {
      showError("Please select a file first.");
      return;
    }

    const targetFormat = targetFormatSelect.value.toLowerCase().trim();

    if (!OUTPUT_FORMATS.includes(targetFormat)) {
      showError("Please select PDF or DOCX.");
      return;
    }

    const sourceFormat = getExtension(currentFile.name);

    if (sourceFormat === targetFormat) {
      showError("The file is already in that format.");
      return;
    }

    converting = true;

    btnStartConvert.disabled = true;

    setProgress(10);

    showState("converting");

    announce(`Converting ${currentFile.name}.`);

    console.log("Starting conversion:", {
      file: currentFile.name,
      target: targetFormat,
    });

    const formData = new FormData();

    formData.append("file", currentFile, currentFile.name);

    formData.append("target_format", targetFormat);

    try {
      setProgress(25);

      const response = await fetch(CONVERT_URL, {
        method: "POST",
        body: formData,
      });

      console.log("Conversion response:", response.status);

      // ================================================
      // HTTP ERROR
      // ================================================

      if (!response.ok) {
        let message = `Conversion failed (${response.status}).`;

        try {
          const data = await response.json();

          if (typeof data.detail === "string") {
            message = data.detail;
          }
        } catch {
          // Keep default message.
        }

        throw new Error(message);
      }

      // ================================================
      // READ JSON
      // ================================================

      setProgress(75);

      const result = await response.json();

      console.log("Backend conversion result:", result);

      // ================================================
      // VALIDATE BACKEND RESPONSE
      // ================================================

      if (result.success !== true) {
        throw new Error("The backend did not report a successful conversion.");
      }

      if (!result.download_url) {
        throw new Error("The backend did not provide a download URL.");
      }

      if (!result.filename) {
        throw new Error("The backend did not provide an output filename.");
      }

      // ================================================
      // STORE DOWNLOAD INFORMATION
      // ================================================

      downloadUrl = getDownloadUrl(result.download_url);

      outputFilename = result.filename;

      // New converted file = download available.
      downloadConsumed = false;

      if (!downloadUrl) {
        throw new Error("The backend returned an invalid download URL.");
      }

      console.log("Download URL:", downloadUrl);

      console.log("Output:", outputFilename);

      // ================================================
      // SUCCESS UI
      // ================================================

      successFileDetails.textContent = `${outputFilename} · ${formatBytes(result.size)}`;

      // Make sure the button is available.
      if (btnDownloadResult) {
        btnDownloadResult.textContent = "Download";
      }

      setDownloadEnabled(true);

      setProgress(100);

      showState("success");

      announce(`${outputFilename} is ready for download.`);

      console.log("Conversion successful.");
    } catch (error) {
      console.error("Conversion error:", error);

      showError(error.message || "Unable to convert the file.");
    } finally {
      converting = false;

      btnStartConvert.disabled = false;
    }
  });

  // ==========================================================
  // DOWNLOAD — ONE-TIME DOWNLOAD
  // ==========================================================

  btnDownloadResult?.addEventListener("click", () => {
    // --------------------------------------------------------
    // No download URL exists
    // --------------------------------------------------------

    if (!downloadUrl) {
      showError("No converted file is available.");
      return;
    }

    // --------------------------------------------------------
    // Download already consumed
    // --------------------------------------------------------

    if (downloadConsumed) {
      console.warn("Download blocked: file has already been downloaded.");

      announce(
        "This file has already been downloaded and is no longer available.",
      );

      return;
    }

    // --------------------------------------------------------
    // Consume the download
    // --------------------------------------------------------

    console.log("Downloading:", outputFilename);

    /*
     * IMPORTANT:
     *
     * Mark the download as consumed BEFORE navigating.
     *
     * This prevents double-clicks or repeated frontend
     * attempts from initiating another download.
     */

    downloadConsumed = true;

    // --------------------------------------------------------
    // Disable download button immediately
    // --------------------------------------------------------

    setDownloadEnabled(false);

    if (btnDownloadResult) {
      btnDownloadResult.textContent = "Downloaded";
    }

    announce(`Downloading ${outputFilename}.`);

    /*
     * The browser now talks directly to FastAPI's
     * download endpoint.
     *
     * FastAPI is responsible for:
     *
     * 1. Serving the converted file.
     * 2. Removing/deleting the file after the download.
     *
     * The frontend is responsible for preventing
     * additional download attempts through the UI.
     */

    window.location.href = downloadUrl;
  });

  // ==========================================================
  // RESET
  // ==========================================================

  function reset() {
    if (converting) {
      return;
    }

    currentFile = null;
    downloadUrl = null;
    outputFilename = null;

    // Reset one-time download state.
    downloadConsumed = false;

    fileInput.value = "";

    selectedFileName.textContent = "filename.pdf";

    selectedFileSize.textContent = "0 KB";

    convertingFileName.textContent = "filename.pdf";

    successFileDetails.textContent = "converted.pdf";

    targetFormatSelect.value = "pdf";

    Array.from(targetFormatSelect.options).forEach((option) => {
      option.disabled = false;
    });

    // Restore download button.
    if (btnDownloadResult) {
      btnDownloadResult.textContent = "Download";
    }

    setDownloadEnabled(false);

    setProgress(0);

    showState("empty");

    announce("Converter reset.");
  }

  btnResetConverter?.addEventListener("click", reset);

  // ==========================================================
  // ERROR RETRY
  // ==========================================================

  btnErrorRetry?.addEventListener("click", () => {
    if (currentFile) {
      showState("selected");
      announce(`${currentFile.name} is ready to convert again.`);
    } else {
      showState("empty");
    }
  });

  // ==========================================================
  // INITIAL STATE
  // ==========================================================

  downloadConsumed = false;

  setDownloadEnabled(false);

  setProgress(0);

  showState("empty");
});

/* ============================================================
   FORMAT MARQUEE
   ============================================================ */

function initializeFormatMarquee() {
  const tracks = document.querySelectorAll(".format-track");

  tracks.forEach((track) => {
    const original = track.querySelector(".format-set");

    if (!original) {
      return;
    }

    track
      .querySelectorAll('.format-set[data-clone="true"]')
      .forEach((clone) => {
        clone.remove();
      });

    const width = original.getBoundingClientRect().width;

    if (!width) {
      return;
    }

    const copies = Math.ceil(window.innerWidth / width) + 2;

    for (let i = 0; i < copies; i++) {
      const clone = original.cloneNode(true);

      clone.dataset.clone = "true";

      clone.setAttribute("aria-hidden", "true");

      track.appendChild(clone);
    }

    track.style.setProperty("--marquee-distance", `${width}px`);

    track.style.setProperty(
      "--marquee-duration",
      track.dataset.direction === "left" ? "30s" : "34s",
    );
  });
}

document.addEventListener("DOMContentLoaded", initializeFormatMarquee);

let marqueeResizeTimeout;

window.addEventListener("resize", () => {
  clearTimeout(marqueeResizeTimeout);

  marqueeResizeTimeout = setTimeout(initializeFormatMarquee, 150);
});

/* ============================================================
   CINEMATIC STARFIELD
   ============================================================ */

document.addEventListener("DOMContentLoaded", () => {
  const canvas = document.getElementById("ambient-canvas");

  if (!canvas) {
    return;
  }

  const ctx = canvas.getContext("2d");

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

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    width = window.innerWidth;

    height = window.innerHeight;

    canvas.width = width * dpr;

    canvas.height = height * dpr;

    canvas.style.width = `${width}px`;

    canvas.style.height = `${height}px`;

    ctx.setTransform(1, 0, 0, 1, 0, 0);

    ctx.scale(dpr, dpr);
  }

  class Star {
    constructor() {
      this.x = Math.random() * width;

      this.y = Math.random() * height;

      this.radius = 0.3 + Math.random() * 0.8;

      this.opacity =
        config.minOpacity +
        Math.random() * (config.maxOpacity - config.minOpacity);

      this.speed = config.speed * (0.4 + Math.random() * 1.2);
    }

    update() {
      if (reducedMotion) {
        return;
      }

      this.y += this.speed;

      if (this.y > height + 10) {
        this.y = -10;

        this.x = Math.random() * width;
      }
    }

    draw() {
      ctx.beginPath();

      ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);

      ctx.fillStyle = `rgba(220,228,245,${this.opacity})`;

      ctx.fill();
    }
  }

  function createStars() {
    const count =
      window.innerWidth < 768 ? config.mobileStars : config.desktopStars;

    stars = Array.from(
      {
        length: count,
      },
      () => new Star(),
    );
  }

  function animate() {
    ctx.clearRect(0, 0, width, height);

    stars.forEach((star) => {
      star.update();
      star.draw();
    });

    if (!reducedMotion) {
      requestAnimationFrame(animate);
    }
  }

  resize();
  createStars();
  animate();

  window.addEventListener(
    "resize",
    () => {
      resize();
      createStars();

      if (!reducedMotion) {
        animate();
      }
    },
    {
      passive: true,
    },
  );
});

/* ============================================================
   DROPZONE CURSOR LIGHT
   ============================================================ */

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

/* ============================================================
   CONVERT BUTTON CURSOR LIGHT
   ============================================================ */

document.addEventListener("DOMContentLoaded", () => {
  const button = document.getElementById("btn-start-convert");

  if (!button) {
    return;
  }

  button.addEventListener("pointermove", (event) => {
    const rect = button.getBoundingClientRect();

    button.style.setProperty("--button-x", `${event.clientX - rect.left}px`);

    button.style.setProperty("--button-y", `${event.clientY - rect.top}px`);
  });
});
