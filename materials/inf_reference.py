"""Independent Python reference for the serving bench (learn-llm-inference-with-phoebe).

Reads assets/inf-sample.js and recomputes every number the bench prints with the same rules as
assets/inf-live.js: Part A router ladder, Part B capacity model + seeded arrival queue, Part C cache
pricing, and the stacked plan. Prints the canon as JSON. Compare with materials/inf-node.js by VALUE
using materials/compare-ladder.py (relative tolerance 1e-9; a planted 0.1% fault must fail).
Usage: python3 inf_reference.py <repo>/assets/inf-sample.js
"""
import json, math, sys

# ---- constants (each tagged in materials/official-course-map.md) ----
SYS = 1200            # [C] Kiln's static system prompt + tool definitions, tokens
BAR = 4               # [C] "good enough": judge score 4 or 5
FLOOR = 0.95          # [C] Kiln's acceptable-answer floor
SHUF = 7919           # break button: score of row (i*7919) mod N, a fixed scramble
PRICES = {            # [S] list prices per 1M tokens, read 2026-11-08, re-verify
    "gpt41": {"big": (2.00, 8.00), "small": (0.40, 1.60)},
    "gpt5": {"big": (1.25, 10.00), "small": (0.25, 2.00)},
    "paper": {"big": (10.00, 30.00), "small": (0.24, 0.24)},   # RouteLLM paper's assumed prices
}
GPUS = {  # [S] memory GB, bandwidth GB/s, dense BF16 TFLOPS (sparsity figure halved), $/h HF Endpoints AWS
    "L4": (24, 300, 121.0, 0.80), "A100": (80, 2039, 312.0, 2.50), "H100": (80, 3350, 989.5, 4.50)}
MODELS = {  # [S] from config.json; params computed from those shapes
    "llama8b": (8030261248, 32, 8, 128), "llama70b": (70553706496, 80, 8, 128)}
WBYTES = {"bf16": 2.0, "fp8": 1.0, "int8": 1.0, "int4": 0.5}
KVBYTES = {"bf16": 2.0, "fp8": 1.0}
UTIL, RESERVE, EFF_BW, MFU, CAP, MAXLEN = 0.90, 1.5e9, 0.6, 0.5, 256, 4096   # [M]/[C] modelling choices
NREQ = 1000
LAMS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10, 12, 14, 16, 20, 24, 32]
SLO = 1.0             # [C] Kiln's p95 time-to-first-token target, seconds
VOLUME, PEAK, HOURS = 1500000, 3.0, 730   # [C] requests/month, peak-to-average, hours/month
CACHE = {  # [S] per 1M base input, output, write multiplier, read multiplier, minimum cacheable tokens
    "sonnet45": (3.00, 15.00, 1.25, 0.10, 1024), "haiku45": (1.00, 5.00, 1.25, 0.10, 4096),
    "gpt41": (2.00, 8.00, 1.00, 0.25, 1024)}
SEM = {"off": (0.0, 0.0), "short": (0.10, 0.02), "long": (0.25, 0.08)}   # [C] semantic cache hit share, wrong-answer rate

def load(path):
    t = open(path, encoding="utf-8").read()
    return json.loads(t[t.index("{"): t.rindex("}") + 1])

# ---------------- Part A: router ----------------
def row_cost(R, i, side, preset, cache=None):
    pin, pout = PRICES[preset][side]
    tin = SYS + R["pin"][i]
    tout = R["ob"][i] if side == "big" else R["os"][i]
    if cache is None:
        return (tin * pin + tout * pout) / 1e6
    write, read, hit = cache
    cached = SYS
    return ((cached * (hit * read + (1 - hit) * write) + (tin - cached)) * pin + tout * pout) / 1e6

def decide(R, policy, i, t):
    n = len(R["s"])
    if policy == "learned": return R["s"][i] >= t
    if policy == "shuffled": return R["s"][(i * SHUF) % n] >= t
    if policy == "length": return R["pin"][i] <= t
    if policy == "oracle": return R["q"][i] >= BAR
    if policy == "allbig": return False
    if policy == "allsmall": return True
    raise ValueError(policy)

