(() => {
  const lanyardUserId = "488391678734893066";
  const lanyardSocketEndpoint = "wss://api.lanyard.rest/socket";
  const apiBaseUrl = window.location.protocol === "file:"
    ? "https://gobleno.co.uk"
    : "";
  const videosApiUrl = `${apiBaseUrl}/api/videos`;
  const workContentApiUrl = `${apiBaseUrl}/api/work-content`;
  const workImageUploadApiUrl = `${apiBaseUrl}/api/dev/upload-image`;
  const devSessionApiUrl = `${apiBaseUrl}/api/dev/session`;
  const devLoginApiUrl = `${apiBaseUrl}/api/dev/login`;
  const devSessionStorageKey = "gobleno_dev_token";
  const contentSections = new Set(["music", "ui", "games", "extras"]);
  const currentHash = window.location.hash.replace("#", "").trim().toLowerCase();
  const shouldPlayStartupIntro = !currentHash || currentHash === "home";

  if (shouldPlayStartupIntro) {
    document.body.classList.add("play-startup-intro");
  }

  const routeApp = document.querySelector("[data-route-app]");
  if (routeApp) {
    const routePanels = Array.from(routeApp.querySelectorAll("[data-route-panel]"));
    const routeTabs = Array.from(routeApp.querySelectorAll("[data-tab-for]"));
    const validRoutes = new Set(routePanels.map((panel) => panel.dataset.routePanel));

    const showPanel = (panel) => {
      panel.hidden = false;
      panel.setAttribute("aria-hidden", "false");
    };

    const hidePanel = (panel) => {
      panel.hidden = true;
      panel.setAttribute("aria-hidden", "true");
    };

    const applyRoute = () => {
      const requestedRoute = window.location.hash.replace("#", "").trim().toLowerCase() || "home";
      const nextRoute = validRoutes.has(requestedRoute) ? requestedRoute : "home";

      routePanels.forEach((panel) => {
        if (panel.dataset.routePanel === nextRoute) {
          showPanel(panel);
          return;
        }

        hidePanel(panel);
      });

      routeTabs.forEach((tab) => {
        tab.classList.toggle("is-active", tab.dataset.tabFor === nextRoute);
      });

    };

    window.addEventListener("hashchange", applyRoute);
    applyRoute();
  }

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
  const contactForm = document.querySelector("[data-contact-form]");
  const contactStatus = document.querySelector("[data-contact-status]");
  const devStatus = document.querySelector("[data-dev-status]");
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

  const escapeHtml = (value) => String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

  const formatMultilineHtml = (value) => escapeHtml(value).replace(/\r?\n/g, "<br>");

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
  };

  const closeDevModal = () => {
    if (!devModal) return;
    devModal.hidden = true;
    setDevStatus("");
  };

  const workEntryCardMarkup = (entry) => {
    const openTag = entry.link_url
      ? `<a class="work-entry-card work-entry-card--linked" href="${escapeHtml(entry.link_url)}" target="_blank" rel="noreferrer">`
      : `<article class="work-entry-card">`;
    const closeTag = entry.link_url ? "</a>" : "</article>";

    return `
    ${openTag}
      ${entry.image_url ? `
      <div class="work-entry-card__media">
        <img src="${escapeHtml(entry.image_url)}" alt="${escapeHtml(entry.image_alt || entry.title || "Work image")}" loading="lazy" onerror="this.closest('.work-entry-card__media').classList.add('is-broken'); this.remove();">
      </div>
      ` : ""}
      <div class="work-entry-card__body">
        ${entry.title ? `<h3 class="work-entry-card__title">${escapeHtml(entry.title)}</h3>` : ""}
        ${entry.body ? `<p class="work-entry-card__copy">${formatMultilineHtml(entry.body)}</p>` : ""}
        ${entry.link_url ? `<span class="work-entry-card__link">Open link</span>` : ""}
      </div>
    ${closeTag}
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
      return;
    }

    if (!entries.length) {
      devEntryList.innerHTML = `<p class="dev-entry-list__status">No entries found in ${escapeHtml(sectionName)}.</p>`;
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
        entryId ? `ID ${escapeHtml(entryId)}` : "ID missing",
        `Sort ${escapeHtml(Number(entry.sort_order || 0))}`,
        entry.link_url ? "Has link" : "",
        entry.image_url ? "Has image" : ""
      ].filter(Boolean).join(" | ");

      return `
        <article class="dev-entry-list__item">
          <div>
            <h4 class="dev-entry-list__title">${title}</h4>
            <p class="dev-entry-list__meta">${meta}</p>
            ${previewText}
          </div>
          <button class="dev-entry-list__delete" type="button" data-dev-delete-entry="${escapeHtml(entryId)}" data-dev-delete-section="${escapeHtml(sectionName)}">Delete</button>
        </article>
      `;
    }).join("");
  };

  const renderWorkSectionEntries = (sectionName, entries, fallbackMessage = "this section is empty") => {
    const board = workContentBoards.get(sectionName);

    if (!board) return;

    if (!entries.length) {
      board.innerHTML = `<p class="work-content-status work-empty-state">${escapeHtml(fallbackMessage)}</p>`;
      return;
    }

    board.innerHTML = `
      <div class="work-entry-grid">
        ${entries.map((entry) => workEntryCardMarkup(entry)).join("")}
      </div>
    `;
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

  const uploadWorkImage = async (file, sectionName) => {
    const uploadData = new FormData();
    uploadData.append("section", sectionName);
    uploadData.append("file", file);

    const payload = await apiRequest(workImageUploadApiUrl, {
      method: "POST",
      body: uploadData
    });

    return String(payload?.public_url || "");
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
        <span class="video-card__thumb">
          <img src="${escapeHtml(video.thumbnail)}" alt="${escapeHtml(video.title)} thumbnail" loading="lazy">
        </span>
        <span class="video-card__title">${escapeHtml(video.title)}</span>
        <span class="video-card__meta">${escapeHtml(Number(video.viewCount || 0).toLocaleString())} views</span>
      </a>
    `).join("");
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

  async function loadWorkSectionContent(sectionName) {
    if (!contentSections.has(sectionName) || loadedContentSections.has(sectionName) || loadingContentSections.has(sectionName)) return;

    const board = workContentBoards.get(sectionName);

    if (!board) return;

    loadingContentSections.add(sectionName);
    board.innerHTML = `<p class="work-content-status work-empty-state">loading...</p>`;

    try {
      const payload = await apiRequest(`${workContentApiUrl}?section=${encodeURIComponent(sectionName)}`);
      const entries = Array.isArray(payload?.entries) ? payload.entries : [];

      loadedContentSections.add(sectionName);
      renderWorkSectionEntries(sectionName, entries);
    } catch (_error) {
      renderWorkSectionEntries(sectionName, [], "unable to load this section right now");
    } finally {
      loadingContentSections.delete(sectionName);
    }
  }

  async function loadDevEntries(sectionName) {
    if (!devEntryList || !contentSections.has(sectionName)) return;

    devEntriesLoadingSection = sectionName;
    renderDevEntryList(sectionName, [], "loading entries...");

    try {
      const payload = await apiRequest(`${workContentApiUrl}?section=${encodeURIComponent(sectionName)}`);
      const entries = Array.isArray(payload?.entries) ? payload.entries : [];

      if (devEntriesLoadingSection !== sectionName) return;

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

      console.info("dev session check", payload);

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
      loadDevEntries(devEntryListSection.value || "music");
    }
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

  if (devEntryListSection instanceof HTMLSelectElement) {
    devEntryListSection.addEventListener("change", () => {
      if (!isDevAuthenticated) return;
      loadDevEntries(devEntryListSection.value || "music");
    });
  }

  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && devModal && !devModal.hidden) {
      closeDevModal();
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
        setDevStatus("developer controls unlocked", "success");
      } catch (error) {
        isDevAuthenticated = false;
        devSessionToken = "";
        window.localStorage.removeItem(devSessionStorageKey);
        syncDevUi();
        console.error("dev login failed", error);
        setDevStatus(error instanceof Error ? error.message.replace(/_/g, " ") : "incorrect password", "error");
      }
    });
  }

  if (devEntryForm) {
    devEntryForm.addEventListener("submit", async (event) => {
      event.preventDefault();

      const formData = new FormData(devEntryForm);
      const section = String(formData.get("section") || "");
      const title = String(formData.get("title") || "");
      const body = String(formData.get("body") || "");
      const linkUrl = String(formData.get("link_url") || "");
      const imageFile = formData.get("image_file");
      const sortOrder = Number(formData.get("sort_order") || 0);

      setDevStatus("saving entry...", "info");

      try {
        let imageUrl = "";

        if (imageFile instanceof File && imageFile.size > 0) {
          setDevStatus("uploading image...", "info");
          imageUrl = await uploadWorkImage(imageFile, section);
        }

        await apiRequest(workContentApiUrl, {
          method: "POST",
          headers: {
            "content-type": "application/json"
          },
          body: JSON.stringify({
            section,
            title,
            body,
            link_url: linkUrl,
            image_url: imageUrl,
            sort_order: sortOrder
          })
        });

        loadedContentSections.delete(section);
        renderWorkSectionEntries(section, [], "loading...");
        setActiveWorkSection(section);
        devEntryForm.reset();
        const sectionField = devEntryForm.querySelector('[name="section"]');
        const sortField = devEntryForm.querySelector('[name="sort_order"]');

        if (sectionField instanceof HTMLSelectElement) {
          sectionField.value = section;
        }

        if (sortField instanceof HTMLInputElement) {
          sortField.value = "0";
        }

        if (devEntryListSection instanceof HTMLSelectElement) {
          devEntryListSection.value = section;
          loadDevEntries(section);
        }

        setDevStatus("entry added", "success");
      } catch (error) {
        const message = error instanceof Error ? error.message : "unable to save entry";
        console.error("save entry failed", error);
        setDevStatus(message.replace(/_/g, " "), "error");
      }
    });
  }

  if (devEntryList) {
    devEntryList.addEventListener("click", async (event) => {
      const target = event.target;

      if (!(target instanceof HTMLElement)) return;

      const deleteButton = target.closest("[data-dev-delete-entry]");

      if (!(deleteButton instanceof HTMLButtonElement)) return;
      if (!isDevAuthenticated) return;

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
        if (activeWorkSection === section) {
          renderWorkSectionEntries(section, [], "loading...");
          setActiveWorkSection(section);
        }

        await loadDevEntries(section);
        setDevStatus("entry deleted", "success");
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error || "unable to delete entry");
        console.error("delete entry failed", error);
        setDevStatus(message.replace(/_/g, " "), "error");
      } finally {
        deleteButton.disabled = false;
      }
    });
  }

  if (contactForm) {
    contactForm.addEventListener("submit", async (event) => {
      event.preventDefault();

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
          contactStatus.textContent = "Message sent. I’ll get back to you soon.";
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

  const hoverTargets = Array.from(document.querySelectorAll(".app-tab, .action-button, .social-card, .back-mark, .work-category-card, .dev-control-button, .dev-submit-button"));

  if (hoverTargets.length) {
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

    window.addEventListener("pointerdown", unlockAudio, { once: true, passive: true });
    window.addEventListener("keydown", unlockAudio, { once: true });
    window.addEventListener("touchstart", unlockAudio, { once: true, passive: true });

    hoverTargets.forEach((target) => {
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

  const sparkLayer = document.querySelector("[data-click-spark-layer]");
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

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

  const countUpElements = Array.from(document.querySelectorAll("[data-count-up]"));

  if (countUpElements.length) {
    const animateCountUp = (element) => {
      if (element.dataset.countAnimated === "true") return;

      const targetValue = Number((element.dataset.countTarget || element.textContent || "0").replace(/,/g, ""));
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

    if ("IntersectionObserver" in window) {
      const countObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          animateCountUp(entry.target);
          observer.unobserve(entry.target);
        });
      }, { threshold: 0.35 });

      countUpElements.forEach((element) => countObserver.observe(element));
    } else {
      countUpElements.forEach(animateCountUp);
    }
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
