(() => {
  const transitionDuration = 420;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const presenceEndpoint = "https://api.lanyard.rest/v1/users/488391678734893066";

  const isInternalPageLink = (link) => {
    if (!link.href) return false;
    if (link.target && link.target !== "_self") return false;
    if (link.hasAttribute("download")) return false;

    const url = new URL(link.href, window.location.href);
    if (url.origin !== window.location.origin) return false;
    if (url.pathname === window.location.pathname && (!url.hash || url.hash === window.location.hash)) {
      return false;
    }

    return true;
  };

  const startEntry = () => {
    document.body.classList.add("is-entering");
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        document.body.classList.add("is-loaded");
        window.setTimeout(() => {
          document.body.classList.remove("is-entering");
        }, transitionDuration);
      });
    });
  };

  if (reducedMotion) {
    document.body.classList.add("is-loaded");
  } else {
    startEntry();
  }

  document.addEventListener("click", (event) => {
    const link = event.target.closest("a");
    if (!link || reducedMotion || !isInternalPageLink(link)) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

    event.preventDefault();
    document.body.classList.add("is-transitioning");

    window.setTimeout(() => {
      window.location.href = link.href;
    }, transitionDuration);
  });

  window.addEventListener("pageshow", () => {
    document.body.classList.remove("is-transitioning");
  });

  const discordCard = document.querySelector("[data-discord-card]");

  if (!discordCard) return;

  const avatarEl = discordCard.querySelector("[data-discord-avatar]");
  const nameEl = discordCard.querySelector("[data-discord-name]");
  const statusLabelEl = discordCard.querySelector("[data-discord-status-label]");
  const statusBadgeEl = discordCard.querySelector("[data-discord-status-badge]");
  const presenceStackEl = discordCard.querySelector("[data-discord-presence]");

  const escapeHtml = (value) => String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

  const getAvatarUrl = (user) => {
    if (user.avatar) {
      return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=256`;
    }

    return `https://cdn.discordapp.com/embed/avatars/${Number(user.id) % 5}.png`;
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

    if (!panels.length) {
      panels.push(`
        <article class="presence-panel presence-placeholder">
          <p class="presence-kicker">Discord</p>
          <h2 class="presence-title">No active game or Spotify session</h2>
          <p class="presence-copy">Presence updates here automatically when something starts.</p>
        </article>
      `);
    }

    return panels.join("");
  };

  const renderPresence = (payload) => {
    const data = payload?.data;
    const user = data?.discord_user;

    if (!data || !user) {
      statusLabelEl.textContent = "Discord presence is unavailable right now.";
      presenceStackEl.innerHTML = `
        <article class="presence-panel presence-placeholder">
          <p class="presence-kicker">Discord</p>
          <h2 class="presence-title">Unable to load presence</h2>
          <p class="presence-copy">Try again in a moment.</p>
        </article>
      `;
      return;
    }

    const statusMeta = getStatusMeta(data.discord_status);

    avatarEl.src = getAvatarUrl(user);
    avatarEl.alt = `${getDisplayName(user)} Discord avatar`;
    nameEl.textContent = getDisplayName(user);
    statusLabelEl.textContent = statusMeta.label;
    statusBadgeEl.className = `discord-status-badge ${statusMeta.className}`;
    statusBadgeEl.setAttribute("aria-label", statusMeta.label);
    statusBadgeEl.setAttribute("title", statusMeta.label);
    presenceStackEl.innerHTML = createPresenceMarkup(data);
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