def route(R, policy, t, preset="gpt41", cache=None):
    n = len(R["s"]); ns = 0; good = 0; cost = 0.0; big_cost = 0.0
    for i in range(n):
        small = decide(R, policy, i, t)
        big_cost += row_cost(R, i, "big", preset)
        if small:
            ns += 1; ok = R["q"][i] >= BAR; good += 1 if ok else 0
            cost += row_cost(R, i, "small", preset)
        else:
            cost += row_cost(R, i, "big", preset, cache)
    acc = (n - ns) + good
    return {"nSmall": ns, "shareSmall": ns / n, "acceptable": acc, "acceptRate": acc / n,
            "badShipped": ns - good, "cost1k": cost / n * 1000, "allBig1k": big_cost / n * 1000,
            "saving": 1 - cost / big_cost}

TGRID = list(range(0, 700, 100)) + list(range(700, 960, 10)) + [1000, 1001]
SWEEP = {"learned": TGRID, "shuffled": TGRID,
         "length": [0, 10, 20, 30, 50, 75, 100, 150, 200, 300, 500, 1000, 100000]}

def frontier(R, policy, preset="gpt41"):
    return [dict(t=t, **route(R, policy, t, preset)) for t in SWEEP[policy]]

def cheapest_at_floor(fr, floor=FLOOR):
    best = None
    for p in fr:
        if p["acceptRate"] >= floor - 1e-12 and (best is None or p["cost1k"] < best["cost1k"]):
            best = p
    return best

def auc(score, q):
    pos = [score[i] for i in range(len(q)) if q[i] >= BAR]; neg = [score[i] for i in range(len(q)) if q[i] < BAR]
    w = 0.0
    for a in pos:
        for b in neg:
            w += 1.0 if a > b else (0.5 if a == b else 0.0)
    return w / (len(pos) * len(neg))

# ---------------- Part B: capacity ----------------
def mem(R, gpu, model, w, kv, paged=True):
    memgb, bw, tf, price = GPUS[gpu]; params, L, kvh, hd = MODELS[model]
    weights = params * WBYTES[w]; usable = memgb * 1e9 * UTIL; pool = usable - weights - RESERVE
    kvtok = 2 * L * kvh * hd * KVBYTES[kv]
    n = len(R["pin"]); ctx = 0
    for i in range(n): ctx += SYS + R["pin"][i] + R["os"][i]
    avg = ctx / n
    pooltok = math.floor(pool / kvtok) if pool > 0 else 0
    ceil_paged = math.floor(pooltok / avg); ceil_static = math.floor(pooltok / MAXLEN)
    return {"weightsGB": weights / 1e9, "usableGB": usable / 1e9, "poolGB": pool / 1e9, "fits": pool > 0,
            "kvPerTokKB": kvtok / 1024, "poolTokens": pooltok, "avgCtx": avg,
            "ceilPaged": ceil_paged, "ceilStatic": ceil_static,
            "seqCap": min(CAP, ceil_paged if paged else ceil_static)}

def step_fns(gpu, model, w, kv):
    memgb, bw, tf, price = GPUS[gpu]; params, L, kvh, hd = MODELS[model]
    weights = params * WBYTES[w]; kvtok = 2 * L * kvh * hd * KVBYTES[kv]
    def decode(B, ctxsum):
        return max((weights + ctxsum * kvtok) / (bw * 1e9 * EFF_BW), 2 * params * B / (tf * 1e12 * MFU))
    def prefill(ntok):
        return max(2 * params * ntok / (tf * 1e12 * MFU), weights / (bw * 1e9 * EFF_BW))
    return decode, prefill

