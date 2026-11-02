"""아이랑 방문 통계 모으기 — GoatCounter에서 숫자만 가져와 이 비공개 저장소에 저장한다.
API 키는 GitHub Secrets(GC_KEY_YONGIN, GC_KEY_SUWON)에만 있고 파일에는 남기지 않는다."""
import json, os, time, urllib.parse, urllib.request
from datetime import datetime, timedelta, timezone

KST = timezone(timedelta(hours=9))
SITES = {"yongin": ("https://yongin-edu-app.goatcounter.com", "GC_KEY_YONGIN"),
         "suwon": ("https://suwon-edu-app.goatcounter.com", "GC_KEY_SUWON")}

def iso(d): return d.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

UA = "airang-stats/1.0 (+https://github.com/leejunsik22-gif/airang-stats)"

# GoatCounter가 클라우드 서버 접속을 끊는 때가 있어(2026-10-15~) 직접 → Cloudflare 중계기 순으로 먼저 한 번 확인한다.
RELAY_URL = open("relay.txt").read().strip() if os.path.exists("relay.txt") else ""
RELAY = ""

def reachable(url):
    try:
        urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA, "Authorization": "Bearer probe"}), timeout=15); return True
    except urllib.error.HTTPError as e:
        return e.code < 500 or e.code in (502, 503)   # 401·404도 "접속은 됨"
    except Exception as e:
        print("  접속 안 됨:", url.split("?")[0], repr(e)[:80]); return False

def pick_route():
    global RELAY
    if reachable("https://yongin-edu-app.goatcounter.com/api/v0/me"): print("경로: 직접"); return True
    if RELAY_URL and reachable(RELAY_URL + "/api/v0/me?site=yongin-edu-app"): RELAY = RELAY_URL; print("경로: Cloudflare 중계기"); return True
    return False

def api(base, key, path, **params):
    if RELAY:
        site = base.split("//")[1].split(".")[0]
        url = f"{RELAY}/api/v0/{path}?" + urllib.parse.urlencode({"site": site, **params})
    else:
        url = f"{base}/api/v0/{path}?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"Authorization": "Bearer " + key, "Content-Type": "application/json",
                                               "User-Agent": UA})
    waits = [3, 8, 15, 30, 45]   # 접속 끊김(Connection reset)·시간초과는 기다렸다 다시 시도
    for i in range(len(waits) + 1):
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                time.sleep(1.0)   # 1초 4번 제한보다 여유 있게
                return json.loads(r.read())
        except urllib.error.HTTPError as e:
            if e.code in (401, 403): raise SystemExit(f"{path}: 키가 맞지 않거나 권한 없음 ({e.code})")
            if e.code not in (429, 500, 502, 503, 504) or i == len(waits): raise
            print(f"  {path}: HTTP {e.code}, {waits[i]}초 뒤 다시 ({i+1}/{len(waits)})")
        except (urllib.error.URLError, ConnectionError, TimeoutError, OSError) as e:
            if i == len(waits): raise
            print(f"  {path}: 접속 오류 {e}, {waits[i]}초 뒤 다시 ({i+1}/{len(waits)})")
        time.sleep(waits[i])
    return {}

def collect(name, base, key):
    now = datetime.now(KST)
    mid = now.replace(hour=0, minute=0, second=0, microsecond=0)
    end = iso(now.replace(minute=0, second=0, microsecond=0) + timedelta(hours=1))
    out = {"site": name, "at": now.strftime("%Y-%m-%d %H:%M")}
    out["total_14d"] = api(base, key, "stats/total", start=iso(mid - timedelta(days=13)), end=end)
    out["refs_today"] = api(base, key, "stats/toprefs", start=iso(mid), end=end, limit=20)
    out["refs_7d"] = api(base, key, "stats/toprefs", start=iso(mid - timedelta(days=6)), end=end, limit=20)
    rows, ex, more = [], [], True
    for _ in range(8):
        if not more: break
        p = {"start": iso(mid - timedelta(days=13)), "end": end, "limit": 100}
        if ex: p["exclude_paths"] = ",".join(map(str, ex))
        r = api(base, key, "stats/hits", **p)
        hs = r.get("hits") or []
        rows += hs; ex += [h.get("path_id") for h in hs]; more = bool(r.get("more")) and bool(hs)
    out["hits_14d"] = rows
    os.makedirs(f"data/{name}", exist_ok=True)
    for fn in (f"data/{name}/latest.json", f"data/{name}/{now:%Y-%m-%d}.json"):
        with open(fn, "w", encoding="utf-8") as f: json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    print(name, "ok", len(rows), "paths")

if __name__ == "__main__":
    if not pick_route():
        print("::warning::GoatCounter가 서버 접속을 막고 있어 이번 시간은 건너뜀 (데이터는 GoatCounter에 계속 쌓임, 다음에 다시 시도)")
        raise SystemExit(0)
    done, failed = 0, []
    for name, (base, env) in SITES.items():
        key = os.environ.get(env, "").strip()
        if not key: print(name, ": 키 없음, 건너뜀"); continue
        try:
            collect(name, base, key); done += 1
        except SystemExit: raise
        except Exception as e:   # 한 곳이 실패해도 다른 곳은 저장되게
            print(name, "실패:", repr(e)); failed.append(name)
    if not done: raise SystemExit("모두 실패 또는 등록된 키가 없어요: " + ", ".join(failed))
    if failed: print("::warning::일부 실패:", ", ".join(failed))
