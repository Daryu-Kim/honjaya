// supabase-js 가 보내는 Prefer / Accept 헤더를 해석합니다.
// 예) Prefer: return=representation,count=exact,resolution=merge-duplicates
export function parsePrefer(header) {
  const prefer = { return: "minimal", count: null, resolution: null };

  for (const chunk of String(header || "").split(",")) {
    const separator = chunk.indexOf("=");

    if (separator <= 0) {
      continue;
    }

    const key = chunk.slice(0, separator).trim().toLowerCase();
    const value = chunk.slice(separator + 1).trim().toLowerCase();

    if (key === "return" || key === "count" || key === "resolution") {
      prefer[key] = value;
    }
  }

  return prefer;
}

// .single() 로 요청하면 단일 객체를 기대합니다. (.maybeSingle() 은 배열을 받아 클라이언트에서 처리)
export function wantsObject(accept) {
  return String(accept || "").includes("vnd.pgrst.object+json");
}