def simulate(R, G, cfg, lam):
    gpu, model, w, kv = cfg["gpu"], cfg["model"], cfg["w"], cfg["kv"]
    paged = cfg.get("paged", True); static = cfg.get("mode", "cont") == "static"; pref = cfg.get("prefix", False)
    cap = cfg.get("cap", CAP)
    m = mem(R, gpu, model, w, kv, paged)
    if not m["fits"]: return None
    decode, prefill = step_fns(gpu, model, w, kv)
    n = len(R["pin"]); scale = G["gapScale"]
    arr = []; t = 0.0
    for j in range(NREQ):
        t += G["gaps"][j] / scale / lam; arr.append(t)
    tin = [SYS + R["pin"][j % n] for j in range(NREQ)]
    tout = [max(1, R["os"][j % n]) for j in range(NREQ)]
    ptok = [R["pin"][j % n] if pref else tin[j] for j in range(NREQ)]
    need = [(tin[j] + tout[j]) if paged else MAXLEN for j in range(NREQ)]
    slots = min(cap, m["ceilPaged"] if paged else m["ceilStatic"])
    if slots < 1 or max(need) > m["poolTokens"]: return None
    ttft = [0.0] * NREQ; first = [0.0] * NREQ; fin = [0.0] * NREQ
    waiting = []; wh = 0; running = []; used = 0; nxt = 0; done = 0; now = 0.0
    bsum = 0; bcount = 0; peak = 0
    while done < NREQ:
        while nxt < NREQ and arr[nxt] <= now:
            waiting.append(nxt); nxt += 1
        if not running and wh >= len(waiting):
            now = arr[nxt]; continue
        adm = []
        if static:
            if not running:
                while wh < len(waiting) and len(adm) < slots:
                    adm.append(waiting[wh]); wh += 1
        else:
            while wh < len(waiting) and len(running) + len(adm) < slots and used + need[waiting[wh]] <= m["poolTokens"]:
                j = waiting[wh]; adm.append(j); used += need[j]; wh += 1
        dt = 0.0
        for j in adm: dt += prefill(ptok[j])
        B = len(running)
        if B > 0:
            cs = 0
            for r in running: cs += r[2]
            dt += decode(B, cs); bsum += B; bcount += 1
        now += dt
        keep = []
        for r in running:
            r[1] -= 1; r[2] += 1
            if r[1] <= 0:
                fin[r[0]] = now; done += 1
                if not static: used -= need[r[0]]
            else:
                keep.append(r)
        for j in adm:
            ttft[j] = now - arr[j]; first[j] = now
            if tout[j] <= 1:
                fin[j] = now; done += 1
                if not static: used -= need[j]
            else:
                keep.append([j, tout[j] - 1, tin[j] + 1])
        running = keep
        if len(running) > peak: peak = len(running)
    st = sorted(ttft)
    span = now - arr[0]; outtok = 0
    for j in range(NREQ): outtok += tout[j]
    tp = 0.0; tc = 0
    for j in range(NREQ):
        if tout[j] > 1: tp += (fin[j] - first[j]) / (tout[j] - 1); tc += 1
    return {"p50": st[math.ceil(0.5 * NREQ) - 1], "p95": st[math.ceil(0.95 * NREQ) - 1],
            "tokPerS": outtok / span, "reqPerS": NREQ / span, "meanBatch": bsum / bcount if bcount else 0,
            "peakBatch": peak, "tpot": tp / tc, "slots": slots}

def sweep(R, G, cfg):
    gpu = cfg["gpu"]; price = GPUS[gpu][3]
    pts = []; best = None
    for lam in LAMS:
        s = simulate(R, G, cfg, lam)
        if s is None: return {"fits": False, "points": [], "lamMax": 0}
        pts.append(dict(lam=lam, p95=s["p95"], p50=s["p50"], tokPerS=s["tokPerS"], meanBatch=s["meanBatch"], tpot=s["tpot"]))
        if s["p95"] <= SLO: best = (lam, s)
    m = mem(R, gpu, cfg["model"], cfg["w"], cfg["kv"], cfg.get("paged", True))
    decode, prefill = step_fns(gpu, cfg["model"], cfg["w"], cfg["kv"])
    out = {"fits": True, "points": pts, "mem": m, "decode1ms": decode(1, m["avgCtx"]) * 1000,
           "prefillMs": prefill(SYS + 0) * 1000, "lamMax": best[0] if best else 0}
    if best:
        lam, s = best
        out["cost1kReq"] = price / (lam * 3600) * 1000
        out["costPer1MOut"] = price / (s["tokPerS"] * 3600) * 1e6
        out["tokPerSAtSlo"] = s["tokPerS"]
    return out

