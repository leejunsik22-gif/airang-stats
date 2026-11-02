// 아이랑 → 중앙관제 방문 통계 보내기 (Cloudflare Worker, 10분마다)
// 규격: 관제 연락판 '아이랑관리자_방문통계_연동규격.md' (2026-10-24)
// - 건수만 보낸다. 이름·연락처·IP·기기 정보는 보내지 않는다 (GoatCounter 숫자만 읽음).
// - 비밀값(GoatCounter 키, 관제 토큰, 관제 주소)은 Cloudflare 비밀값에만 있다. 화면에는 토큰 끝 4자리만.
// - 관제가 꺼져 있어도 아이랑 앱·관리자에는 영향 없음 (이 작업만 실패하고 다음 10분에 다시 보냄).
//
// 세는 기준 (아이랑 앱에 원래 있던 기준을 따름)
// - 방문자: 앱이 하루에 한 기기에서 한 번만 세는 '방문-하루' (한국 시간 하루). 관리자 기기는 앱이 안 셈, 로봇은 GoatCounter가 뺌.
// - 지역: 어느 도시 앱으로 들어왔는지 (용인시 앱 → 용인시). 사는 곳이 아니라 '보는 도시' 기준.
// - 광고 방문: 앱 안 광고 칸(가게)을 누른 수. 광고별(가게 이름)로 나눔.

const CITIES = [["djdonggu", "대전 동구"], ["djjunggu", "대전 중구"], ["djseogu", "대전 서구"], ["yuseong", "대전 유성구"], ["daedeok", "대전 대덕구"]];
const LAUNCH = "2026-10-01";   // 아이랑 시작 (이 날부터 누적)
const ADS_URL = "https://raw.githubusercontent.com/leejunsik22-gif/airang-cities/main/ads/ads.json";
const UA = "airang-kwanje/1.0";
const sleep = ms => new Promise(r => setTimeout(r, ms));
const kstNow = () => new Date(Date.now() + 9 * 3600e3);           // UTC 메서드로 읽으면 한국 시간
const ymd = d => d.toISOString().slice(0, 10);
const iso = d => d.toISOString().slice(0, 19) + "Z";

function keyFor(env, k) { return env["GC_KEY_" + k.toUpperCase()] || env.GC_KEY_ADMIN || env.GC_KEY_YONGIN || ""; }

let slot = 0;
async function gc(env, k, path, params) {
  const now = Date.now(); slot = Math.max(now, slot + 300); await sleep(slot - now);   // 1초 4번 제한
  const u = `https://${k}-edu-app.goatcounter.com/api/v0/${path}?` + new URLSearchParams(params);
  const r = await fetch(u, { headers: { Authorization: "Bearer " + keyFor(env, k), "Content-Type": "application/json", "User-Agent": UA } });
  if (!r.ok) throw new Error(`${k} ${path} ${r.status}`);
  return r.json();
}

// 방문·광고 기록 번호(path id)만 골라 두고 (6시간 기억) 그 번호만 받는다 — 관리자 화면과 같은 방식
const IDS = {};
async function wantedIds(env, k) {
  const o = IDS[k]; if (o && Date.now() - o.at < 6 * 3600e3 && o.ids.length) return o.ids;
  let ids = [], after = 0;
  for (let pg = 0; pg < 5; pg++) {
    const r = await gc(env, k, "paths", after ? { limit: 200, after } : { limit: 200 }); const ps = r.paths || [];
    ids = ids.concat(ps.filter(x => x.path === "방문-하루" || x.path === "방문-새로" || /^광고-/.test(x.path)).map(x => x.id));
    if (!r.more || !ps.length) break; after = ps[ps.length - 1].id;
  }
  IDS[k] = { at: Date.now(), ids };
  return ids;
}

