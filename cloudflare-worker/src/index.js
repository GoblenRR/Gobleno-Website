const YOUTUBE_CHANNEL_ID = "UCswTLX2pZwbRe80PpLDmdpA";
const YOUTUBE_API_BASE = "https://www.googleapis.com/youtube/v3";
const PAGE_SIZE = 50;
const MAX_PAGES = 10;
const DEV_COOKIE_NAME = "gobleno_dev_session";
const DEV_SESSION_MAX_AGE = 60 * 60 * 12;
const ALLOWED_CONTENT_SECTIONS = new Set(["music", "ui", "games", "extras"]);

const encoder = new TextEncoder();

function getOriginHeaders(request, includeCredentials = false) {
  const origin = request.headers.get("Origin");
  const headers = {
    "access-control-allow-methods": "GET, POST, DELETE, OPTIONS",
    "access-control-allow-headers": "content-type"
  };

  if (origin) {
    headers["access-control-allow-origin"] = origin;
    headers.vary = "Origin";

    if (includeCredentials) {
      headers["access-control-allow-credentials"] = "true";
    }

    return headers;
  }

  headers["access-control-allow-origin"] = "*";
  return headers;
}

function jsonResponse(request, payload, options = {}) {
  const {
    status = 200,
    includeCredentials = false,
    cacheControl = "no-store",
    headers = {}
  } = options;

  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=UTF-8",
      "cache-control": cacheControl,
      ...getOriginHeaders(request, includeCredentials),
      ...headers
    }
  });
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      "user-agent": "Gobleno-Website-Worker"
    }
  });

  if (!response.ok) {
    throw new Error(`google_request_failed:${response.status}`);
  }

  return response.json();
}

function buildVideoList(playlistData, statisticsById) {
  return (playlistData.items || []).map((item) => {
    const snippet = item.snippet || {};
    const videoId = item?.id?.videoId || snippet?.resourceId?.videoId || "";
    const thumbnails = snippet.thumbnails || {};
    const thumbnail =
      thumbnails.maxres?.url ||
      thumbnails.standard?.url ||
      thumbnails.high?.url ||
      thumbnails.medium?.url ||
      thumbnails.default?.url ||
      "";
    const title = snippet.title || "Untitled";
    const url = videoId ? `https://www.youtube.com/watch?v=${videoId}` : "#";
    const viewCount = statisticsById[videoId]?.viewCount || "0";
    const duration = statisticsById[videoId]?.duration || "";
    const liveBroadcastContent = snippet.liveBroadcastContent || "none";

    return { title, url, thumbnail, viewCount, duration, videoId, liveBroadcastContent };
  }).filter((video) =>
    video.thumbnail &&
    video.url &&
    video.videoId &&
    !video.title.toLowerCase().includes("live") &&
    getDurationSeconds(video.duration) > 60
  );
}

function getDurationSeconds(isoDuration) {
  if (!isoDuration) return 0;

  const match = isoDuration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;

  const hours = Number(match[1] || 0);
  const minutes = Number(match[2] || 0);
  const seconds = Number(match[3] || 0);

  return hours * 3600 + minutes * 60 + seconds;
}

function getSupabaseConfig(env) {
  return {
    url: (env.SUPABASE_URL || "").replace(/\/$/, ""),
    serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY || ""
  };
}

