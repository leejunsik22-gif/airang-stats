// 아이랑 사이트 하나에 여러 도시 — 들어온 주소(호스트)를 보고 그 도시 폴더를 보여 준다.
//   yongin.daejeon.example.invalid/…  →  /yongin/…
//   airang.daejeon.example.invalid/…  →  /entry/…
// 모르는 주소(시험용 airang-daejeon-all.pages.dev 등)는 경로 그대로: /yongin/ 처럼 폴더로 들어가 확인.
const HOSTS = /*HOSTS*/{};
// 2026-11-09 문의하기 운영 공개(대표 승인): 접수·접수함·로그인 처리. 원본 = airang-cities/functions (make_all.py 가 이 폴더 안으로 복사)
import * as inqSubmit from "./functions/api/inquiry/index.js";
import * as inqAdmin from "./functions/api/inquiry/admin.js";
import * as inqLogin from "./functions/api/inquiry/login.js";
const API = { "/api/inquiry": inqSubmit, "/api/inquiry/admin": inqAdmin, "/api/inquiry/login": inqLogin };

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const api = API[url.pathname.replace(/\/+$/, "")];
    if (api) {   // 문의 처리(저장소 INQ_DB). 없는 방식은 405
      const fn = api["onRequest" + req.method[0] + req.method.slice(1).toLowerCase()];
      return fn ? fn({ request: req, env, params: {} }) : new Response("Method Not Allowed", { status: 405, headers: { allow: "GET, POST, DELETE" } });
    }
    if (url.pathname === "/inquiry" || url.pathname.startsWith("/inquiry/")) return env.ASSETS.fetch(req);   // 문의 화면은 어느 주소에서든 같은 곳
    const key = HOSTS[url.hostname];
    if (!key) {
      // 아직 안 연 도시 주소(…daejeon.example.invalid)로 들어오면 입구로 보냄
      if (url.hostname.endsWith(".daejeon.example.invalid")) return Response.redirect("/entry/", 302);   // (자체 도메인은 아직 없음 — pages.dev 는 경로 방식으로 처리)
      if (url.pathname === "/") return Response.redirect(new URL("/entry/", url).toString(), 302);   // 117(2026-11-12): 기본 주소는 개발용 목록 대신 입구로 (목록은 /_list/ 에서만)
      if (url.pathname === "/_list/") return new Response(LIST, { headers: { "content-type": "text/html; charset=utf-8", "x-robots-tag": "noindex" } });
      return env.ASSETS.fetch(req);
    }
    const inner = new URL(url);
    inner.pathname = "/" + key + url.pathname;
    let res = await env.ASSETS.fetch(new Request(inner, req));
    // 주소 정리(…/index.html → …/) 같은 넘겨주기에 붙은 도시 폴더 이름을 다시 뗀다
    const loc = res.headers.get("location");
    if (loc && res.status >= 300 && res.status < 400) {
      const l = new URL(loc, inner);
      if (l.pathname.startsWith("/" + key + "/") || l.pathname === "/" + key) {
        l.pathname = l.pathname.slice(key.length + 1) || "/";
        l.host = url.host; l.protocol = url.protocol;
        const h = new Headers(res.headers); h.set("location", l.pathname + l.search + l.hash);
        res = new Response(res.body, { status: res.status, headers: h });
      }
    }
    return res;
  },
};

const LIST = "<!doctype html><meta charset=utf-8><meta name=viewport content='width=device-width'><title>아이랑 (시험)</title><h3>아이랑 사이트 하나 — 시험 주소</h3><ul>" +
  Object.entries(HOSTS).map(([h, k]) => `<li><a href="/${k}/">${k}</a> <small>${h}</small></li>`).join("") + "</ul>";