// 시작한 날(LAUNCH) 0시 ~ 지금 사이 숫자 (날짜별·누적) (방문-하루, 광고-*)
async function cityHits(env, k) {
  const t = kstNow(); t.setUTCHours(0, 0, 0, 0);
  const start = LAUNCH + "T00:00:00Z";   // 하루 여유 (한국 0시 전날 15시부터)
  const end = iso(new Date(Math.ceil(Date.now() / 3600e3) * 3600e3));
  // 도시가 26곳이 되어 Cloudflare 무료 한도(한 번에 바깥 요청 50개)를 넘지 않게 도시마다 1번만 묻는다.
  // 대부분 도시는 기록 종류가 100개보다 적어서 한 번에 다 온다.
  let r = await gc(env, k, "stats/hits", { start, end, limit: 100 });
  if (r.more) {   // 기록 종류가 100개를 넘는 도시(용인)만 예전처럼 방문·광고 기록 번호를 골라 다시 묻는다
    const ids = await wantedIds(env, k);
    if (ids.length) r = await gc(env, k, "stats/hits", { start, end, limit: 100, include_paths: ids.join(",") });
  }
  return (r.hits || []).filter(h => h.path === "방문-하루" || h.path === "방문-새로" || /^광고-/.test(h.path));
}
const daily = (h, day) => ((h.stats || []).find(s => s.day === day) || {}).daily || 0;

async function adNames() {
  try { const r = await fetch(ADS_URL, { headers: { "User-Agent": UA } }); if (r.ok) return Object.fromEntries(((await r.json()).ads || []).map(a => [a.id, a.name])); } catch (e) {}
  return { lagrills: "라그릴스 셀프바베큐" };
}

async function build(env) {
  const now = kstNow(), today = ymd(now), yest = ymd(new Date(now.getTime() - 86400e3));
  const names = await adNames(), errs = [];
  // adminsnap.yml 이 30분마다 넣어 두는 방문·광고 숫자. 3시간보다 오래됐으면 쓰지 않고 직접 물음
  let vis = null, live = 0;
  try { const t = env.SNAP ? await env.SNAP.get("vis") : null; if (t) { const v = JSON.parse(t); if (Date.now() - v.at < 3 * 3600e3) vis = v; } } catch (e) {}
  const day = d => ({ date: d, total: 0, ad: 0, fresh: 0, regions: [], ads: {} });
  const nd = Math.round((Date.parse(today) - Date.parse(LAUNCH)) / 86400e3) + 1;
  const dates = [...Array(nd)].map((_, i) => ymd(new Date(Date.parse(LAUNCH) + i * 86400e3)));
  const H = Object.fromEntries(dates.map(d => [d, day(d)]));
  const T = H[today], Y = H[yest];
  for (const [k, nm] of CITIES) {
    let hs;
    const sv = vis && vis.city[k];
    if (sv) { if (sv.err) { errs.push(k + " " + sv.err); continue; } hs = sv.hits || []; }
    else if (live++ < 40) { try { hs = await cityHits(env, k); } catch (e) { errs.push(String(e.message || e)); continue; } }   // 모음에 없을 때만 직접 (무료 한도 50번 안에서)
    else { errs.push(k + " 건너뜀"); continue; }
    for (const d of dates) { const D = H[d];
      const v = hs.filter(h => h.path === "방문-하루").reduce((a, h) => a + daily(h, d), 0);
      D.total += v; D.regions.push({ name: nm, count: v });
      D.fresh += hs.filter(h => h.path === "방문-새로").reduce((a, h) => a + daily(h, d), 0);
      for (const h of hs.filter(h => /^광고-/.test(h.path))) {
        const n = daily(h, d); if (!n) continue;
        const id = h.path.split("-")[1] || "", an = names[id] || id;
        D.ad += n; D.ads[an] = (D.ads[an] || 0) + n;
      }
    }
  }
  if (errs.length === CITIES.length) throw new Error("통계를 하나도 못 읽음: " + errs[0]);
  const fin = D => ({ date: D.date, total: D.total, ad: D.ad,
    regions: D.regions.sort((a, b) => b.count - a.count),
    ads: Object.entries(D.ads).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count) });
  // 누적: cum = 하루 방문자를 시작한 날부터 더한 값(다시 온 사람도 그날마다 셈), people = 처음 온 사람 수를 더한 값(누적 방문객)
  let cum = 0, people = 0;
  const days = dates.map(d => { const D = fin(H[d]); cum += D.total; people += H[d].fresh;
    return { date: D.date, total: D.total, new: H[d].fresh, ad: D.ad, cum, people, regions: D.regions }; }).filter(x => x.cum > 0 || x.date === today);
  const visits = { ...fin(T), new: T.fresh, cum, people, updated: (vis ? new Date(vis.at + 9 * 3600e3) : now).toISOString().slice(11, 16) };
  return { data: { health: errs.length ? "warn" : "ok",
    summary: `오늘 방문 ${visits.total}명` + (visits.ad ? ` · 광고 ${visits.ad}` : "") + (errs.length ? ` (도시 ${errs.length}곳 못 읽음)` : ""),
    visits, yesterday: fin(Y),
    // 날짜별 (시작한 날 → 오늘): total 그날 방문자, new 처음 온 사람, cum 누적 방문, people 누적 방문객
    days }, errs };
}

