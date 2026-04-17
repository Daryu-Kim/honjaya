const { setGlobalOptions } = require("firebase-functions");
const { onRequest } = require("firebase-functions/https");
const logger = require("firebase-functions/logger");
const cors = require("cors")({ origin: true });

setGlobalOptions({ maxInstances: 10 });

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;

exports.searchYoutubeVideos = onRequest(
  {
    region: "asia-northeast3",
    timeoutSeconds: 30,
    memory: "256MiB",
  },
  async (req, res) => {
    cors(req, res, async () => {
      try {
        if (req.method !== "GET") {
          return res.status(405).json({
            ok: false,
            message: "Method Not Allowed",
          });
        }

        const query = String(req.query.q || "").trim();

        if (!query) {
          return res.status(400).json({
            ok: false,
            message: "검색어가 비어 있습니다.",
          });
        }

        if (!YOUTUBE_API_KEY) {
          logger.error("Missing YOUTUBE_API_KEY");
          return res.status(500).json({
            ok: false,
            message: "서버 설정이 올바르지 않습니다.",
          });
        }

        const params = new URLSearchParams({
          part: "snippet",
          q: query,
          type: "video",
          maxResults: "10",
          safeSearch: "none",
          key: YOUTUBE_API_KEY,
        });

        const youtubeUrl = `https://www.googleapis.com/youtube/v3/search?${params.toString()}`;
        const response = await fetch(youtubeUrl);

        if (!response.ok) {
          const errorText = await response.text();
          logger.error("YouTube search API error", {
            status: response.status,
            body: errorText,
          });

          return res.status(response.status).json({
            ok: false,
            message: "유튜브 검색에 실패했습니다.",
          });
        }

        const data = await response.json();

        const items = (data.items || [])
          .map((item) => {
            const videoId = item?.id?.videoId || "";
            const snippet = item?.snippet || {};

            return {
              videoId,
              title: snippet.title || "",
              channelTitle: snippet.channelTitle || "",
              thumbnailUrl:
                snippet?.thumbnails?.medium?.url ||
                snippet?.thumbnails?.high?.url ||
                snippet?.thumbnails?.default?.url ||
                "",
              publishedAt: snippet.publishedAt || "",
            };
          })
          .filter((item) => item.videoId);

        return res.status(200).json({
          ok: true,
          items,
        });
      } catch (error) {
        logger.error("searchYoutubeVideos unexpected error", error);
        return res.status(500).json({
          ok: false,
          message: "서버 오류가 발생했습니다.",
        });
      }
    });
  }
);
