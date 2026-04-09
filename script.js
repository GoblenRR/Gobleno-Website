(() => {
  const presenceEndpoint = "https://api.lanyard.rest/v1/users/488391678734893066";
  const currentHash = window.location.hash.replace("#", "").trim().toLowerCase();
  const shouldPlayStartupIntro = !currentHash;

  if (shouldPlayStartupIntro) {
    document.body.classList.add("play-startup-intro");
  }

  const routeApp = document.querySelector("[data-route-app]");

  if (routeApp) {
    const routePanels = Array.from(routeApp.querySelectorAll("[data-route-panel]"));
    const validRoutes = new Set(routePanels.map((panel) => panel.dataset.routePanel));

    const applyRoute = () => {
      const requestedRoute = window.location.hash.replace("#", "").trim().toLowerCase() || "home";
      const activeRoute = validRoutes.has(requestedRoute) ? requestedRoute : "home";

      routePanels.forEach((panel) => {
        const isActive = panel.dataset.routePanel === activeRoute;
        panel.hidden = !isActive;
        panel.setAttribute("aria-hidden", String(!isActive));
      });
    };

    window.addEventListener("hashchange", applyRoute);
    applyRoute();
  }

  const discordCard = document.querySelector("[data-discord-card]");

  if (!discordCard) return;

  const avatarEl = discordCard.querySelector("[data-discord-avatar]");
  const nameEl = discordCard.querySelector("[data-discord-name]");
  const statusBadgeEl = discordCard.querySelector("[data-discord-status-badge]");
  const presenceStackEl = discordCard.querySelector("[data-discord-presence]");

  const escapeHtml = (value) => String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

  const getDefaultAvatarUrl = (user) => {
    const hasModernUsername = user.discriminator === "0";
    const fallbackIndex = hasModernUsername
      ? Number((BigInt(user.id) >> 22n) % 6n)
      : Number(user.discriminator) % 5;

    return `https://cdn.discordapp.com/embed/avatars/${fallbackIndex}.png`;
  };

  const getAvatarCandidates = (user) => {
    if (!user.avatar) {
      return [getDefaultAvatarUrl(user)];
    }

    const extension = user.avatar.startsWith("a_") ? "gif" : "png";

    return [
      `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.${extension}?size=256`,
      `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.webp?size=256`,
      `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=256`,
      getDefaultAvatarUrl(user)
    ];
  };

  const setAvatarImage = (user) => {
    const candidates = getAvatarCandidates(user);
    let currentIndex = 0;

    const applyCandidate = () => {
      avatarEl.src = candidates[currentIndex];
    };

    avatarEl.onerror = () => {
      currentIndex += 1;
      if (currentIndex < candidates.length) {
        applyCandidate();
        return;
      }

      avatarEl.onerror = null;
    };

    applyCandidate();
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

  const createPresenceMarkup = (data) => {
    const panels = [];
    const gameActivities = (data.activities || []).filter((activity) => activity.type === 0);

    if (data.listening_to_spotify && data.spotify) {
      const artists = Array.isArray(data.spotify.artist)
        ? data.spotify.artist.join(", ")
        : data.spotify.artist;

      panels.push(`
        <article class="presence-panel spotify-panel">
          <p class="presence-kicker">Spotify</p>
          <h2 class="presence-title">${escapeHtml(data.spotify.song || "Listening now")}</h2>
          ${artists ? `<p class="presence-copy">${escapeHtml(artists)}</p>` : ""}
          ${data.spotify.album ? `<p class="presence-copy">${escapeHtml(data.spotify.album)}</p>` : ""}
        </article>
      `);
    }

    gameActivities.forEach((activity) => {
      const lines = [activity.details, activity.state].filter(Boolean);

      panels.push(`
        <article class="presence-panel game-panel">
          <p class="presence-kicker">Currently Playing</p>
          <h2 class="presence-title">${escapeHtml(activity.name || "Active now")}</h2>
          ${lines.map((line) => `<p class="presence-copy">${escapeHtml(line)}</p>`).join("")}
        </article>
      `);
    });

    return panels.join("");
  };

  const renderPresence = (payload) => {
    const data = payload?.data;
    const user = data?.discord_user;

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

  const loadPresence = async () => {
    try {
      const response = await fetch(presenceEndpoint, { cache: "no-store" });
      if (!response.ok) throw new Error(`Presence request failed with ${response.status}`);
      const payload = await response.json();
      renderPresence(payload);
    } catch (_error) {
      renderPresence(null);
    }
  };

  loadPresence();
  window.setInterval(loadPresence, 15000);
})();