async function send(env) {
  if (!env.KWANJE_URL || !env.KWANJE_TOKEN) return { sent: false, why: "관제 주소나 토큰이 아직 없음" };
  const { data, errs } = await build(env);
  const url = env.KWANJE_URL.replace(/\/+$/, "") + "/api/ingest/local-info/status";
  try {
    const r = await fetch(url, { method: "POST", signal: AbortSignal.timeout(5000),
      headers: { Authorization: "Bearer " + env.KWANJE_TOKEN, "Content-Type": "application/json; charset=utf-8", "User-Agent": UA },
      body: JSON.stringify(data) });
    return { sent: r.ok, status: r.status, reply: (await r.text()).slice(0, 200), data, errs };
  } catch (e) { return { sent: false, why: "관제 연결 실패: " + String(e.message || e).slice(0, 120), data, errs }; }
}

function info(env) {
  let host = "";
  try { host = env.KWANJE_URL ? new URL(env.KWANJE_URL).host : ""; } catch (e) { host = "주소 형식 오류"; }
  return { url_set: !!env.KWANJE_URL, host, token_last4: env.KWANJE_TOKEN ? env.KWANJE_TOKEN.slice(-4) : "", every: "10분" };
}

// 관리자 화면(아이랑 관리자)에서 부를 때: 관리자 GoatCounter 키가 맞는지 GoatCounter에 물어서 확인
async function isAdmin(req, env) {
  const a = req.headers.get("Authorization") || "";
  if (env.RUN_KEY && a === "Bearer " + env.RUN_KEY) return true;      // 배포할 때 스스로 시험하는 키
  if (!/^Bearer .{10,}$/.test(a)) return false;
  try { const r = await fetch("https://yongin-edu-app.goatcounter.com/api/v0/me", { headers: { Authorization: a, "User-Agent": UA } }); return r.ok; } catch (e) { return false; }
}

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Authorization, Content-Type", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" };
const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "Content-Type": "application/json; charset=utf-8", ...CORS } });

export default {
  async scheduled(ev, env, ctx) { ctx.waitUntil(send(env).then(r => console.log(r.sent ? "보냄" : "못 보냄", r.status || r.why || ""))); },
  async fetch(req, env) {
    if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
    const p = new URL(req.url).pathname;
    if (p === "/") return json({ name: "아이랑 → 관제 방문 통계" });
    if (!(await isAdmin(req, env))) return json({ error: "관리자 키 필요" }, 401);
    if (p === "/preview") { try { const { data, errs } = await build(env); return json({ ...info(env), data, errs }); } catch (e) { return json({ ...info(env), error: String(e.message || e) }, 502); } }
    if (p === "/send" && req.method === "POST") return json({ ...info(env), ...(await send(env)) });
    if (p === "/snap") {   // 미리 모아 둔 통계 + 푸는 열쇠 (회사 인터넷에서 GitHub·GoatCounter가 막혀도 이 주소 하나면 됨)
      const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("airang-snap:" + (env.GC_KEY_YONGIN || "")));
      const t = env.SNAP ? await env.SNAP.get("snap") : null;   // adminsnap.yml 이 넣어 둔 것 (저장소가 비공개라 GitHub 주소로는 못 읽음)
      if (!t) return json({ error: "모음 파일 없음" }, 502);
      return json({ ...JSON.parse(t), key: btoa(String.fromCharCode(...new Uint8Array(d))) });
    }
    if (p === "/snapkey") {   // 관리자 화면이 미리 모아 둔 통계(snap.json)를 풀 열쇠 — 관리자 키를 확인한 뒤에만 준다
      const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("airang-snap:" + (env.GC_KEY_YONGIN || "")));
      return json({ key: btoa(String.fromCharCode(...new Uint8Array(d))) });
    }
    return json({ error: "없는 주소" }, 404);
  },
};
