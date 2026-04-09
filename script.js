(() => {
  const lanyardUserId = "488391678734893066";
  const lanyardSocketEndpoint = "wss://api.lanyard.rest/socket";
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

  const depthCards = Array.from(document.querySelectorAll("[data-depth-card]"));

  if (depthCards.length && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
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

  const escapeHtml = (value) => String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

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
