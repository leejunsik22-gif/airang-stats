// GoatCounter 중계: GitHub 서버 접속이 막혀서 Cloudflare를 거쳐 읽기 전용 API만 전달한다.
// 우리 두 사이트의 /api/v0/ 조회만 허용, 키는 요청에 붙어 올 때만 그대로 넘기고 어디에도 저장하지 않는다.
export default {
  async fetch(req) {
    if (req.method !== "GET") return new Response("GET only", { status: 405 });
    const u = new URL(req.url);
    const site = u.searchParams.get("site") || "";
    if (!/^(yongin|suwon)-edu-app$/.test(site)) return new Response("site not allowed", { status: 403 });
    if (!u.pathname.startsWith("/api/v0/")) return new Response("path not allowed", { status: 403 });
    u.searchParams.delete("site");
    const target = `https://${site}.goatcounter.com${u.pathname}${u.search}`;
    const auth = req.headers.get("Authorization");
    if (!auth) return new Response("no key", { status: 401 });
    const r = await fetch(target, { headers: { Authorization: auth, "Content-Type": "application/json", "User-Agent": "airang-stats-relay/1.0" } });
    return new Response(r.body, { status: r.status, headers: { "Content-Type": r.headers.get("Content-Type") || "application/json" } });
  },
};