def mix(R, gpu, model="llama8b", w="bf16"):
    n = len(R["pin"]); st = 0; sb = 0; ss = 0
    for i in range(n): st += SYS + R["pin"][i]; sb += R["ob"][i]; ss += R["os"][i]
    mt = st / n; mb = sb / n; ms = ss / n
    incost = st * 2.00 / 1e6; outcost = sb * 8.00 / 1e6
    decode, prefill = step_fns(gpu, model, w, "bf16")
    pre = prefill(mt) * 1000; dec = decode(1, mt + mb / 2) * 1000
    return {"meanTin": mt, "meanOb": mb, "meanOs": ms, "inputShare": incost / (incost + outcost),
            "prefillMs": pre, "decodeMs": dec, "answerMs": mb * dec, "prefillPerTokMs": pre / mt,
            "decodeOverPrefillTok": dec / (pre / mt)}

# ---------------- Part C: cache ----------------
def cache_cost(R, preset, layout, hit, sem="off"):
    pin, pout, write, read, minimum = CACHE[preset]
    n = len(R["pin"]); base = 0.0; withc = 0.0
    engaged = layout == "static-first" and SYS >= minimum
    for i in range(n):
        tin = SYS + R["pin"][i]; tout = R["ob"][i]
        b = (tin * pin + tout * pout) / 1e6; base += b
        if engaged:
            withc += ((SYS * (hit * read + (1 - hit) * write) + (tin - SYS)) * pin + tout * pout) / 1e6
        else:
            withc += b
    sh, wr = SEM[sem]
    c1k = withc / n * 1000; s1k = (1 - sh) * c1k
    return {"base1k": base / n * 1000, "cache1k": c1k, "engaged": engaged, "after1k": s1k,
            "saving": 1 - s1k / (base / n * 1000), "wrongPer1k": 1000 * sh * wr,
            "breakEvenHit": (write - 1) / (write - read) if write > 1 else 0.0}

# ---------------- the stacked plan ----------------
def plan(R, G, p):
    pol = p.get("policy", "learned") if p["router"] else "allbig"
    r = route(R, pol, p["t"], "gpt41",
              (1.0, 0.25, p["hit"]) if p["cache"] else None)
    n = len(R["s"]); share = r["shareSmall"]
    bigc = 0.0; smallc = 0.0
    for i in range(n):
        if decide(R, pol, i, p["t"]):
            smallc += row_cost(R, i, "small", "gpt41")
        else:
            bigc += row_cost(R, i, "big", "gpt41", (1.0, 0.25, p["hit"]) if p["cache"] else None)
    big_month = bigc / n * VOLUME
    peak_small = VOLUME / (30 * 86400) * PEAK * share
    if p["small"] == "api":
        small_month = smallc / n * VOLUME; replicas = 0; lam_max = None
    else:
        sw = sweep(R, G, p["cfg"]); lam_max = sw["lamMax"]
        peak = VOLUME / (30 * 86400) * PEAK * share
        if share == 0: replicas = 0
        elif lam_max == 0: replicas = -1
        else: replicas = math.ceil(peak / lam_max)
        small_month = replicas * GPUS[p["cfg"]["gpu"]][3] * HOURS if replicas >= 0 else float("inf")
    total = big_month + small_month
    base = route(R, "allbig", 0, "gpt41")["cost1k"] / 1000 * VOLUME
    return {"shareSmall": share, "acceptRate": r["acceptRate"], "bigMonth": big_month, "smallMonth": small_month,
            "replicas": replicas, "lamMax": lam_max, "peakSmall": peak_small, "total": total, "per1k": total / VOLUME * 1000,
            "baseline": base, "saving": 1 - total / base, "clearsFloor": r["acceptRate"] >= FLOOR - 1e-12}

