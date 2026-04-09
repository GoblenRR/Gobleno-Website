(() => {
  const lanyardUserId = "488391678734893066";
  const lanyardSocketEndpoint = "wss://api.lanyard.rest/socket";
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
  let activeAvatarKey = "";
  let heartbeatTimer = null;
  let reconnectTimer = null;

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
      ? `https://api.lanyard.rest/${user.id}.png?v=${encodeURIComponent(user.avatar)}`
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
    const data = payload && payload.data ? payload.data : null;
    const user = data && data.discord_user ? data.discord_user : null;

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

  connectPresenceSocket();
})();
