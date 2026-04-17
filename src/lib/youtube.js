export async function searchYoutubeVideosFunc(query) {
  const safeQuery = String(query || "").trim();

  if (!safeQuery) {
    return [];
  }

  const apiKey = process.env.VUE_APP_YOUTUBE_API_KEY;

  if (!apiKey) {
    throw new Error("유튜브 API 키가 설정되지 않았어요.");
  }

  const params = new URLSearchParams({
    part: "snippet",
    q: safeQuery,
    type: "video",
    maxResults: "10",
    safeSearch: "none",
    key: apiKey,
  });

  const response = await fetch(
    `https://www.googleapis.com/youtube/v3/search?${params.toString()}`,
    {
      method: "GET",
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data?.error?.message || "유튜브 검색에 실패했어요.");
  }

  return (data.items || [])
    .map((item) => ({
      videoId: item?.id?.videoId || "",
      title: item?.snippet?.title || "",
      channelTitle: item?.snippet?.channelTitle || "",
      thumbnailUrl:
        item?.snippet?.thumbnails?.medium?.url ||
        item?.snippet?.thumbnails?.high?.url ||
        item?.snippet?.thumbnails?.default?.url ||
        "",
      publishedAt: item?.snippet?.publishedAt || "",
    }))
    .filter((item) => item.videoId);
}