CFGS = {
    "l4_bf16": {"gpu": "L4", "model": "llama8b", "w": "bf16", "kv": "bf16"},
    "l4_fp8": {"gpu": "L4", "model": "llama8b", "w": "fp8", "kv": "bf16"},
    "l4_int4": {"gpu": "L4", "model": "llama8b", "w": "int4", "kv": "bf16"},
    "l4_fp8_kv8": {"gpu": "L4", "model": "llama8b", "w": "fp8", "kv": "fp8"},
    "l4_fp8_static": {"gpu": "L4", "model": "llama8b", "w": "fp8", "kv": "bf16", "mode": "static", "paged": False},
    "l4_fp8_nopage": {"gpu": "L4", "model": "llama8b", "w": "fp8", "kv": "bf16", "paged": False},
    "l4_fp8_prefix": {"gpu": "L4", "model": "llama8b", "w": "fp8", "kv": "bf16", "prefix": True},
    "a100_bf16": {"gpu": "A100", "model": "llama8b", "w": "bf16", "kv": "bf16"},
    "h100_bf16": {"gpu": "H100", "model": "llama8b", "w": "bf16", "kv": "bf16"},
    "h100_70b_bf16": {"gpu": "H100", "model": "llama70b", "w": "bf16", "kv": "bf16"},
    "h100_70b_int4": {"gpu": "H100", "model": "llama70b", "w": "int4", "kv": "bf16"},
}
PLANS = {
    "baseline": {"router": False, "t": 1001, "small": "api", "cache": False, "hit": 0.9},
    "routerApi": {"router": True, "t": 870, "small": "api", "cache": False, "hit": 0.9},
    "routerSelf": {"router": True, "t": 870, "small": "self", "cfg": CFGS["l4_fp8_prefix"], "cache": False, "hit": 0.9},
    "full": {"router": True, "t": 870, "small": "self", "cfg": CFGS["l4_fp8_prefix"], "cache": True, "hit": 0.9},
    "allSmallSelf": {"router": True, "t": 0, "small": "self", "cfg": CFGS["l4_fp8_prefix"], "cache": True, "hit": 0.9},
    "shuffledFull": {"router": True, "policy": "shuffled", "t": 870, "small": "self", "cfg": CFGS["l4_fp8_prefix"], "cache": True, "hit": 0.9},
    "fullH100": {"router": True, "t": 870, "small": "self", "cfg": CFGS["h100_bf16"], "cache": True, "hit": 0.9},
    "cacheOnly": {"router": False, "t": 1001, "small": "api", "cache": True, "hit": 0.9},
}

def canon(R, G):
    out = {"rows": len(R["s"]), "goodShare": sum(1 for q in R["q"] if q >= BAR) / len(R["q"]),
           "auc": {"learned": auc(R["s"], R["q"]),
                   "shuffled": auc([R["s"][(i * SHUF) % len(R["s"])] for i in range(len(R["s"]))], R["q"]),
                   "length": auc([-x for x in R["pin"]], R["q"])},
           "mix": {"L4": mix(R, "L4"), "H100": mix(R, "H100")},
           "router": {}, "atFloor": {}, "three": {}, "presets": {}, "capacity": {}, "cache": {}, "plans": {}}
    for pol in ("learned", "shuffled", "length"):
        fr = frontier(R, pol); out["router"][pol] = fr
        out["atFloor"][pol] = cheapest_at_floor(fr)
    for pol in ("oracle", "allbig", "allsmall"):
        out["router"][pol] = route(R, pol, 0)
    for t in (850, 870, 900):
        out["three"][str(t)] = route(R, "learned", t)
    for pr in ("gpt41", "gpt5", "paper"):
        out["presets"][pr] = {"t870": route(R, "learned", 870, pr), "allbig": route(R, "allbig", 0, pr),
                              "allsmall": route(R, "allsmall", 0, pr)}
    for k, cfg in CFGS.items():
        out["capacity"][k] = sweep(R, G, cfg)
    for pr in CACHE:
        for lay in ("dynamic-first", "static-first"):
            out["cache"][pr + "|" + lay] = cache_cost(R, pr, lay, 0.9)
    out["cache"]["sonnet45|static-first|h0.5"] = cache_cost(R, "sonnet45", "static-first", 0.5)
    out["cache"]["sonnet45|static-first|h0.1"] = cache_cost(R, "sonnet45", "static-first", 0.1)
    for s in ("short", "long"):
        out["cache"]["sonnet45|static-first|" + s] = cache_cost(R, "sonnet45", "static-first", 0.9, s)
    for k, p in PLANS.items():
        out["plans"][k] = plan(R, G, p)
    return out

if __name__ == "__main__":
    d = load(sys.argv[1])
    print(json.dumps(canon(d["rows"], {"gaps": d["gaps"], "gapScale": d["gapScale"]}), indent=1))
