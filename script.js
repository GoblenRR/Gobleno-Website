(() => {
  const lanyardUserId = "488391678734893066";
  const lanyardSocketEndpoint = "wss://api.lanyard.rest/socket";
  const apiBaseUrl = window.location.protocol === "file:"
    ? "https://gobleno.co.uk"
    : "";
  const videosApiUrl = `${apiBaseUrl}/api/videos`;
  const workContentApiUrl = `${apiBaseUrl}/api/work-content`;
  const workAssetUploadApiUrl = `${apiBaseUrl}/api/dev/upload-image`;
  const devSessionApiUrl = `${apiBaseUrl}/api/dev/session`;
  const devLoginApiUrl = `${apiBaseUrl}/api/dev/login`;
  const devSessionStorageKey = "gobleno_dev_token";
  const contentSections = new Set(["music", "ui", "games", "extras"]);
  const supportedAudioExtensions = new Set(["mp3", "wav", "ogg"]);
  const supportedAudioMimeTypes = new Set([
    "audio/mpeg",
    "audio/mp3",
    "audio/wav",
    "audio/wave",
    "audio/x-wav",
    "audio/vnd.wave",
    "audio/ogg",
    "application/ogg"
  ]);
  const maxAudioUploadBytes = 5 * 1024 * 1024;
  const currentHash = window.location.hash.replace("#", "").trim().toLowerCase();
  const shouldPlayStartupIntro = !currentHash || currentHash === "home";
  const workEntriesBySection = new Map();
  const devEntriesBySection = new Map();

  if (shouldPlayStartupIntro) {
    document.body.classList.add("play-startup-intro");
  }

  const routeApp = document.querySelector("[data-route-app]");
  const workSectionTriggers = Array.from(document.querySelectorAll("[data-work-section-trigger]"));
  const workSectionPanels = Array.from(document.querySelectorAll("[data-work-section-panel]"));
  const workContentBoards = new Map(
    Array.from(document.querySelectorAll("[data-work-content-board]")).map((node) => [node.dataset.workContentBoard, node])
  );
  const videosBoard = document.querySelector("[data-videos-board]");
  const videosStatus = document.querySelector("[data-videos-status]");
  const devToggle = document.querySelector("[data-dev-toggle]");
  const devModal = document.querySelector("[data-dev-modal]");
  const devCloseButtons = Array.from(document.querySelectorAll("[data-dev-close]"));
  const devLoginForm = document.querySelector("[data-dev-login-form]");
  const devAuthPanel = document.querySelector("[data-dev-auth-panel]");
  const devEntryForm = document.querySelector("[data-dev-entry-form]");
  const devEntryListSection = document.querySelector("[data-dev-entry-list-section]");
  const devEntryList = document.querySelector("[data-dev-entry-list]");
  const devEditState = document.querySelector("[data-dev-edit-state]");
  const devEditLabel = document.querySelector("[data-dev-edit-label]");
  const devSubmitLabel = document.querySelector("[data-dev-submit-label]");
  const devCancelEdit = document.querySelector("[data-dev-cancel-edit]");
  const contactForm = document.querySelector("[data-contact-form]");
  const contactStatus = document.querySelector("[data-contact-status]");
  const devStatus = document.querySelector("[data-dev-status]");
  const topbarAudioControl = document.querySelector("[data-topbar-audio-control]");
  const topbarAudioSlider = document.querySelector("[data-topbar-audio-slider]");
  const topbarAudioValue = document.querySelector("[data-topbar-audio-value]");
  const imagePreviewShell = document.querySelector("[data-image-preview]");
  const imagePreviewStage = document.querySelector("[data-image-preview-stage]");
  const imagePreviewDialog = imagePreviewStage ? imagePreviewStage.parentElement : null;
  let activeRoute = "";
  let activeWorkSection = "videos";
  let videosLoaded = false;
  let videosLoading = false;
  const loadedContentSections = new Set();
  const loadingContentSections = new Set();
  let isDevAuthenticated = false;
  let devSessionToken = window.localStorage.getItem(devSessionStorageKey) || "";
  let lastSessionDiagnostic = null;
  let hasAttemptedDevLogin = false;
  let devEntriesLoadingSection = "";
  let activeAudioEntry = null;
  let audioEntryVolume = 1;

  const escapeHtml = (value) => String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

  const formatMultilineHtml = (value) => escapeHtml(value).replace(/\r?\n/g, "<br>");
  const getFileExtension = (name) => {
    const trimmed = String(name || "").trim().toLowerCase();
    const parts = trimmed.split(".");
    return parts.length > 1 ? parts.pop() || "" : "";
  };

  const normalizeAudioType = (audioType, fileName = "") => {
    const normalizedType = String(audioType || "").trim().toLowerCase();
    const extension = getFileExtension(fileName);

    if (!normalizedType) {
      return ({
        mp3: "audio/mpeg",
        wav: "audio/wav",
        ogg: "audio/ogg"
      }[extension] || "");
    }

    return normalizedType;
  };

  const isSupportedAudioType = (audioType, fileName = "") => {
    const normalizedType = normalizeAudioType(audioType, fileName);
    const extension = getFileExtension(fileName);

    if (extension && !supportedAudioExtensions.has(extension)) {
      return false;
    }

    if (!normalizedType) {
      return Boolean(extension) && supportedAudioExtensions.has(extension);
    }

    return supportedAudioMimeTypes.has(normalizedType);
  };

  const validateAttachmentFile = (file) => {
    if (!(file instanceof File) || !file.size) {
      return { kind: "", audioType: "" };
    }

    if (String(file.type || "").startsWith("image/")) {
      return { kind: "image", audioType: "" };
    }

    if (!isSupportedAudioType(file.type, file.name)) {
      throw new Error("unsupported audio format");
    }

    if (file.size > maxAudioUploadBytes) {
      throw new Error("audio file too large");
    }

    return {
      kind: "audio",
      audioType: normalizeAudioType(file.type, file.name)
    };
  };

  const formatTime = (seconds) => {
    if (!Number.isFinite(seconds) || seconds < 0) {
      return "0:00";
    }

    const rounded = Math.floor(seconds);
    const hours = Math.floor(rounded / 3600);
    const minutes = Math.floor((rounded % 3600) / 60);
    const remainder = rounded % 60;

    if (hours > 0) {
      return `${hours}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
    }

    return `${minutes}:${String(remainder).padStart(2, "0")}`;
  };

  const syncTopbarAudioUi = () => {
    if (topbarAudioSlider instanceof HTMLInputElement) {
      topbarAudioSlider.value = String(Math.round(audioEntryVolume * 100));
    }

    if (topbarAudioValue) {
      topbarAudioValue.textContent = `${Math.round(audioEntryVolume * 100)}%`;
    }
  };

  const applyAudioVolumeToEntries = (root = document) => {
    const audioElements = Array.from(root.querySelectorAll("[data-audio-entry] audio"));
    audioElements.forEach((audio) => {
      if (audio instanceof HTMLAudioElement) {
        audio.volume = audioEntryVolume;
      }
    });
  };

  const updateTopbarAudioVisibility = () => {
    if (!(topbarAudioControl instanceof HTMLElement) || !routeApp) return;

    const activePanel = routeApp.querySelector(`[data-route-panel="${activeRoute}"]`);
    const scope = activePanel instanceof HTMLElement && activeRoute === "my-work"
      ? activePanel.querySelector(`[data-work-section-panel="${activeWorkSection}"]`)
      : activePanel;
    const hasAudioEntry = scope instanceof HTMLElement && !scope.hidden
      ? Boolean(scope.querySelector("[data-audio-entry]"))
      : false;

    topbarAudioControl.hidden = !hasAudioEntry;
  };

  const setDevStatus = (message, tone = "info") => {
    if (!devStatus) return;

    if (!message) {
      devStatus.hidden = true;
      devStatus.textContent = "";
      devStatus.dataset.tone = "info";
      return;
    }

    devStatus.hidden = false;
    devStatus.textContent = message;
    devStatus.dataset.tone = tone;
  };

  const humanizeDiagnostic = (value) => String(value || "").replace(/_/g, " ");

  const formatSessionDiagnostic = (payload) => {
    if (!payload) {
      return "session check returned no data";
    }

    const parts = [];

    if (payload.reason) {
      parts.push(`reason: ${humanizeDiagnostic(payload.reason)}`);
    }

    if (payload.source) {
      parts.push(`source: ${humanizeDiagnostic(payload.source)}`);
    }

    if (payload.expires_at) {
      parts.push(`expires: ${new Date(payload.expires_at).toLocaleString()}`);
    }

    return parts.join(" | ") || "unknown session state";
  };

  const syncDevUi = () => {
    if (devModal) {
      devModal.classList.toggle("is-locked", !isDevAuthenticated);
      devModal.classList.toggle("is-unlocked", isDevAuthenticated);
    }

    if (devLoginForm) {
      devLoginForm.hidden = isDevAuthenticated;
    }

    if (devAuthPanel) {
      devAuthPanel.hidden = !isDevAuthenticated;
    }
  };

  const openDevModal = () => {
    if (!devModal) return;
    devModal.hidden = false;
    document.body.classList.add("dev-panel-open");
  };

  const closeDevModal = () => {
    if (!devModal) return;
    devModal.hidden = true;
    document.body.classList.remove("dev-panel-open");
    setDevStatus("");
  };

  const resetDevFormMediaState = () => {
    if (!(devEntryForm instanceof HTMLFormElement)) return;

    devEntryForm.dataset.currentImageUrl = "";
    devEntryForm.dataset.currentImageAlt = "";
    devEntryForm.dataset.currentAudioUrl = "";
    devEntryForm.dataset.currentAudioType = "";
    devEntryForm.dataset.currentAudioSizeBytes = "";
    devEntryForm.dataset.originalSection = "";
  };

  const clearDevEditMode = (preferredSection = "") => {
    if (!(devEntryForm instanceof HTMLFormElement)) return;

    devEntryForm.reset();
    resetDevFormMediaState();

    const entryIdField = devEntryForm.querySelector('[name="entry_id"]');
    const sectionField = devEntryForm.querySelector('[name="section"]');
    const sortField = devEntryForm.querySelector('[name="sort_order"]');
    const fileField = devEntryForm.querySelector('[name="attachment_file"]');

    if (entryIdField instanceof HTMLInputElement) {
      entryIdField.value = "";
    }

    if (sectionField instanceof HTMLSelectElement && preferredSection) {
      sectionField.value = preferredSection;
    }

    if (sortField instanceof HTMLInputElement) {
      sortField.value = "0";
    }

    if (fileField instanceof HTMLInputElement) {
      fileField.value = "";
    }

    if (devEditState) {
      devEditState.hidden = true;
    }

    if (devEditLabel) {
      devEditLabel.textContent = "Updating existing entry";
    }

    if (devSubmitLabel) {
      devSubmitLabel.textContent = "Add entry";
    }

    if (devCancelEdit) {
      devCancelEdit.hidden = true;
    }
  };

  const enterDevEditMode = (entry) => {
    if (!(devEntryForm instanceof HTMLFormElement)) return;

    const entryIdField = devEntryForm.querySelector('[name="entry_id"]');
    const sectionField = devEntryForm.querySelector('[name="section"]');
    const titleField = devEntryForm.querySelector('[name="title"]');
    const bodyField = devEntryForm.querySelector('[name="body"]');
    const linkField = devEntryForm.querySelector('[name="link_url"]');
    const sortField = devEntryForm.querySelector('[name="sort_order"]');
    const fileField = devEntryForm.querySelector('[name="attachment_file"]');

    if (entryIdField instanceof HTMLInputElement) {
      entryIdField.value = String(entry.id || "");
    }

    if (sectionField instanceof HTMLSelectElement) {
      sectionField.value = String(entry.section || "music");
    }

    if (titleField instanceof HTMLInputElement) {
      titleField.value = String(entry.title || "");
    }

    if (bodyField instanceof HTMLTextAreaElement) {
      bodyField.value = String(entry.body || "");
    }

    if (linkField instanceof HTMLInputElement) {
      linkField.value = String(entry.link_url || "");
    }

    if (sortField instanceof HTMLInputElement) {
      sortField.value = String(Number(entry.sort_order || 0));
    }

    if (fileField instanceof HTMLInputElement) {
      fileField.value = "";
    }

    devEntryForm.dataset.currentImageUrl = String(entry.image_url || "");
    devEntryForm.dataset.currentImageAlt = String(entry.image_alt || entry.title || "Work image");
    devEntryForm.dataset.currentAudioUrl = String(entry.audio_url || "");
    devEntryForm.dataset.currentAudioType = String(entry.audio_type || "");
    devEntryForm.dataset.currentAudioSizeBytes = String(entry.audio_size_bytes || "");
    devEntryForm.dataset.originalSection = String(entry.section || "");

    if (devEditState) {
      devEditState.hidden = false;
    }

    if (devEditLabel) {
      devEditLabel.textContent = entry.title
        ? `Updating "${entry.title}"`
        : "Updating existing entry";
    }

    if (devSubmitLabel) {
      devSubmitLabel.textContent = "Save changes";
    }

    if (devCancelEdit) {
      devCancelEdit.hidden = false;
    }

    if (devModal) {
      devModal.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const closeImagePreview = () => {
    if (!imagePreviewShell || !imagePreviewStage) return;

    imagePreviewShell.hidden = true;
    imagePreviewShell.classList.remove("is-visible");
    document.body.classList.remove("image-preview-open");
    imagePreviewStage.innerHTML = "";

    if (imagePreviewDialog) {
      imagePreviewDialog.classList.remove("is-loading", "is-error");
    }
  };

  const openImagePreview = (sourceImage, fallbackSrc = "", fallbackAlt = "") => {
    if (!imagePreviewShell || !imagePreviewStage) return;

    const previewImage = sourceImage instanceof HTMLImageElement
      ? sourceImage.cloneNode(true)
      : document.createElement("img");
    const src = String(
      (sourceImage instanceof HTMLImageElement ? (sourceImage.currentSrc || sourceImage.src) : "")
      || fallbackSrc
      || ""
    ).trim();
    const alt = String(
      (sourceImage instanceof HTMLImageElement ? sourceImage.alt : "")
      || fallbackAlt
      || "Preview image"
    ).trim();

    if (!src) return;

    imagePreviewShell.hidden = false;
    document.body.classList.add("image-preview-open");

    previewImage.className = "image-preview-dialog__image";
    previewImage.decoding = "async";
    previewImage.loading = "eager";
    previewImage.alt = alt;
    previewImage.removeAttribute("width");
    previewImage.removeAttribute("height");
    previewImage.src = src;

    imagePreviewStage.innerHTML = "";
    imagePreviewStage.appendChild(previewImage);

    if (imagePreviewDialog) {
      imagePreviewDialog.classList.add("is-loading");
      imagePreviewDialog.classList.remove("is-error");
    }

    const finishLoading = () => {
      if (!imagePreviewDialog) return;
      imagePreviewDialog.classList.remove("is-loading", "is-error");
    };

    const failLoading = () => {
      if (!imagePreviewDialog) return;
      imagePreviewDialog.classList.remove("is-loading");
      imagePreviewDialog.classList.add("is-error");
    };

    if (previewImage.complete) {
      if (previewImage.naturalWidth > 0) {
        finishLoading();
      } else {
        failLoading();
      }
    } else {
      previewImage.addEventListener("load", finishLoading, { once: true });
      previewImage.addEventListener("error", failLoading, { once: true });
    }

    window.requestAnimationFrame(() => {
      imagePreviewShell.classList.add("is-visible");
    });
  };

  const getImageFallbackLabel = (img) => {
    const alt = String(img.getAttribute("alt") || "").trim();
    return alt ? alt.charAt(0).toUpperCase() : "!";
  };

  const enhanceImages = (root = document) => {
    const images = Array.from(root.querySelectorAll("img"));

    images.forEach((img) => {
      if (img.dataset.imageEnhanced === "true") return;
      img.dataset.imageEnhanced = "true";

      const shell = img.closest("[data-image-shell]") || img.parentElement;
      if (!(shell instanceof HTMLElement)) return;

      shell.classList.add("image-shell");

      let loader = shell.querySelector(".image-shell__loader");
      if (!(loader instanceof HTMLElement)) {
        loader = document.createElement("span");
        loader.className = "image-shell__loader";
        loader.setAttribute("aria-hidden", "true");
        loader.innerHTML = '<span class="image-shell__spinner"></span>';
        shell.appendChild(loader);
      }

      let fallback = shell.querySelector(".image-shell__fallback");
      if (!(fallback instanceof HTMLElement)) {
        fallback = document.createElement("span");
        fallback.className = "image-shell__fallback";
        fallback.setAttribute("aria-hidden", "true");
        fallback.textContent = getImageFallbackLabel(img);
        shell.appendChild(fallback);
      }

      const markLoaded = () => {
        shell.classList.remove("is-loading", "is-error");
        shell.classList.add("is-loaded");
      };

      const markError = () => {
        shell.classList.remove("is-loading", "is-loaded");
        shell.classList.add("is-error");
      };

      shell.classList.add("is-loading");

      if (img.complete) {
        if (img.naturalWidth > 0) {
          markLoaded();
        } else {
          markError();
        }
        return;
      }

      img.addEventListener("load", markLoaded, { once: true });
      img.addEventListener("error", markError, { once: true });
    });
  };

  const audioEntryMarkup = (entry) => `
    <div class="audio-entry" data-audio-entry data-audio-src="${escapeHtml(entry.audio_url || "")}">
      <button class="audio-entry__toggle" type="button" data-audio-toggle aria-label="Play audio">
        <span class="audio-entry__icon audio-entry__icon--play" aria-hidden="true"></span>
        <span class="audio-entry__icon audio-entry__icon--pause" aria-hidden="true"></span>
      </button>
      <div class="audio-entry__timeline" data-audio-timeline role="slider" aria-label="Audio timeline" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" tabindex="0">
        <div class="audio-entry__progress" data-audio-progress></div>
        <div class="audio-entry__playhead" data-audio-playhead></div>
      </div>
      <span class="audio-entry__time" data-audio-time>(0:00/0:00)</span>
      <audio preload="metadata" src="${escapeHtml(entry.audio_url || "")}"></audio>
    </div>
  `;

  const workEntryCardMarkup = (entry) => {
    const hasImage = Boolean(entry.image_url);
    const hasAudio = Boolean(entry.audio_url);
    const imageAlt = entry.image_alt || entry.title || "Work image";

    const mediaMarkup = hasAudio
      ? `<div class="work-entry-card__audio">${audioEntryMarkup(entry)}</div>`
      : (hasImage
        ? `
        <button
          class="work-entry-card__media work-entry-card__media--button"
          type="button"
          data-image-preview-trigger="${escapeHtml(entry.image_url)}"
          data-image-preview-alt="${escapeHtml(imageAlt)}"
        >
          <span class="work-entry-card__media-shell" data-image-shell>
            <img src="${escapeHtml(entry.image_url)}" alt="${escapeHtml(imageAlt)}" loading="lazy">
          </span>
        </button>
      `
        : "");

    return `
      <article class="work-entry-card ${entry.link_url ? "work-entry-card--linked" : ""}">
        ${mediaMarkup}
        <div class="work-entry-card__body">
          ${entry.title ? `<h3 class="work-entry-card__title">${escapeHtml(entry.title)}</h3>` : ""}
          ${entry.body ? `<p class="work-entry-card__copy">${formatMultilineHtml(entry.body)}</p>` : ""}
          ${entry.link_url ? `<a class="work-entry-card__link" href="${escapeHtml(entry.link_url)}" target="_blank" rel="noreferrer">Open link</a>` : ""}
        </div>
      </article>
    `;
  };

  const formatDevEntryPreview = (value, fallback = "untitled entry") => {
    const trimmed = String(value || "").trim();
    return trimmed ? escapeHtml(trimmed) : fallback;
  };

  const renderDevEntryList = (sectionName, entries, message = "") => {
    if (!devEntryList) return;

    if (message) {
      devEntryList.innerHTML = `<p class="dev-entry-list__status">${escapeHtml(message)}</p>`;
      bindUiSounds(devEntryList);
      return;
    }

    if (!entries.length) {
      devEntryList.innerHTML = `<p class="dev-entry-list__status">No entries found in ${escapeHtml(sectionName)}.</p>`;
      bindUiSounds(devEntryList);
      return;
    }

    devEntryList.innerHTML = entries.map((entry) => {
      const title = formatDevEntryPreview(entry.title);
      const entryId = entry?.id ? String(entry.id) : "";
      const description = String(entry.body || "").trim();
      const previewText = description
        ? `<p class="dev-entry-list__copy">${escapeHtml(description.length > 140 ? `${description.slice(0, 140)}...` : description)}</p>`
        : "";
      const meta = [
        `Sort ${escapeHtml(Number(entry.sort_order || 0))}`,
        entry.link_url ? "Has link" : "",
        entry.image_url ? "Has image" : "",
        entry.audio_url ? "Has audio" : ""
      ].filter(Boolean).join(" | ");

      return `
        <article class="dev-entry-list__item">
          <div>
            <h4 class="dev-entry-list__title">${title}</h4>
            <p class="dev-entry-list__meta">${meta}</p>
            ${previewText}
          </div>
          <div class="dev-entry-list__actions">
            <button class="dev-entry-list__edit" type="button" data-dev-edit-entry="${escapeHtml(entryId)}" data-dev-edit-section="${escapeHtml(sectionName)}">Edit</button>
            <button class="dev-entry-list__delete" type="button" data-dev-delete-entry="${escapeHtml(entryId)}" data-dev-delete-section="${escapeHtml(sectionName)}">Delete</button>
          </div>
        </article>
      `;
    }).join("");
    bindUiSounds(devEntryList);
  };

  const initializeAudioEntries = (root = document) => {
    const audioEntries = Array.from(root.querySelectorAll("[data-audio-entry]"));

    audioEntries.forEach((entryNode) => {
      if (!(entryNode instanceof HTMLElement) || entryNode.dataset.audioBound === "true") {
        return;
      }

      entryNode.dataset.audioBound = "true";

      const audio = entryNode.querySelector("audio");
      const toggle = entryNode.querySelector("[data-audio-toggle]");
      const timeline = entryNode.querySelector("[data-audio-timeline]");
      const progress = entryNode.querySelector("[data-audio-progress]");
      const playhead = entryNode.querySelector("[data-audio-playhead]");
      const time = entryNode.querySelector("[data-audio-time]");

      if (!(audio instanceof HTMLAudioElement)
        || !(toggle instanceof HTMLButtonElement)
        || !(timeline instanceof HTMLElement)
        || !(progress instanceof HTMLElement)
        || !(playhead instanceof HTMLElement)
        || !(time instanceof HTMLElement)) {
        return;
      }

      audio.volume = audioEntryVolume;

      let dragging = false;

      const stopActiveAudioEntry = () => {
        if (!activeAudioEntry || activeAudioEntry === audio) return;
        activeAudioEntry.pause();
        activeAudioEntry.currentTime = 0;
      };

      const updateVisuals = () => {
        const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
        const currentTime = Number.isFinite(audio.currentTime) ? audio.currentTime : 0;
        const ratio = duration > 0 ? Math.min(1, Math.max(0, currentTime / duration)) : 0;

        progress.style.width = `${ratio * 100}%`;
        playhead.style.left = `${ratio * 100}%`;
        timeline.setAttribute("aria-valuenow", String(Math.round(ratio * 100)));
        time.textContent = `(${formatTime(currentTime)}/${formatTime(duration)})`;
        entryNode.classList.toggle("is-playing", !audio.paused);
        toggle.setAttribute("aria-label", audio.paused ? "Play audio" : "Pause audio");
      };

      const seekToPointer = (clientX) => {
        const rect = timeline.getBoundingClientRect();
        if (!rect.width) return;

        const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
        const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
        if (!duration) return;

        audio.currentTime = duration * ratio;
        updateVisuals();
      };

      toggle.addEventListener("click", async () => {
        try {
          if (audio.paused) {
            stopActiveAudioEntry();
            await audio.play();
            activeAudioEntry = audio;
          } else {
            audio.pause();
            if (activeAudioEntry === audio) {
              activeAudioEntry = null;
            }
          }
        } catch (_error) {
          // Ignore playback permission errors.
        } finally {
          updateVisuals();
        }
      });

      timeline.addEventListener("pointerdown", (event) => {
        dragging = true;
        timeline.setPointerCapture(event.pointerId);
        seekToPointer(event.clientX);
      });

      timeline.addEventListener("pointermove", (event) => {
        if (!dragging) return;
        seekToPointer(event.clientX);
      });

      timeline.addEventListener("pointerup", (event) => {
        if (!dragging) return;
        dragging = false;
        timeline.releasePointerCapture(event.pointerId);
        seekToPointer(event.clientX);
      });

      timeline.addEventListener("pointercancel", (event) => {
        dragging = false;
        if (timeline.hasPointerCapture(event.pointerId)) {
          timeline.releasePointerCapture(event.pointerId);
        }
      });

      timeline.addEventListener("keydown", (event) => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
        event.preventDefault();

        const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
        if (!duration) return;

        if (event.key === "Home") {
          audio.currentTime = 0;
        } else if (event.key === "End") {
          audio.currentTime = duration;
        } else {
          const direction = event.key === "ArrowRight" ? 1 : -1;
          audio.currentTime = Math.min(duration, Math.max(0, audio.currentTime + direction * 5));
        }

        updateVisuals();
      });

      audio.addEventListener("loadedmetadata", updateVisuals);
      audio.addEventListener("timeupdate", () => {
        if (!dragging) {
          updateVisuals();
        }
      });
      audio.addEventListener("play", () => {
        activeAudioEntry = audio;
        updateVisuals();
      });
      audio.addEventListener("pause", () => {
        if (activeAudioEntry === audio) {
          activeAudioEntry = null;
        }
        updateVisuals();
      });
      audio.addEventListener("ended", () => {
        if (activeAudioEntry === audio) {
          activeAudioEntry = null;
        }
        updateVisuals();
      });
      audio.addEventListener("error", () => {
        if (activeAudioEntry === audio) {
          activeAudioEntry = null;
        }
        time.textContent = "(0:00/0:00)";
        entryNode.classList.add("is-error");
      });

      updateVisuals();
    });
  };

  const renderWorkSectionEntries = (sectionName, entries, fallbackMessage = "this section is empty") => {
    const board = workContentBoards.get(sectionName);

    if (!board) return;

    if (!entries.length) {
      board.innerHTML = `<p class="work-content-status work-empty-state">${escapeHtml(fallbackMessage)}</p>`;
      updateTopbarAudioVisibility();
      bindUiSounds(board);
      return;
    }

    board.innerHTML = `
      <div class="work-entry-grid">
        ${entries.map((entry) => workEntryCardMarkup(entry)).join("")}
      </div>
    `;
    enhanceImages(board);
    initializeAudioEntries(board);
    applyAudioVolumeToEntries(board);
    updateTopbarAudioVisibility();
    bindUiSounds(board);
  };

  const apiRequest = async (url, options = {}) => {
    const headers = new Headers(options.headers || {});

    if (devSessionToken) {
      headers.set("authorization", `Bearer ${devSessionToken}`);
    }

    const response = await fetch(url, {
      credentials: "include",
      cache: "no-store",
      ...options
      ,
      headers
    });

    let payload = null;

    try {
      payload = await response.json();
    } catch (_error) {
      payload = null;
    }

    if (!response.ok) {
      const errorMessage = payload?.error || payload?.detail || `request_failed:${response.status}`;
      throw new Error(errorMessage);
    }

    return payload;
  };

  const uploadWorkAsset = async (file, sectionName) => {
    const uploadData = new FormData();
    uploadData.append("section", sectionName);
    uploadData.append("file", file);

    return apiRequest(workAssetUploadApiUrl, {
      method: "POST",
      body: uploadData
    });
  };

  const renderVideos = (videos) => {
    if (!videosBoard || !videosStatus) return;

    if (!videos.length) {
      videosStatus.textContent = "No videos found.";
      videosStatus.hidden = false;
      return;
    }

    videosStatus.hidden = true;
    videosBoard.innerHTML = videos.map((video) => `
      <a class="video-card" href="${escapeHtml(video.url)}" target="_blank" rel="noreferrer">
        <span class="video-card__thumb" data-image-shell>
          <img src="${escapeHtml(video.thumbnail)}" alt="${escapeHtml(video.title)} thumbnail" loading="lazy">
        </span>
        <span class="video-card__title">${escapeHtml(video.title)}</span>
        <span class="video-card__meta">${escapeHtml(Number(video.viewCount || 0).toLocaleString())} views</span>
      </a>
    `).join("");
    enhanceImages(videosBoard);
    bindUiSounds(videosBoard);
  };

  async function loadVideos() {
    if (!videosBoard || !videosStatus || videosLoaded || videosLoading) return;

    videosLoading = true;
    videosStatus.hidden = false;
    videosStatus.textContent = "Loading videos...";

    try {
      const response = await fetch(videosApiUrl, { cache: "no-store" });

      if (!response.ok) {
        throw new Error(`videos_request_failed:${response.status}`);
      }

      const payload = await response.json();
      const videos = Array.isArray(payload?.videos) ? payload.videos : [];

      videosLoaded = true;
      renderVideos(videos);
    } catch (_error) {
      videosStatus.textContent = "Unable to load videos right now.";
      videosStatus.hidden = false;
    } finally {
      videosLoading = false;
    }
  }

  async function loadWorkSectionContent(sectionName, force = false) {
    if (!contentSections.has(sectionName) || (!force && loadedContentSections.has(sectionName)) || loadingContentSections.has(sectionName)) return;

    const board = workContentBoards.get(sectionName);

    if (!board) return;

    loadingContentSections.add(sectionName);
    board.innerHTML = `<p class="work-content-status work-empty-state">loading...</p>`;

    try {
      const payload = await apiRequest(`${workContentApiUrl}?section=${encodeURIComponent(sectionName)}`);
      const entries = Array.isArray(payload?.entries) ? payload.entries : [];

      workEntriesBySection.set(sectionName, entries);
      loadedContentSections.add(sectionName);
      renderWorkSectionEntries(sectionName, entries);
    } catch (_error) {
      renderWorkSectionEntries(sectionName, [], "unable to load this section right now");
    } finally {
      loadingContentSections.delete(sectionName);
    }
  }

  async function loadDevEntries(sectionName, force = false) {
    if (!devEntryList || !contentSections.has(sectionName)) return;
    if (!force && devEntriesBySection.has(sectionName) && devEntriesLoadingSection !== sectionName) {
      renderDevEntryList(sectionName, devEntriesBySection.get(sectionName) || []);
      return;
    }

    devEntriesLoadingSection = sectionName;
    renderDevEntryList(sectionName, [], "loading entries...");

    try {
      const payload = await apiRequest(`${workContentApiUrl}?section=${encodeURIComponent(sectionName)}`);
      const entries = Array.isArray(payload?.entries) ? payload.entries : [];

      if (devEntriesLoadingSection !== sectionName) return;

      devEntriesBySection.set(sectionName, entries);
      renderDevEntryList(sectionName, entries);
    } catch (_error) {
      if (devEntriesLoadingSection !== sectionName) return;
      renderDevEntryList(sectionName, [], "unable to load entries right now");
    }
  }

  async function refreshDevSession() {
    try {
      const payload = await apiRequest(devSessionApiUrl);
      lastSessionDiagnostic = payload;
      isDevAuthenticated = Boolean(payload?.authenticated);

      if (!isDevAuthenticated) {
        devSessionToken = "";
        window.localStorage.removeItem(devSessionStorageKey);

        if (hasAttemptedDevLogin) {
          setDevStatus(formatSessionDiagnostic(payload), "error");
        }
      }
    } catch (_error) {
      isDevAuthenticated = false;
      devSessionToken = "";
      window.localStorage.removeItem(devSessionStorageKey);
      lastSessionDiagnostic = null;
    }

    syncDevUi();

    if (isDevAuthenticated && devEntryListSection instanceof HTMLSelectElement) {
      loadDevEntries(devEntryListSection.value || "music", true);
    }
  }

  if (routeApp) {
    const routePanels = Array.from(routeApp.querySelectorAll("[data-route-panel]"));
    const routeTabs = Array.from(routeApp.querySelectorAll("[data-tab-for]"));
    const validRoutes = new Set(routePanels.map((panel) => panel.dataset.routePanel));

    const showPanel = (panel, immediate = false) => {
      panel.hidden = false;
      panel.setAttribute("aria-hidden", "false");
      panel.classList.add("is-active");

      if (immediate) {
        panel.classList.add("is-current");
        return;
      }

      panel.classList.remove("is-leaving");
      panel.classList.add("is-entering");
      window.requestAnimationFrame(() => {
        panel.classList.add("is-current");
        panel.classList.remove("is-entering");
      });
    };

    const hidePanel = (panel) => {
      panel.hidden = true;
      panel.setAttribute("aria-hidden", "true");
      panel.classList.remove("is-active", "is-current", "is-entering", "is-leaving");
    };

    const transitionToPanel = (nextPanel, nextRoute) => {
      const currentPanel = routePanels.find((panel) => panel.dataset.routePanel === activeRoute);

      routeTabs.forEach((tab) => {
        tab.classList.toggle("is-active", tab.dataset.tabFor === nextRoute);
      });

      if (!currentPanel || currentPanel === nextPanel) {
        routePanels.forEach((panel) => {
          if (panel === nextPanel) {
            showPanel(panel, true);
          } else {
            hidePanel(panel);
          }
        });
        activeRoute = nextRoute;
        updateTopbarAudioVisibility();
        return;
      }

      showPanel(nextPanel);
      currentPanel.classList.add("is-leaving");
      currentPanel.classList.remove("is-current");

      window.setTimeout(() => {
        hidePanel(currentPanel);
      }, 220);

      activeRoute = nextRoute;
      updateTopbarAudioVisibility();
    };

    const applyRoute = () => {
      const requestedRoute = window.location.hash.replace("#", "").trim().toLowerCase() || "home";
      const nextRoute = validRoutes.has(requestedRoute) ? requestedRoute : "home";
      const nextPanel = routePanels.find((panel) => panel.dataset.routePanel === nextRoute);
      if (!nextPanel) return;
      transitionToPanel(nextPanel, nextRoute);
    };

    window.addEventListener("hashchange", applyRoute);
    applyRoute();
  }

  const setActiveWorkSection = (sectionName) => {
    activeWorkSection = sectionName;

    workSectionTriggers.forEach((trigger) => {
      const isActive = trigger.dataset.workSectionTrigger === sectionName;
      trigger.classList.toggle("is-active", isActive);
      trigger.setAttribute("aria-pressed", String(isActive));
    });

    workSectionPanels.forEach((panel) => {
      const isActive = panel.dataset.workSectionPanel === sectionName;
      panel.hidden = !isActive;
      panel.setAttribute("aria-hidden", String(!isActive));
    });

    updateTopbarAudioVisibility();

    if (sectionName === "videos") {
      loadVideos();
      return;
    }

    if (contentSections.has(sectionName)) {
      loadWorkSectionContent(sectionName);
    }
  };

  if (workSectionTriggers.length) {
    workSectionTriggers.forEach((trigger) => {
      trigger.addEventListener("click", () => {
        setActiveWorkSection(trigger.dataset.workSectionTrigger || "videos");
      });
    });

    setActiveWorkSection(activeWorkSection);
  }

  if (devToggle) {
    devToggle.addEventListener("click", async () => {
      openDevModal();
      await refreshDevSession();
    });
  }

  devCloseButtons.forEach((button) => {
    button.addEventListener("click", closeDevModal);
  });

  if (devCancelEdit) {
    devCancelEdit.addEventListener("click", () => {
      const currentSection = devEntryListSection instanceof HTMLSelectElement
        ? devEntryListSection.value || "music"
        : "music";
      clearDevEditMode(currentSection);
      setDevStatus("edit cancelled", "info");
    });
  }

  if (devEntryListSection instanceof HTMLSelectElement) {
    devEntryListSection.addEventListener("change", () => {
      if (!isDevAuthenticated) return;
      loadDevEntries(devEntryListSection.value || "music", true);
    });
  }

  if (topbarAudioSlider instanceof HTMLInputElement) {
    topbarAudioSlider.addEventListener("input", () => {
      const nextValue = Math.min(100, Math.max(0, Number(topbarAudioSlider.value || 100)));
      audioEntryVolume = nextValue / 100;
      syncTopbarAudioUi();
      applyAudioVolumeToEntries(document);
    });
  }

  if (imagePreviewShell) {
    imagePreviewShell.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;

      if (target.hasAttribute("data-image-preview-close") || target === imagePreviewShell) {
        closeImagePreview();
      }
    });
  }

  if (imagePreviewDialog) {
    imagePreviewDialog.addEventListener("click", (event) => {
      if (event.target === imagePreviewDialog) {
        closeImagePreview();
      }
    });
  }

  window.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    const previewTrigger = target.closest("[data-image-preview-trigger]");
    if (!(previewTrigger instanceof HTMLElement)) return;

    const sourceImage = previewTrigger.querySelector("img");
    const src = String(
      (sourceImage instanceof HTMLImageElement ? (sourceImage.currentSrc || sourceImage.src) : "")
      || previewTrigger.dataset.imagePreviewTrigger
      || ""
    ).trim();
    if (!src) return;

    openImagePreview(
      sourceImage instanceof HTMLImageElement ? sourceImage : null,
      src,
      previewTrigger.dataset.imagePreviewAlt || "Preview image"
    );
  });

  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      if (imagePreviewShell && !imagePreviewShell.hidden) {
        closeImagePreview();
        return;
      }

      if (devModal && !devModal.hidden) {
        closeDevModal();
      }
    }
  });

  if (devLoginForm) {
    devLoginForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      hasAttemptedDevLogin = true;

      const formData = new FormData(devLoginForm);
      const password = String(formData.get("password") || "");

      setDevStatus("unlocking...", "info");

      try {
        const payload = await apiRequest(devLoginApiUrl, {
          method: "POST",
          headers: {
            "content-type": "application/json"
          },
          body: JSON.stringify({ password })
        });

        devSessionToken = String(payload?.token || "");

        if (devSessionToken) {
          window.localStorage.setItem(devSessionStorageKey, devSessionToken);
        }

        await refreshDevSession();

        if (!isDevAuthenticated) {
          setDevStatus(`password accepted but session failed | ${formatSessionDiagnostic(lastSessionDiagnostic)}`, "error");
          return;
        }

        devLoginForm.reset();
        clearDevEditMode(devEntryListSection instanceof HTMLSelectElement ? devEntryListSection.value || "music" : "music");
        setDevStatus("developer controls unlocked", "success");
      } catch (error) {
        isDevAuthenticated = false;
        devSessionToken = "";
        window.localStorage.removeItem(devSessionStorageKey);
        syncDevUi();
        setDevStatus(error instanceof Error ? error.message.replace(/_/g, " ") : "incorrect password", "error");
      }
    });
  }

  if (devEntryForm) {
    devEntryForm.addEventListener("submit", async (event) => {
      event.preventDefault();

      const formData = new FormData(devEntryForm);
      const entryId = String(formData.get("entry_id") || "").trim();
      const section = String(formData.get("section") || "").trim().toLowerCase();
      const title = String(formData.get("title") || "").trim();
      const body = String(formData.get("body") || "").trim();
      const linkUrl = String(formData.get("link_url") || "").trim();
      const attachmentFile = formData.get("attachment_file");
      const sortOrder = Number(formData.get("sort_order") || 0);
      const originalSection = String(devEntryForm.dataset.originalSection || "").trim().toLowerCase();

      setDevStatus(entryId ? "saving changes..." : "saving entry...", "info");

      try {
        let mediaPayload = {
          image_url: devEntryForm.dataset.currentImageUrl || "",
          image_alt: devEntryForm.dataset.currentImageAlt || "",
          audio_url: devEntryForm.dataset.currentAudioUrl || "",
          audio_type: devEntryForm.dataset.currentAudioType || "",
          audio_size_bytes: Number(devEntryForm.dataset.currentAudioSizeBytes || 0) || null
        };

        if (attachmentFile instanceof File && attachmentFile.size > 0) {
          const attachment = validateAttachmentFile(attachmentFile);
          setDevStatus("uploading attachment...", "info");
          const uploadedAsset = await uploadWorkAsset(attachmentFile, section);

          if (attachment.kind === "image" || uploadedAsset.kind === "image") {
            mediaPayload = {
              image_url: String(uploadedAsset.public_url || ""),
              image_alt: title || mediaPayload.image_alt || "Work image",
              audio_url: "",
              audio_type: "",
              audio_size_bytes: null
            };
          } else {
            mediaPayload = {
              image_url: "",
              image_alt: "",
              audio_url: String(uploadedAsset.public_url || ""),
              audio_type: String(uploadedAsset.content_type || attachment.audioType || ""),
              audio_size_bytes: Number(uploadedAsset.size_bytes || attachmentFile.size || 0) || null
            };
          }
        }

        const payload = {
          section,
          title,
          body,
          link_url: linkUrl,
          image_url: mediaPayload.image_url || "",
          image_alt: mediaPayload.image_alt || "",
          audio_url: mediaPayload.audio_url || "",
          audio_type: mediaPayload.audio_type || "",
          audio_size_bytes: mediaPayload.audio_size_bytes || 0,
          sort_order: sortOrder
        };

        if (entryId) {
          await apiRequest(`${workContentApiUrl}?id=${encodeURIComponent(entryId)}`, {
            method: "PUT",
            headers: {
              "content-type": "application/json"
            },
            body: JSON.stringify({ id: entryId, ...payload })
          });
        } else {
          await apiRequest(workContentApiUrl, {
            method: "POST",
            headers: {
              "content-type": "application/json"
            },
            body: JSON.stringify(payload)
          });
        }

        const sectionsToRefresh = new Set([section]);
        if (entryId && originalSection && originalSection !== section) {
          sectionsToRefresh.add(originalSection);
        }

        sectionsToRefresh.forEach((sectionName) => {
          loadedContentSections.delete(sectionName);
          workEntriesBySection.delete(sectionName);
          devEntriesBySection.delete(sectionName);

          if (contentSections.has(sectionName)) {
            renderWorkSectionEntries(sectionName, [], "loading...");
          }
        });

        if (activeWorkSection !== "videos" && sectionsToRefresh.has(activeWorkSection)) {
          loadWorkSectionContent(activeWorkSection, true);
        }

        const listSection = devEntryListSection instanceof HTMLSelectElement
          ? devEntryListSection.value || "music"
          : section;

        if (sectionsToRefresh.has(listSection) || listSection === section) {
          loadDevEntries(listSection, true);
        }

        clearDevEditMode(section);
        if (devEntryListSection instanceof HTMLSelectElement) {
          devEntryListSection.value = section;
        }

        setDevStatus(entryId ? "entry updated" : "entry added", "success");
      } catch (error) {
        const message = error instanceof Error ? error.message : "unable to save entry";
        setDevStatus(message.replace(/_/g, " "), "error");
      }
    });
  }

  if (devEntryList) {
    devEntryList.addEventListener("click", async (event) => {
      const target = event.target;

      if (!(target instanceof HTMLElement)) return;
      if (!isDevAuthenticated) return;

      const editButton = target.closest("[data-dev-edit-entry]");

      if (editButton instanceof HTMLButtonElement) {
        const entryId = String(editButton.dataset.devEditEntry || "").trim();
        const section = String(editButton.dataset.devEditSection || "").trim().toLowerCase();
        const sectionEntries = devEntriesBySection.get(section) || [];
        const entry = sectionEntries.find((item) => String(item.id || "") === entryId);

        if (!entry) {
          setDevStatus("unable to load entry for editing", "error");
          return;
        }

        enterDevEditMode(entry);
        setDevStatus("edit mode ready", "info");
        return;
      }

      const deleteButton = target.closest("[data-dev-delete-entry]");

      if (!(deleteButton instanceof HTMLButtonElement)) return;

      const entryId = String(deleteButton.dataset.devDeleteEntry || "").trim();
      const section = String(
        deleteButton.dataset.devDeleteSection
          || (devEntryListSection instanceof HTMLSelectElement ? devEntryListSection.value : "")
          || ""
      ).trim().toLowerCase();

      if (!entryId || !contentSections.has(section)) {
        setDevStatus(`unable to delete entry (id: ${entryId || "missing"}, section: ${section || "missing"})`, "error");
        return;
      }

      const confirmed = window.confirm("Delete this work entry?");

      if (!confirmed) return;

      deleteButton.disabled = true;
      setDevStatus("deleting entry...", "info");

      try {
        await apiRequest(`${workContentApiUrl}?id=${encodeURIComponent(entryId)}&section=${encodeURIComponent(section)}`, {
          method: "DELETE"
        });

        loadedContentSections.delete(section);
        workEntriesBySection.delete(section);
        devEntriesBySection.delete(section);
        if (activeWorkSection === section) {
          renderWorkSectionEntries(section, [], "loading...");
          loadWorkSectionContent(section, true);
        }

        await loadDevEntries(section, true);
        setDevStatus("entry deleted", "success");
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error || "unable to delete entry");
        setDevStatus(message.replace(/_/g, " "), "error");
      } finally {
        deleteButton.disabled = false;
      }
    });
  }

  if (contactForm) {
    contactForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      event.stopPropagation();

      if (!(contactForm instanceof HTMLFormElement)) return;

      if (contactStatus) {
        contactStatus.hidden = false;
        contactStatus.textContent = "Sending message...";
        contactStatus.classList.remove("is-success", "is-error");
      }

      const submitButton = contactForm.querySelector("button[type=\"submit\"]");
      if (submitButton instanceof HTMLButtonElement) {
        submitButton.disabled = true;
      }

      try {
        const formData = new FormData(contactForm);
        const response = await fetch(contactForm.action, {
          method: "POST",
          headers: {
            Accept: "application/json"
          },
          body: formData
        });

        if (!response.ok) {
          throw new Error(`form_submit_failed:${response.status}`);
        }

        contactForm.reset();
        if (contactStatus) {
          contactStatus.textContent = "Message sent.";
          contactStatus.classList.add("is-success");
        }
      } catch (error) {
        console.error("contact form submit failed", error);
        if (contactStatus) {
          contactStatus.textContent = "Something went wrong. Please try again.";
          contactStatus.classList.add("is-error");
        }
      } finally {
        if (submitButton instanceof HTMLButtonElement) {
          submitButton.disabled = false;
        }
      }
    });
  }

  refreshDevSession();
  clearDevEditMode(devEntryListSection instanceof HTMLSelectElement ? devEntryListSection.value || "music" : "music");

  const hoverAudio = new Audio("./hover-ui.mp3");
  const pressAudio = new Audio("./button-down.mp3");
  const releaseAudio = new Audio("./button-up.mp3");
  let audioUnlocked = false;
  hoverAudio.preload = "auto";
  hoverAudio.volume = 1;
  pressAudio.preload = "auto";
  pressAudio.volume = 1;
  releaseAudio.preload = "auto";
  releaseAudio.volume = 1;

  const unlockAudio = () => {
    if (audioUnlocked) return;
    audioUnlocked = true;

    [hoverAudio, pressAudio, releaseAudio].forEach((audio) => {
      try {
        const previousVolume = audio.volume;
        audio.volume = 0;
        const playback = audio.play();

        if (playback && typeof playback.then === "function") {
          playback.then(() => {
            audio.pause();
            audio.currentTime = 0;
            audio.volume = previousVolume;
          }).catch(() => {
            audio.volume = previousVolume;
            audioUnlocked = false;
          });
        } else {
          audio.pause();
          audio.currentTime = 0;
          audio.volume = previousVolume;
        }
      } catch (_error) {
        audioUnlocked = false;
      }
    });
  };

  const playUiSound = (audio) => {
    if (!audioUnlocked) return;

    try {
      audio.pause();
      audio.currentTime = 0;
      const playback = audio.play();

      if (playback && typeof playback.catch === "function") {
        playback.catch(() => {});
      }
    } catch (_error) {
      // Ignore autoplay/interaction failures.
    }
  };

  function bindUiSounds(root = document) {
    const hoverTargets = Array.from(root.querySelectorAll(".app-tab, .action-button, .social-card, .back-mark, .work-category-card, .dev-control-button, .dev-submit-button, .dev-entry-list__edit, .dev-entry-list__delete, .audio-entry__toggle"));

    hoverTargets.forEach((target) => {
      if (!(target instanceof HTMLElement) || target.dataset.uiSoundBound === "true") return;
      target.dataset.uiSoundBound = "true";

      let armed = true;

      target.addEventListener("pointerenter", () => {
        if (!armed) return;
        armed = false;
        playUiSound(hoverAudio);
      });

      target.addEventListener("pointerleave", () => {
        armed = true;
      });

      target.addEventListener("focus", () => {
        playUiSound(hoverAudio);
      });

      target.addEventListener("pointerdown", () => {
        playUiSound(pressAudio);
      });

      target.addEventListener("pointerup", () => {
        playUiSound(releaseAudio);
      });

      target.addEventListener("pointercancel", () => {
        playUiSound(releaseAudio);
      });

      target.addEventListener("keyup", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          playUiSound(releaseAudio);
        }
      });
    });
  }

  window.addEventListener("pointerdown", unlockAudio, { once: true, passive: true });
  window.addEventListener("keydown", unlockAudio, { once: true });
  window.addEventListener("touchstart", unlockAudio, { once: true, passive: true });

  bindUiSounds(document);
  enhanceImages(document);
  syncTopbarAudioUi();
  applyAudioVolumeToEntries(document);
  updateTopbarAudioVisibility();

  const sparkLayer = document.querySelector("[data-click-spark-layer]");
  const shapeGridCanvas = document.querySelector("[data-shape-grid]");
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const initializeShapeGrid = (canvas, options = {}) => {
    if (!(canvas instanceof HTMLCanvasElement)) return;

    const context = canvas.getContext("2d");
    if (!context) return;

    const direction = String(options.direction || "diagonal");
    const speed = Math.max(Number(options.speed || 0.6), 0.1);
    const borderColor = String(options.borderColor || "#271E37");
    const hoverFillColor = String(options.hoverFillColor || "#222222");
    const squareSize = Math.max(Number(options.squareSize || 40), 12);
    const shape = String(options.shape || "square");
    const hoverTrailAmount = Math.max(Number(options.hoverTrailAmount || 0), 0);
    const interactive = options.interactive !== false;
    const isHex = shape === "hexagon";
    const isTriangle = shape === "triangle";
    const isCircle = shape === "circle";
    const hexHorizontal = squareSize * 1.5;
    const hexVertical = squareSize * Math.sqrt(3);
    const gridOffset = { x: 0, y: 0 };
    const hoveredCell = { current: null };
    const trailCells = [];
    const cellOpacities = new Map();
    let rafId = 0;
    let canvasWidth = 0;
    let canvasHeight = 0;
    let pixelRatio = 1;
    let pointerX = null;
    let pointerY = null;

    const resizeCanvas = () => {
      const bounds = canvas.getBoundingClientRect();
      pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      canvasWidth = Math.max(1, Math.round(bounds.width));
      canvasHeight = Math.max(1, Math.round(bounds.height));
      canvas.width = Math.round(canvasWidth * pixelRatio);
      canvas.height = Math.round(canvasHeight * pixelRatio);
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    };

    const drawHex = (centerX, centerY, size) => {
      context.beginPath();
      for (let index = 0; index < 6; index += 1) {
        const angle = (Math.PI / 3) * index;
        const vertexX = centerX + size * Math.cos(angle);
        const vertexY = centerY + size * Math.sin(angle);
        if (index === 0) {
          context.moveTo(vertexX, vertexY);
        } else {
          context.lineTo(vertexX, vertexY);
        }
      }
      context.closePath();
    };

    const drawCircle = (centerX, centerY, size) => {
      context.beginPath();
      context.arc(centerX, centerY, size / 2, 0, Math.PI * 2);
      context.closePath();
    };

    const drawTriangle = (centerX, centerY, size, flip) => {
      context.beginPath();
      if (flip) {
        context.moveTo(centerX, centerY + size / 2);
        context.lineTo(centerX + size / 2, centerY - size / 2);
        context.lineTo(centerX - size / 2, centerY - size / 2);
      } else {
        context.moveTo(centerX, centerY - size / 2);
        context.lineTo(centerX + size / 2, centerY + size / 2);
        context.lineTo(centerX - size / 2, centerY + size / 2);
      }
      context.closePath();
    };

    const pushTrailCell = (cell) => {
      if (!cell || hoverTrailAmount <= 0) return;
      trailCells.unshift({ x: cell.x, y: cell.y });
      if (trailCells.length > hoverTrailAmount) {
        trailCells.length = hoverTrailAmount;
      }
    };

    const updateHoveredCell = (nextX, nextY) => {
      if (hoveredCell.current && hoveredCell.current.x === nextX && hoveredCell.current.y === nextY) {
        return;
      }

      pushTrailCell(hoveredCell.current);
      hoveredCell.current = { x: nextX, y: nextY };
    };

    const updatePointerCell = () => {
      if (!interactive || pointerX === null || pointerY === null) {
        return;
      }

      if (isHex) {
        const columnShift = Math.floor(gridOffset.x / hexHorizontal);
        const offsetX = ((gridOffset.x % hexHorizontal) + hexHorizontal) % hexHorizontal;
        const offsetY = ((gridOffset.y % hexVertical) + hexVertical) % hexVertical;
        const adjustedX = pointerX - offsetX;
        const adjustedY = pointerY - offsetY;
        const column = Math.round(adjustedX / hexHorizontal);
        const rowOffset = (column + columnShift) % 2 !== 0 ? hexVertical / 2 : 0;
        const row = Math.round((adjustedY - rowOffset) / hexVertical);
        updateHoveredCell(column, row);
        return;
      }

      if (isTriangle) {
        const halfWidth = squareSize / 2;
        const offsetX = ((gridOffset.x % halfWidth) + halfWidth) % halfWidth;
        const offsetY = ((gridOffset.y % squareSize) + squareSize) % squareSize;
        const adjustedX = pointerX - offsetX;
        const adjustedY = pointerY - offsetY;
        const column = Math.round(adjustedX / halfWidth);
        const row = Math.floor(adjustedY / squareSize);
        updateHoveredCell(column, row);
        return;
      }

      const offsetX = ((gridOffset.x % squareSize) + squareSize) % squareSize;
      const offsetY = ((gridOffset.y % squareSize) + squareSize) % squareSize;
      const adjustedX = pointerX - offsetX;
      const adjustedY = pointerY - offsetY;
      const divider = squareSize;
      const column = isCircle ? Math.round(adjustedX / divider) : Math.floor(adjustedX / divider);
      const row = isCircle ? Math.round(adjustedY / divider) : Math.floor(adjustedY / divider);
      updateHoveredCell(column, row);
    };

    const updateCellOpacities = () => {
      const targets = new Map();

      if (hoveredCell.current) {
        targets.set(`${hoveredCell.current.x},${hoveredCell.current.y}`, 1);
      }

      if (hoverTrailAmount > 0) {
        for (let index = 0; index < trailCells.length; index += 1) {
          const trail = trailCells[index];
          const key = `${trail.x},${trail.y}`;
          if (!targets.has(key)) {
            targets.set(key, (trailCells.length - index) / (trailCells.length + 1));
          }
        }
      }

      targets.forEach((_target, key) => {
        if (!cellOpacities.has(key)) {
          cellOpacities.set(key, 0);
        }
      });

      Array.from(cellOpacities.entries()).forEach(([key, opacity]) => {
        const targetOpacity = targets.get(key) || 0;
        const nextOpacity = opacity + (targetOpacity - opacity) * 0.15;
        if (nextOpacity < 0.005) {
          cellOpacities.delete(key);
        } else {
          cellOpacities.set(key, nextOpacity);
        }
      });
    };

    const drawGrid = () => {
      context.clearRect(0, 0, canvasWidth, canvasHeight);
      context.lineWidth = 1;

      if (isHex) {
        const columnShift = Math.floor(gridOffset.x / hexHorizontal);
        const offsetX = ((gridOffset.x % hexHorizontal) + hexHorizontal) % hexHorizontal;
        const offsetY = ((gridOffset.y % hexVertical) + hexVertical) % hexVertical;
        const columns = Math.ceil(canvasWidth / hexHorizontal) + 3;
        const rows = Math.ceil(canvasHeight / hexVertical) + 3;

        for (let column = -2; column < columns; column += 1) {
          for (let row = -2; row < rows; row += 1) {
            const centerX = column * hexHorizontal + offsetX;
            const centerY = row * hexVertical + ((column + columnShift) % 2 !== 0 ? hexVertical / 2 : 0) + offsetY;
            const alpha = cellOpacities.get(`${column},${row}`);

            if (alpha) {
              context.globalAlpha = alpha;
              drawHex(centerX, centerY, squareSize);
              context.fillStyle = hoverFillColor;
              context.fill();
              context.globalAlpha = 1;
            }

            drawHex(centerX, centerY, squareSize);
            context.strokeStyle = borderColor;
            context.stroke();
          }
        }
      } else if (isTriangle) {
        const halfWidth = squareSize / 2;
        const columnShift = Math.floor(gridOffset.x / halfWidth);
        const rowShift = Math.floor(gridOffset.y / squareSize);
        const offsetX = ((gridOffset.x % halfWidth) + halfWidth) % halfWidth;
        const offsetY = ((gridOffset.y % squareSize) + squareSize) % squareSize;
        const columns = Math.ceil(canvasWidth / halfWidth) + 4;
        const rows = Math.ceil(canvasHeight / squareSize) + 4;

        for (let column = -2; column < columns; column += 1) {
          for (let row = -2; row < rows; row += 1) {
            const centerX = column * halfWidth + offsetX;
            const centerY = row * squareSize + squareSize / 2 + offsetY;
            const flip = ((column + columnShift + row + rowShift) % 2 + 2) % 2 !== 0;
            const alpha = cellOpacities.get(`${column},${row}`);

            if (alpha) {
              context.globalAlpha = alpha;
              drawTriangle(centerX, centerY, squareSize, flip);
              context.fillStyle = hoverFillColor;
              context.fill();
              context.globalAlpha = 1;
            }

            drawTriangle(centerX, centerY, squareSize, flip);
            context.strokeStyle = borderColor;
            context.stroke();
          }
        }
      } else if (isCircle) {
        const offsetX = ((gridOffset.x % squareSize) + squareSize) % squareSize;
        const offsetY = ((gridOffset.y % squareSize) + squareSize) % squareSize;
        const columns = Math.ceil(canvasWidth / squareSize) + 3;
        const rows = Math.ceil(canvasHeight / squareSize) + 3;

        for (let column = -2; column < columns; column += 1) {
          for (let row = -2; row < rows; row += 1) {
            const centerX = column * squareSize + squareSize / 2 + offsetX;
            const centerY = row * squareSize + squareSize / 2 + offsetY;
            const alpha = cellOpacities.get(`${column},${row}`);

            if (alpha) {
              context.globalAlpha = alpha;
              drawCircle(centerX, centerY, squareSize);
              context.fillStyle = hoverFillColor;
              context.fill();
              context.globalAlpha = 1;
            }

            drawCircle(centerX, centerY, squareSize);
            context.strokeStyle = borderColor;
            context.stroke();
          }
        }
      } else {
        const offsetX = ((gridOffset.x % squareSize) + squareSize) % squareSize;
        const offsetY = ((gridOffset.y % squareSize) + squareSize) % squareSize;
        const columns = Math.ceil(canvasWidth / squareSize) + 3;
        const rows = Math.ceil(canvasHeight / squareSize) + 3;

        for (let column = -2; column < columns; column += 1) {
          for (let row = -2; row < rows; row += 1) {
            const startX = column * squareSize + offsetX;
            const startY = row * squareSize + offsetY;
            const alpha = cellOpacities.get(`${column},${row}`);

            if (alpha) {
              context.globalAlpha = alpha;
              context.fillStyle = hoverFillColor;
              context.fillRect(startX, startY, squareSize, squareSize);
              context.globalAlpha = 1;
            }

            context.strokeStyle = borderColor;
            context.strokeRect(startX, startY, squareSize, squareSize);
          }
        }
      }
    };

    const animate = () => {
      const wrapX = isHex ? hexHorizontal * 2 : squareSize;
      const wrapY = isHex ? hexVertical : isTriangle ? squareSize * 2 : squareSize;

      switch (direction) {
        case "right":
          gridOffset.x = (gridOffset.x - speed + wrapX) % wrapX;
          break;
        case "left":
          gridOffset.x = (gridOffset.x + speed + wrapX) % wrapX;
          break;
        case "up":
          gridOffset.y = (gridOffset.y + speed + wrapY) % wrapY;
          break;
        case "down":
          gridOffset.y = (gridOffset.y - speed + wrapY) % wrapY;
          break;
        case "diagonal":
          gridOffset.x = (gridOffset.x - speed + wrapX) % wrapX;
          gridOffset.y = (gridOffset.y - speed + wrapY) % wrapY;
          break;
        default:
          break;
      }

      updatePointerCell();
      updateCellOpacities();
      drawGrid();
      rafId = window.requestAnimationFrame(animate);
    };

    const handlePointerMove = (event) => {
      pointerX = event.clientX;
      pointerY = event.clientY;
    };

    const handlePointerLeave = () => {
      pushTrailCell(hoveredCell.current);
      hoveredCell.current = null;
      pointerX = null;
      pointerY = null;
    };

    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);
    if (interactive) {
      window.addEventListener("pointermove", handlePointerMove, { passive: true });
      window.addEventListener("pointerleave", handlePointerLeave);
    }
    rafId = window.requestAnimationFrame(animate);
  };

  if (sparkLayer && !prefersReducedMotion) {
    const sparkCount = 10;
    const sparkRadius = 30;

    const spawnClickSparks = (clientX, clientY) => {
      for (let index = 0; index < sparkCount; index += 1) {
        const spark = document.createElement("span");
        const angle = `${(360 / sparkCount) * index}deg`;
        const jitter = (Math.random() - 0.5) * 10;
        const radius = `${sparkRadius + jitter}px`;

        spark.className = "click-spark";
        spark.style.left = `${clientX}px`;
        spark.style.top = `${clientY}px`;
        spark.style.setProperty("--spark-angle", angle);
        spark.style.setProperty("--spark-radius", radius);
        sparkLayer.appendChild(spark);

        window.setTimeout(() => {
          spark.remove();
        }, 560);
      }
    };

    window.addEventListener("pointerdown", (event) => {
      spawnClickSparks(event.clientX, event.clientY);
    }, { passive: true });
  }

  if (shapeGridCanvas && !prefersReducedMotion) {
    initializeShapeGrid(shapeGridCanvas, {
      speed: 0.6,
      squareSize: 40,
      direction: "diagonal",
      borderColor: "#ffffff",
      hoverFillColor: "#222222",
      shape: "square",
      hoverTrailAmount: 0,
      interactive: false
    });
  }

  const countUpElements = Array.from(document.querySelectorAll("[data-count-up]"));

  if (countUpElements.length) {
    const animateCountUp = (element, targetValue) => {
      if (element.dataset.countAnimated === "true") return;

      const duration = Number(element.dataset.countDuration || "1200");

      if (!Number.isFinite(targetValue)) return;

      const startTime = performance.now();
      const startValue = 0;

      element.dataset.countAnimated = "true";

      const step = (now) => {
        const progress = Math.min(1, (now - startTime) / duration);
        const eased = 1 - Math.pow(1 - progress, 3);
        const nextValue = Math.round(startValue + (targetValue - startValue) * eased);

        element.textContent = nextValue.toLocaleString();

        if (progress < 1) {
          window.requestAnimationFrame(step);
        }
      };

      window.requestAnimationFrame(step);
    };

    const prepareCountTargets = async () => {
      await Promise.all(countUpElements.map(async (element) => {
        const endpoint = String(element.dataset.countapiUrl || "").trim();
        if (!endpoint) return;

        try {
          const response = await fetch(endpoint, { cache: "no-store" });
          if (!response.ok) {
            throw new Error(`countapi_failed:${response.status}`);
          }

          const payload = await response.json();
          const value = Number(payload?.value);
          if (!Number.isFinite(value)) {
            throw new Error("countapi_invalid_value");
          }

          element.dataset.countTarget = String(value);
          element.textContent = "0";
        } catch (_error) {
          element.dataset.countAnimated = "true";
          element.textContent = "--";
        }
      }));
    };

    const startCountAnimations = () => {
      if ("IntersectionObserver" in window) {
        const countObserver = new IntersectionObserver((entries, observer) => {
          entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            const element = entry.target;
            const targetValue = Number((element.dataset.countTarget || element.textContent || "0").replace(/,/g, ""));
            animateCountUp(element, targetValue);
            observer.unobserve(entry.target);
          });
        }, { threshold: 0.35 });

        countUpElements.forEach((element) => countObserver.observe(element));
        return;
      }

      countUpElements.forEach((element) => {
        const targetValue = Number((element.dataset.countTarget || element.textContent || "0").replace(/,/g, ""));
        animateCountUp(element, targetValue);
      });
    };

    prepareCountTargets().finally(startCountAnimations);
  }

  const depthCards = Array.from(document.querySelectorAll("[data-depth-card]"));

  if (depthCards.length && !prefersReducedMotion) {
    depthCards.forEach((depthCard) => {
      const maxTilt = depthCard.classList.contains("social-card") ? 5 : 7;
      const restingShadow = depthCard.classList.contains("social-card")
        ? "0 14px 22px rgba(112, 49, 8, 0.22)"
        : "0 22px 28px rgba(108, 53, 12, 0.26), inset 0 1px 0 rgba(255, 255, 255, 0.22)";

      const resetDepthCard = () => {
        depthCard.style.transform = "perspective(900px) rotateX(0deg) rotateY(0deg) translateY(0)";
        depthCard.style.boxShadow = restingShadow;
      };

      depthCard.addEventListener("mousemove", (event) => {
        const rect = depthCard.getBoundingClientRect();
        const x = (event.clientX - rect.left) / rect.width;
        const y = (event.clientY - rect.top) / rect.height;
        const rotateY = (x - 0.5) * maxTilt * 2;
        const rotateX = (0.5 - y) * maxTilt * 2;

        depthCard.style.transform = `perspective(900px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateY(-2px)`;

        if (depthCard.classList.contains("social-card")) {
          depthCard.style.boxShadow = `${-rotateY * 1.2}px ${12 + rotateX * 1.1}px 24px rgba(112, 49, 8, 0.28)`;
          return;
        }

        depthCard.style.boxShadow = `${-rotateY * 1.6}px ${16 + rotateX * 1.4}px 34px rgba(108, 53, 12, 0.32), inset 0 1px 0 rgba(255, 255, 255, 0.24)`;
      });

      depthCard.addEventListener("mouseleave", resetDepthCard);
      resetDepthCard();
    });
  }

  const discordCard = document.querySelector("[data-discord-card]") || document.querySelector('[data-route-panel="home"]');

  if (!discordCard) return;

  const avatarEl = discordCard.querySelector("[data-discord-avatar]");
  const nameEl = discordCard.querySelector("[data-discord-name]");
  const statusBadgeEl = discordCard.querySelector("[data-discord-status-badge]");
  const presenceStackEl = discordCard.querySelector("[data-discord-presence]");
  let activeAvatarKey = "";
  let heartbeatTimer = null;
  let reconnectTimer = null;
  let presenceTicker = null;
  let latestPresenceData = null;

  const getDefaultAvatarUrl = (user) => {
    const hasModernUsername = user.discriminator === "0";
    const fallbackIndex = hasModernUsername
      ? Number(user.id.slice(-2)) % 6
      : Number(user.discriminator) % 5;

    return `https://cdn.discordapp.com/embed/avatars/${fallbackIndex}.png`;
  };

  const setAvatarImage = (user) => {
    const avatarKey = user.avatar || `default:${user.id}:${user.discriminator || "0"}`;
    if (avatarKey === activeAvatarKey) return;

    avatarEl.onerror = () => {
      avatarEl.src = getDefaultAvatarUrl(user);
      avatarEl.onerror = null;
    };

    avatarEl.src = user.avatar
      ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=256`
      : getDefaultAvatarUrl(user);
    activeAvatarKey = avatarKey;
    enhanceImages(discordCard);
  };

  const getDisplayName = (user) => user.display_name || user.global_name || user.username || "Gobleno";

  const getStatusMeta = (status) => {
    switch (status) {
      case "online":
        return { className: "status-online", label: "Online" };
      case "idle":
        return { className: "status-idle", label: "Idle" };
      default:
        return { className: "status-offline", label: "Offline" };
    }
  };

  const getDiscordActivityAssetUrl = (activity, assetKey) => {
    if (!activity || !activity.assets || !activity.assets[assetKey]) return "";

    const asset = String(activity.assets[assetKey]).trim();
    if (!asset) return "";

    if (asset.indexOf("mp:") === 0) {
      return `https://media.discordapp.net/${asset.slice(3)}`;
    }

    if (!activity.application_id) return "";
    return `https://cdn.discordapp.com/app-assets/${activity.application_id}/${asset}.png`;
  };

  const formatDuration = (milliseconds) => {
    if (!milliseconds || milliseconds < 0) return "";

    const totalSeconds = Math.floor(milliseconds / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (hours > 0) {
      return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
    }

    return `${minutes}:${String(seconds).padStart(2, "0")}`;
  };

  const getTimestampMarkup = (timestamps, fallbackStart) => {
    const startTime = timestamps && timestamps.start
      ? timestamps.start
      : fallbackStart;

    if (!startTime) return "";

    const now = Date.now();
    const elapsed = Math.max(0, now - startTime);
    const elapsedLabel = formatDuration(elapsed);

    if (!elapsedLabel) return "";

    if (timestamps && timestamps.end && timestamps.end > startTime) {
      const totalLabel = formatDuration(timestamps.end - startTime);
      return totalLabel
        ? `<p class="presence-timestamp">${escapeHtml(elapsedLabel)} / ${escapeHtml(totalLabel)}</p>`
        : `<p class="presence-timestamp">${escapeHtml(elapsedLabel)}</p>`;
    }

    return `<p class="presence-timestamp">${escapeHtml(elapsedLabel)} elapsed</p>`;
  };

  const createPresenceMarkup = (data) => {
    const panels = [];
    const gameActivities = (data.activities || []).filter((activity) => activity.type === 0);

    if (data.listening_to_spotify && data.spotify) {
      const artists = Array.isArray(data.spotify.artist)
        ? data.spotify.artist.join(", ")
        : data.spotify.artist;
      const spotifyArt = data.spotify.album_art_url
        ? (String(data.spotify.album_art_url).indexOf("http") === 0
          ? String(data.spotify.album_art_url)
          : `https://i.scdn.co/image/${data.spotify.album_art_url}`)
        : "";

      panels.push(`
        <article class="presence-panel spotify-panel">
          ${spotifyArt ? `<div class="presence-media"><img class="presence-image" src="${escapeHtml(spotifyArt)}" alt="${escapeHtml(data.spotify.album || data.spotify.song || "Spotify artwork")}"></div>` : ""}
          <div class="presence-body">
            <p class="presence-kicker">Listening To</p>
            <h2 class="presence-title">${escapeHtml(data.spotify.song || "Listening now")}</h2>
            ${artists ? `<p class="presence-copy">${escapeHtml(artists)}</p>` : ""}
            ${data.spotify.album ? `<p class="presence-copy">${escapeHtml(data.spotify.album)}</p>` : ""}
            ${getTimestampMarkup(data.spotify.timestamps, null)}
          </div>
        </article>
      `);
    }

    gameActivities.forEach((activity) => {
      const lines = [activity.details, activity.state].filter(Boolean);
      const activityArt = getDiscordActivityAssetUrl(activity, "large_image");

      panels.push(`
        <article class="presence-panel game-panel">
          ${activityArt ? `<div class="presence-media"><img class="presence-image" src="${escapeHtml(activityArt)}" alt="${escapeHtml(activity.name || "Activity artwork")}"></div>` : ""}
          <div class="presence-body">
            <p class="presence-kicker">Currently Playing</p>
            <h2 class="presence-title">${escapeHtml(activity.name || "Active now")}</h2>
            ${lines.map((line) => `<p class="presence-copy">${escapeHtml(line)}</p>`).join("")}
            ${getTimestampMarkup(activity.timestamps, activity.created_at)}
          </div>
        </article>
      `);
    });

    return panels.join("");
  };

  const renderPresence = (payload) => {
    const data = payload && payload.data ? payload.data : null;
    const user = data && data.discord_user ? data.discord_user : null;
    latestPresenceData = data;

    if (!data || !user) {
      presenceStackEl.innerHTML = "";
      presenceStackEl.hidden = true;
      return;
    }

    const statusMeta = getStatusMeta(data.discord_status);

    setAvatarImage(user);
    avatarEl.alt = `${getDisplayName(user)} Discord avatar`;
    nameEl.textContent = getDisplayName(user);
    statusBadgeEl.className = `discord-status-badge ${statusMeta.className}`;
    statusBadgeEl.setAttribute("aria-label", statusMeta.label);
    statusBadgeEl.setAttribute("title", statusMeta.label);

    const presenceMarkup = createPresenceMarkup(data);
    presenceStackEl.innerHTML = presenceMarkup;
    presenceStackEl.hidden = !presenceMarkup.trim();
    enhanceImages(presenceStackEl);
  };

  const clearHeartbeat = () => {
    if (!heartbeatTimer) return;
    window.clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  };

  const ensurePresenceTicker = () => {
    if (presenceTicker) return;

    presenceTicker = window.setInterval(() => {
      if (!latestPresenceData) return;
      renderPresence({ data: latestPresenceData });
    }, 1000);
  };

  const connectPresenceSocket = () => {
    const socket = new WebSocket(lanyardSocketEndpoint);

    socket.addEventListener("message", (event) => {
      let payload;

      try {
        payload = JSON.parse(event.data);
      } catch (_error) {
        return;
      }

      if (payload.op === 1) {
        clearHeartbeat();
        heartbeatTimer = window.setInterval(() => {
          if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ op: 3 }));
          }
        }, payload.d.heartbeat_interval);

        socket.send(JSON.stringify({
          op: 2,
          d: {
            subscribe_to_ids: [lanyardUserId]
          }
        }));

        return;
      }

      if (payload.op !== 0) return;

      if (payload.t === "INIT_STATE") {
        const initialPresence = payload.d && payload.d[lanyardUserId]
          ? payload.d[lanyardUserId]
          : (payload.d || null);
        renderPresence({ data: initialPresence });
        return;
      }

      if (payload.t === "PRESENCE_UPDATE") {
        renderPresence({ data: payload.d });
      }
    });

    socket.addEventListener("close", () => {
      clearHeartbeat();
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      reconnectTimer = window.setTimeout(connectPresenceSocket, 3000);
    });

    socket.addEventListener("error", () => {
      socket.close();
    });
  };

  ensurePresenceTicker();
  connectPresenceSocket();
})();
