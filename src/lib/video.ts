const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "youtu.be",
  "www.youtu.be",
]);

const YOUTUBE_ID_REGEX = /^[a-zA-Z0-9_-]{11}$/;

function getYouTubeId(url: URL): string | null {
  if (!YOUTUBE_HOSTS.has(url.hostname)) return null;

  if (url.hostname.includes("youtu.be")) {
    const id = url.pathname.split("/").filter(Boolean)[0];
    return id && YOUTUBE_ID_REGEX.test(id) ? id : null;
  }

  if (url.pathname === "/watch") {
    const id = url.searchParams.get("v");
    return id && YOUTUBE_ID_REGEX.test(id) ? id : null;
  }

  if (url.pathname.startsWith("/shorts/") || url.pathname.startsWith("/embed/")) {
    const id = url.pathname.split("/").filter(Boolean)[1];
    return id && YOUTUBE_ID_REGEX.test(id) ? id : null;
  }

  return null;
}

export function getYouTubeEmbedUrl(videoUrl: string | null): string | null {
  if (!videoUrl) return null;

  try {
    const parsed = new URL(videoUrl);
    const id = getYouTubeId(parsed);
    if (!id) return null;

    return `https://www.youtube.com/embed/${id}?rel=0&modestbranding=1&playsinline=1`;
  } catch {
    return null;
  }
}
