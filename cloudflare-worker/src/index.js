const YOUTUBE_CHANNEL_ID = "UCswTLX2pZwbRe80PpLDmdpA";
const YOUTUBE_API_BASE = "https://www.googleapis.com/youtube/v3";
const PAGE_SIZE = 50;
const MAX_PAGES = 10;

const jsonHeaders = {
  "content-type": "application/json; charset=UTF-8",
  "cache-control": "public, max-age=300"
};

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      "user-agent": "Gobleno-Website-Worker"
    }
  });

  if (!response.ok) {
    throw new Error(`youtube_request_failed:${response.status}`);
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

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "access-control-allow-origin": "*",
          "access-control-allow-methods": "GET, OPTIONS",
          "access-control-allow-headers": "content-type"
        }
      });
    }

    if (url.pathname !== "/api/videos") {
      return new Response("Not found", { status: 404 });
    }

    if (!env.YOUTUBE_API_KEY) {
      return new Response(JSON.stringify({ error: "missing_youtube_api_key" }), {
        status: 500,
        headers: jsonHeaders
      });
    }

    try {
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

      return new Response(JSON.stringify({ videos }), {
        headers: {
          ...jsonHeaders,
          "access-control-allow-origin": "*"
        }
      });
    } catch (error) {
      return new Response(JSON.stringify({
        error: "videos_fetch_failed",
        detail: error instanceof Error ? error.message : "unknown_error"
      }), {
        status: 500,
        headers: {
          ...jsonHeaders,
          "access-control-allow-origin": "*"
        }
      });
    }
  }
};