async function supabaseRequest(env, path, options = {}) {
  const { url, serviceRoleKey } = getSupabaseConfig(env);

  if (!url || !serviceRoleKey) {
    throw new Error("supabase_env_missing");
  }

  const response = await fetch(`${url}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "content-type": "application/json",
      ...options.headers
    }
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`supabase_request_failed:${response.status}:${detail}`);
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

function parseCookies(request) {
  const header = request.headers.get("Cookie") || "";

  return header.split(";").reduce((accumulator, part) => {
    const [rawName, ...rawValue] = part.trim().split("=");

    if (!rawName) {
      return accumulator;
    }

    accumulator[rawName] = decodeURIComponent(rawValue.join("=") || "");
    return accumulator;
  }, {});
}

function toBase64Url(input) {
  const raw = typeof input === "string" ? input : String.fromCharCode(...new Uint8Array(input));
  return btoa(raw).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(input) {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/");
  const normalized = padded + "=".repeat((4 - (padded.length % 4 || 4)) % 4);
  return atob(normalized);
}

async function createHmacSignature(value, secret) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
  return toBase64Url(signature);
}

function constantTimeEqual(left, right) {
  if (left.length !== right.length) {
    return false;
  }

  let mismatch = 0;

  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }

  return mismatch === 0;
}

async function createDevSessionToken(env) {
  const payload = JSON.stringify({
    exp: Date.now() + DEV_SESSION_MAX_AGE * 1000
  });
  const encodedPayload = toBase64Url(payload);
  const signature = await createHmacSignature(encodedPayload, env.DEV_SESSION_SECRET || "");

  return `${encodedPayload}.${signature}`;
}

async function inspectAuthSession(request, env) {
  const authorizationHeader = request.headers.get("Authorization") || "";
  const bearerToken = authorizationHeader.startsWith("Bearer ")
    ? authorizationHeader.slice("Bearer ".length).trim()
    : "";
  const cookieToken = parseCookies(request)[DEV_COOKIE_NAME] || "";
  const token = bearerToken || cookieToken;
  const source = bearerToken ? "bearer" : (cookieToken ? "cookie" : "none");

  if (!env.DEV_SESSION_SECRET) {
    return {
      authenticated: false,
      reason: "missing_dev_session_secret",
      source
    };
  }

  if (!token) {
    return {
      authenticated: false,
      reason: "no_session_token_present",
      source
    };
  }

  const [encodedPayload, signature] = token.split(".");

  if (!encodedPayload || !signature) {
    return {
      authenticated: false,
      reason: "malformed_session_token",
      source
    };
  }

  const expectedSignature = await createHmacSignature(encodedPayload, env.DEV_SESSION_SECRET);

  if (!constantTimeEqual(signature, expectedSignature)) {
    return {
      authenticated: false,
      reason: "invalid_session_signature",
      source
    };
  }

  try {
    const payload = JSON.parse(fromBase64Url(encodedPayload));
    const expiresAt = Number(payload?.exp || 0);

    if (!expiresAt) {
      return {
        authenticated: false,
        reason: "session_missing_expiry",
        source
      };
    }

    if (expiresAt <= Date.now()) {
      return {
        authenticated: false,
        reason: "session_expired",
        source,
        expires_at: expiresAt
      };
    }

    return {
      authenticated: true,
      reason: "session_valid",
      source,
      expires_at: expiresAt
    };
  } catch (_error) {
    return {
      authenticated: false,
      reason: "session_payload_invalid",
      source
    };
  }
}

function createSessionCookie(token) {
  return `${DEV_COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${DEV_SESSION_MAX_AGE}`;
}

async function readJsonBody(request) {
  try {
    return await request.json();
  } catch (_error) {
    return {};
  }
}

function normalizeEntryPayload(payload) {
  const section = String(payload?.section || "").trim().toLowerCase();
  const title = String(payload?.title || "").trim();
  const body = String(payload?.body || "").trim();
  const imageUrl = String(payload?.image_url || "").trim();
  const imageAlt = String(payload?.image_alt || "").trim();
  const sortOrder = Number(payload?.sort_order || 0);

  if (!ALLOWED_CONTENT_SECTIONS.has(section)) {
    throw new Error("invalid_section");
  }

  if (!title && !body && !imageUrl) {
    throw new Error("content_required");
  }

  if (imageUrl && !/^https?:\/\//i.test(imageUrl)) {
    throw new Error("invalid_image_url");
  }

  return {
    section,
    title,
    body,
    image_url: imageUrl || null,
    image_alt: imageAlt || null,
    sort_order: Number.isFinite(sortOrder) ? sortOrder : 0
  };
}

async function handleVideosRequest(request, env) {
  if (!env.YOUTUBE_API_KEY) {
    return jsonResponse(request, { error: "missing_youtube_api_key" }, { status: 500, cacheControl: "no-store" });
  }

  const channelData = await fetchJson(
    `${YOUTUBE_API_BASE}/channels?part=contentDetails&id=${YOUTUBE_CHANNEL_ID}&key=${env.YOUTUBE_API_KEY}`
  );
  const uploadsPlaylistId = channelData?.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;

  if (!uploadsPlaylistId) {
    throw new Error("uploads_playlist_missing");
  }

  const allItems = [];
  let nextPageToken = "";

  for (let pageIndex = 0; pageIndex < MAX_PAGES; pageIndex += 1) {
    const tokenQuery = nextPageToken ? `&pageToken=${encodeURIComponent(nextPageToken)}` : "";
    const playlistData = await fetchJson(
      `${YOUTUBE_API_BASE}/playlistItems?part=snippet&playlistId=${uploadsPlaylistId}&maxResults=${PAGE_SIZE}${tokenQuery}&key=${env.YOUTUBE_API_KEY}`
    );

    allItems.push(...(playlistData.items || []));
    nextPageToken = playlistData.nextPageToken || "";

    if (!nextPageToken) {
      break;
    }
  }

  const videoIds = allItems
    .map((item) => item?.snippet?.resourceId?.videoId || item?.id?.videoId)
    .filter(Boolean);

  let statisticsById = {};

  if (videoIds.length) {
    for (let index = 0; index < videoIds.length; index += 50) {
      const batchIds = videoIds.slice(index, index + 50);
      const statsData = await fetchJson(
        `${YOUTUBE_API_BASE}/videos?part=statistics,contentDetails&id=${batchIds.join(",")}&key=${env.YOUTUBE_API_KEY}`
      );

      statisticsById = (statsData.items || []).reduce((accumulator, item) => {
        accumulator[item.id] = {
          ...(item.statistics || {}),
          duration: item.contentDetails?.duration || ""
        };
        return accumulator;
      }, statisticsById);
    }
  }

  const videos = buildVideoList({ items: allItems }, statisticsById);

  return jsonResponse(request, { videos }, {
    cacheControl: "public, max-age=300"
  });
}

async function handleWorkContentGet(request, env) {
  const url = new URL(request.url);
  const section = String(url.searchParams.get("section") || "").trim().toLowerCase();

  if (!ALLOWED_CONTENT_SECTIONS.has(section)) {
    return jsonResponse(request, { error: "invalid_section" }, { status: 400 });
  }

  const query = `work_entries?section=eq.${encodeURIComponent(section)}&select=id,section,title,body,image_url,image_alt,sort_order,created_at,updated_at&order=sort_order.asc.nullslast,created_at.desc`;
  const entries = await supabaseRequest(env, query, {
    method: "GET",
    headers: {
      Prefer: "count=exact"
    }
  });

  return jsonResponse(request, { section, entries }, { cacheControl: "public, max-age=60" });
}

async function handleWorkContentCreate(request, env) {
  const authState = await inspectAuthSession(request, env);

  if (!authState.authenticated) {
    return jsonResponse(request, {
      error: "unauthorized",
      auth_reason: authState.reason,
      auth_source: authState.source
    }, { status: 401, includeCredentials: true });
  }

  const payload = normalizeEntryPayload(await readJsonBody(request));
  const createdEntries = await supabaseRequest(env, "work_entries", {
    method: "POST",
    headers: {
      Prefer: "return=representation"
    },
    body: JSON.stringify(payload)
  });

  return jsonResponse(request, { entry: createdEntries?.[0] || null }, {
    status: 201,
    includeCredentials: true
  });
}

async function handleDevSessionRequest(request, env) {
  return jsonResponse(request, await inspectAuthSession(request, env), {
    includeCredentials: true
  });
}

async function handleDevLoginRequest(request, env) {
  if (!env.DEV_PASSWORD || !env.DEV_SESSION_SECRET) {
    return jsonResponse(request, { error: "dev_auth_env_missing" }, {
      status: 500,
      includeCredentials: true
    });
  }

  const payload = await readJsonBody(request);
  const password = String(payload?.password || "");

  if (password !== env.DEV_PASSWORD) {
    return jsonResponse(request, { error: "invalid_password" }, {
      status: 401,
      includeCredentials: true
    });
  }

  const token = await createDevSessionToken(env);

  return jsonResponse(request, { authenticated: true, token }, {
    includeCredentials: true,
    headers: {
      "set-cookie": createSessionCookie(token)
    }
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: getOriginHeaders(request, true)
      });
    }

    try {
      if (request.method === "GET" && url.pathname === "/api/videos") {
        return handleVideosRequest(request, env);
      }

      if (request.method === "GET" && url.pathname === "/api/work-content") {
        return handleWorkContentGet(request, env);
      }

      if (request.method === "POST" && url.pathname === "/api/work-content") {
        return handleWorkContentCreate(request, env);
      }

      if (request.method === "GET" && url.pathname === "/api/dev/session") {
        return handleDevSessionRequest(request, env);
      }

      if (request.method === "POST" && url.pathname === "/api/dev/login") {
        return handleDevLoginRequest(request, env);
      }

      return new Response("Not found", { status: 404 });
    } catch (error) {
      return jsonResponse(request, {
        error: "request_failed",
        detail: error instanceof Error ? error.message : "unknown_error"
      }, {
        status: 500,
        includeCredentials: true
      });
    }
  }
};
