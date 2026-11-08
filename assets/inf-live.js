/* inf-live.js - the serving bench for learn-llm-inference-with-phoebe
 *
 * Part A, the router. 2,000 REAL prompts from RouteLLM's released dataset (routellm/gpt4_dataset,
 *   Apache-2.0). Per row: a judge score (GPT-4 scoring Mixtral 8x7B's answer, 1-5), token counts
 *   estimated as characters / 4, and the score of a cheap text-only router (a 12-feature logistic
 *   regression fit on the dataset's train split, materials/build-inf-sample.py). Routing,
 *   acceptable-answer rate and cost per 1,000 requests are COMPUTED here for every threshold.
 *   BREAK BUTTON "scramble the router": each row reads another row's score, so the signal goes.
 *   ANTI-LEVER "send everything small": the cheapest line, under the quality floor.
 * Part B, capacity. A MODEL, labelled on the widget: decode time from memory bandwidth and bytes
 *   read per step, prefill from compute, KV memory per token from the model config, and a seeded
 *   arrival queue (continuous or static batching) that measures p95 time to first token.
 * Part C, cache. Prompt-cache multipliers (list prices read 2026-11-08) x hit rate -> blended cost,
 *   plus a semantic answer cache whose hit share and wrong-answer rate are CONSTRUCTED inputs.
 * The plan stacks A + B + C into Kiln's monthly bill against the all-big baseline.
 * materials/inf_reference.py repeats every step in Python and prints the same canon.
 */
(function (root) {
  "use strict";

  /* ---------- constants (mirrors materials/inf_reference.py; tiers in the course map) ---------- */
  var SYS = 1200, BAR = 4, FLOOR = 0.95, SHUF = 7919;
  var PRICES = {
    gpt41: { label: "gpt-4.1 / gpt-4.1-mini", big: [2.00, 8.00], small: [0.40, 1.60] },
    gpt5: { label: "gpt-5 / gpt-5-mini", big: [1.25, 10.00], small: [0.25, 2.00] },
    paper: { label: "RouteLLM paper's 2024 prices: GPT-4 / Mixtral", big: [10.00, 30.00], small: [0.24, 0.24] }
  };
  var GPUS = { L4: [24, 300, 121.0, 0.80], A100: [80, 2039, 312.0, 2.50], H100: [80, 3350, 989.5, 4.50] };
  var MODELS = { llama8b: [8030261248, 32, 8, 128], llama70b: [70553706496, 80, 8, 128] };
  var MODEL_LABEL = { llama8b: "Llama 3.1 8B", llama70b: "Llama 3.1 70B" };
  var WBYTES = { bf16: 2.0, fp8: 1.0, int8: 1.0, int4: 0.5 };
  var KVBYTES = { bf16: 2.0, fp8: 1.0 };
  var UTIL = 0.90, RESERVE = 1.5e9, EFF_BW = 0.6, MFU = 0.5, CAP = 256, MAXLEN = 4096;
  var NREQ = 1000;
  var LAMS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10, 12, 14, 16, 20, 24, 32];
  var SLO = 1.0;
  var VOLUME = 1500000, PEAK = 3.0, HOURS = 730;
  var CACHE = {
    sonnet45: [3.00, 15.00, 1.25, 0.10, 1024], haiku45: [1.00, 5.00, 1.25, 0.10, 4096],
    gpt41: [2.00, 8.00, 1.00, 0.25, 1024]
  };
  var CACHE_LABEL = { sonnet45: "Claude Sonnet 4.5", haiku45: "Claude Haiku 4.5", gpt41: "gpt-4.1" };
  var SEM = { off: [0.0, 0.0], "short": [0.10, 0.02], "long": [0.25, 0.08] };

  /* ---------- Part A: router ---------- */
  function rowCost(R, i, side, preset, cache) {
    var pr = PRICES[preset][side], pin = pr[0], pout = pr[1];
    var tin = SYS + R.pin[i];
    var tout = side === "big" ? R.ob[i] : R.os[i];
    if (!cache) return (tin * pin + tout * pout) / 1e6;
    var write = cache[0], read = cache[1], hit = cache[2], cached = SYS;
    return ((cached * (hit * read + (1 - hit) * write) + (tin - cached)) * pin + tout * pout) / 1e6;
  }
  function decide(R, policy, i, t) {
    var n = R.s.length;
    if (policy === "learned") return R.s[i] >= t;
    if (policy === "shuffled") return R.s[(i * SHUF) % n] >= t;
    if (policy === "length") return R.pin[i] <= t;
    if (policy === "oracle") return R.q[i] >= BAR;
    if (policy === "allbig") return false;
    if (policy === "allsmall") return true;
    throw new Error(policy);
  }
  function route(R, policy, t, preset, cache) {
    preset = preset || "gpt41";
    var n = R.s.length, ns = 0, good = 0, cost = 0.0, bigCost = 0.0;
    for (var i = 0; i < n; i++) {
      var small = decide(R, policy, i, t);
      bigCost += rowCost(R, i, "big", preset);
      if (small) {
        ns += 1; if (R.q[i] >= BAR) good += 1;
        cost += rowCost(R, i, "small", preset);
      } else {
        cost += rowCost(R, i, "big", preset, cache);
      }
    }
    var acc = (n - ns) + good;
    return { nSmall: ns, shareSmall: ns / n, acceptable: acc, acceptRate: acc / n, badShipped: ns - good,
             cost1k: cost / n * 1000, allBig1k: bigCost / n * 1000, saving: 1 - cost / bigCost };
  }
  var TGRID = [];
  (function () { var t; for (t = 0; t < 700; t += 100) TGRID.push(t); for (t = 700; t < 960; t += 10) TGRID.push(t); TGRID.push(1000, 1001); })();
  var SWEEP = { learned: TGRID, shuffled: TGRID, length: [0, 10, 20, 30, 50, 75, 100, 150, 200, 300, 500, 1000, 100000] };
  function frontier(R, policy, preset) {
    return SWEEP[policy].map(function (t) {
      var r = route(R, policy, t, preset), o = { t: t };
      for (var k in r) o[k] = r[k];
      return o;
    });
  }
  function cheapestAtFloor(fr, floor) {
    if (floor === undefined) floor = FLOOR;
    var best = null;
    fr.forEach(function (p) { if (p.acceptRate >= floor - 1e-12 && (best === null || p.cost1k < best.cost1k)) best = p; });
    return best;
  }
  function auc(score, q) {
    var pos = [], neg = [], i, j, w = 0.0;
    for (i = 0; i < q.length; i++) { if (q[i] >= BAR) pos.push(score[i]); else neg.push(score[i]); }
    for (i = 0; i < pos.length; i++) for (j = 0; j < neg.length; j++) w += pos[i] > neg[j] ? 1.0 : (pos[i] === neg[j] ? 0.5 : 0.0);
    return w / (pos.length * neg.length);
  }

  /* ---------- Part B: capacity (a MODEL) ---------- */
  function mem(R, gpu, model, w, kv, paged) {
    if (paged === undefined) paged = true;
    var g = GPUS[gpu], m = MODELS[model];
    var weights = m[0] * WBYTES[w], usable = g[0] * 1e9 * UTIL, pool = usable - weights - RESERVE;
    var kvtok = 2 * m[1] * m[2] * m[3] * KVBYTES[kv];
    var n = R.pin.length, ctx = 0;
    for (var i = 0; i < n; i++) ctx += SYS + R.pin[i] + R.os[i];
    var avg = ctx / n;
    var pooltok = pool > 0 ? Math.floor(pool / kvtok) : 0;
    var cp = Math.floor(pooltok / avg), cs = Math.floor(pooltok / MAXLEN);
    return { weightsGB: weights / 1e9, usableGB: usable / 1e9, poolGB: pool / 1e9, fits: pool > 0,
             kvPerTokKB: kvtok / 1024, poolTokens: pooltok, avgCtx: avg, ceilPaged: cp, ceilStatic: cs,
             seqCap: Math.min(CAP, paged ? cp : cs) };
  }
  function stepFns(gpu, model, w, kv) {
    var g = GPUS[gpu], m = MODELS[model], params = m[0];
    var weights = params * WBYTES[w], kvtok = 2 * m[1] * m[2] * m[3] * KVBYTES[kv];
    var bw = g[1], tf = g[2];
    return {
      decode: function (B, ctxsum) { return Math.max((weights + ctxsum * kvtok) / (bw * 1e9 * EFF_BW), 2 * params * B / (tf * 1e12 * MFU)); },
      prefill: function (ntok) { return Math.max(2 * params * ntok / (tf * 1e12 * MFU), weights / (bw * 1e9 * EFF_BW)); }
    };
  }
  function simulate(R, G, cfg, lam) {
    var paged = cfg.paged === undefined ? true : cfg.paged, stat = (cfg.mode || "cont") === "static";
    var pref = !!cfg.prefix, cap = cfg.cap === undefined ? CAP : cfg.cap;
    var m = mem(R, cfg.gpu, cfg.model, cfg.w, cfg.kv, paged);
    if (!m.fits) return null;
    var f = stepFns(cfg.gpu, cfg.model, cfg.w, cfg.kv);
    var n = R.pin.length, scale = G.gapScale, j;
    var arr = [], t = 0.0;
    for (j = 0; j < NREQ; j++) { t += G.gaps[j] / scale / lam; arr.push(t); }
    var tin = [], tout = [], ptok = [], need = [], maxNeed = 0;
    for (j = 0; j < NREQ; j++) {
      tin.push(SYS + R.pin[j % n]); tout.push(Math.max(1, R.os[j % n]));
      ptok.push(pref ? R.pin[j % n] : tin[j]);
      need.push(paged ? tin[j] + tout[j] : MAXLEN);
      if (need[j] > maxNeed) maxNeed = need[j];
    }
    var slots = Math.min(cap, paged ? m.ceilPaged : m.ceilStatic);
    if (slots < 1 || maxNeed > m.poolTokens) return null;
    var ttft = [], first = [], fin = [];
    for (j = 0; j < NREQ; j++) { ttft.push(0.0); first.push(0.0); fin.push(0.0); }
    var waiting = [], wh = 0, running = [], used = 0, nxt = 0, done = 0, now = 0.0;
    var bsum = 0, bcount = 0, peak = 0;
    while (done < NREQ) {
      while (nxt < NREQ && arr[nxt] <= now) { waiting.push(nxt); nxt += 1; }
      if (running.length === 0 && wh >= waiting.length) { now = arr[nxt]; continue; }
      var adm = [];
      if (stat) {
        if (running.length === 0) {
          while (wh < waiting.length && adm.length < slots) { adm.push(waiting[wh]); wh += 1; }
        }
      } else {
        while (wh < waiting.length && running.length + adm.length < slots && used + need[waiting[wh]] <= m.poolTokens) {
          j = waiting[wh]; adm.push(j); used += need[j]; wh += 1;
        }
      }
      var dt = 0.0, k;
      for (k = 0; k < adm.length; k++) dt += f.prefill(ptok[adm[k]]);
      var B = running.length;
      if (B > 0) {
        var cs = 0;
        for (k = 0; k < B; k++) cs += running[k][2];
        dt += f.decode(B, cs); bsum += B; bcount += 1;
      }
      now += dt;
      var keep = [];
      for (k = 0; k < running.length; k++) {
        var r = running[k];
        r[1] -= 1; r[2] += 1;
        if (r[1] <= 0) { fin[r[0]] = now; done += 1; if (!stat) used -= need[r[0]]; }
        else keep.push(r);
      }
      for (k = 0; k < adm.length; k++) {
        j = adm[k];
        ttft[j] = now - arr[j]; first[j] = now;
        if (tout[j] <= 1) { fin[j] = now; done += 1; if (!stat) used -= need[j]; }
        else keep.push([j, tout[j] - 1, tin[j] + 1]);
      }
      running = keep;
      if (running.length > peak) peak = running.length;
    }
    var st = ttft.slice().sort(function (a, b) { return a - b; });
    var span = now - arr[0], outtok = 0;
    for (j = 0; j < NREQ; j++) outtok += tout[j];
    var tp = 0.0, tc = 0;
    for (j = 0; j < NREQ; j++) if (tout[j] > 1) { tp += (fin[j] - first[j]) / (tout[j] - 1); tc += 1; }
    return { p50: st[Math.ceil(0.5 * NREQ) - 1], p95: st[Math.ceil(0.95 * NREQ) - 1], tokPerS: outtok / span,
             reqPerS: NREQ / span, meanBatch: bcount ? bsum / bcount : 0, peakBatch: peak, tpot: tp / tc, slots: slots };
  }
  function sweep(R, G, cfg) {
    var price = GPUS[cfg.gpu][3], pts = [], best = null;
    for (var i = 0; i < LAMS.length; i++) {
      var lam = LAMS[i], s = simulate(R, G, cfg, lam);
      if (s === null) return { fits: false, points: [], lamMax: 0 };
      pts.push({ lam: lam, p95: s.p95, p50: s.p50, tokPerS: s.tokPerS, meanBatch: s.meanBatch, tpot: s.tpot });
      if (s.p95 <= SLO) best = [lam, s];
    }
    var m = mem(R, cfg.gpu, cfg.model, cfg.w, cfg.kv, cfg.paged === undefined ? true : cfg.paged);
    var f = stepFns(cfg.gpu, cfg.model, cfg.w, cfg.kv);
    var out = { fits: true, points: pts, mem: m, decode1ms: f.decode(1, m.avgCtx) * 1000,
                prefillMs: f.prefill(SYS + 0) * 1000, lamMax: best ? best[0] : 0 };
    if (best) {
      out.cost1kReq = price / (best[0] * 3600) * 1000;
      out.costPer1MOut = price / (best[1].tokPerS * 3600) * 1e6;
      out.tokPerSAtSlo = best[1].tokPerS;
    }
    return out;
  }

  function mix(R, gpu, model, w) {
    model = model || "llama8b"; w = w || "bf16";
    var n = R.pin.length, st = 0, sb = 0, ss = 0, i;
    for (i = 0; i < n; i++) { st += SYS + R.pin[i]; sb += R.ob[i]; ss += R.os[i]; }
    var mt = st / n, mb = sb / n, ms = ss / n;
    var incost = st * 2.00 / 1e6, outcost = sb * 8.00 / 1e6;
    var f = stepFns(gpu, model, w, "bf16");
    var pre = f.prefill(mt) * 1000, dec = f.decode(1, mt + mb / 2) * 1000;
    return { meanTin: mt, meanOb: mb, meanOs: ms, inputShare: incost / (incost + outcost),
             prefillMs: pre, decodeMs: dec, answerMs: mb * dec, prefillPerTokMs: pre / mt,
             decodeOverPrefillTok: dec / (pre / mt) };
  }

  /* ---------- Part C: cache ---------- */
  function cacheCost(R, preset, layout, hit, sem) {
    sem = sem || "off";
    var c = CACHE[preset], pin = c[0], pout = c[1], write = c[2], read = c[3], minimum = c[4];
    var n = R.pin.length, base = 0.0, withc = 0.0;
    var engaged = layout === "static-first" && SYS >= minimum;
    for (var i = 0; i < n; i++) {
      var tin = SYS + R.pin[i], tout = R.ob[i];
      var b = (tin * pin + tout * pout) / 1e6; base += b;
      if (engaged) withc += ((SYS * (hit * read + (1 - hit) * write) + (tin - SYS)) * pin + tout * pout) / 1e6;
      else withc += b;
    }
    var sh = SEM[sem][0], wr = SEM[sem][1];
    var c1k = withc / n * 1000, s1k = (1 - sh) * c1k;
    return { base1k: base / n * 1000, cache1k: c1k, engaged: engaged, after1k: s1k,
             saving: 1 - s1k / (base / n * 1000), wrongPer1k: 1000 * sh * wr,
             breakEvenHit: write > 1 ? (write - 1) / (write - read) : 0.0 };
  }

  /* ---------- the stacked plan ---------- */
  var sweepMemo = {};
  function sweepCached(R, G, cfg) {
    var key = JSON.stringify(cfg);
    if (!sweepMemo[key]) sweepMemo[key] = sweep(R, G, cfg);
    return sweepMemo[key];
  }
  function plan(R, G, p) {
    var pol = p.router ? (p.policy || "learned") : "allbig";
    var cache = p.cache ? [1.0, 0.25, p.hit] : null;
    var r = route(R, pol, p.t, "gpt41", cache);
    var n = R.s.length, share = r.shareSmall, bigc = 0.0, smallc = 0.0, i;
    for (i = 0; i < n; i++) {
      if (decide(R, pol, i, p.t)) smallc += rowCost(R, i, "small", "gpt41");
      else bigc += rowCost(R, i, "big", "gpt41", cache);
    }
    var bigMonth = bigc / n * VOLUME, smallMonth, replicas, lamMax;
    var peakSmall = VOLUME / (30 * 86400) * PEAK * share;
    if (p.small === "api") { smallMonth = smallc / n * VOLUME; replicas = 0; lamMax = null; }
    else {
      var sw = sweepCached(R, G, p.cfg); lamMax = sw.lamMax;
      var pk = VOLUME / (30 * 86400) * PEAK * share;
      if (share === 0) replicas = 0;
      else if (lamMax === 0) replicas = -1;
      else replicas = Math.ceil(pk / lamMax);
      smallMonth = replicas >= 0 ? replicas * GPUS[p.cfg.gpu][3] * HOURS : Infinity;
    }
    var total = bigMonth + smallMonth;
    var base = route(R, "allbig", 0, "gpt41").cost1k / 1000 * VOLUME;
    return { shareSmall: share, acceptRate: r.acceptRate, bigMonth: bigMonth, smallMonth: smallMonth,
             replicas: replicas, lamMax: lamMax, peakSmall: peakSmall, total: total, per1k: total / VOLUME * 1000,
             baseline: base, saving: 1 - total / base, clearsFloor: r.acceptRate >= FLOOR - 1e-12 };
  }

  var CFGS = {
    l4_bf16: { gpu: "L4", model: "llama8b", w: "bf16", kv: "bf16" },
    l4_fp8: { gpu: "L4", model: "llama8b", w: "fp8", kv: "bf16" },
    l4_int4: { gpu: "L4", model: "llama8b", w: "int4", kv: "bf16" },
    l4_fp8_kv8: { gpu: "L4", model: "llama8b", w: "fp8", kv: "fp8" },
    l4_fp8_static: { gpu: "L4", model: "llama8b", w: "fp8", kv: "bf16", mode: "static", paged: false },
    l4_fp8_nopage: { gpu: "L4", model: "llama8b", w: "fp8", kv: "bf16", paged: false },
    l4_fp8_prefix: { gpu: "L4", model: "llama8b", w: "fp8", kv: "bf16", prefix: true },
    a100_bf16: { gpu: "A100", model: "llama8b", w: "bf16", kv: "bf16" },
    h100_bf16: { gpu: "H100", model: "llama8b", w: "bf16", kv: "bf16" },
    h100_70b_bf16: { gpu: "H100", model: "llama70b", w: "bf16", kv: "bf16" },
    h100_70b_int4: { gpu: "H100", model: "llama70b", w: "int4", kv: "bf16" }
  };
  var PLANS = {
    baseline: { router: false, t: 1001, small: "api", cache: false, hit: 0.9 },
    routerApi: { router: true, t: 870, small: "api", cache: false, hit: 0.9 },
    routerSelf: { router: true, t: 870, small: "self", cfg: CFGS.l4_fp8_prefix, cache: false, hit: 0.9 },
    full: { router: true, t: 870, small: "self", cfg: CFGS.l4_fp8_prefix, cache: true, hit: 0.9 },
    allSmallSelf: { router: true, t: 0, small: "self", cfg: CFGS.l4_fp8_prefix, cache: true, hit: 0.9 },
    shuffledFull: { router: true, policy: "shuffled", t: 870, small: "self", cfg: CFGS.l4_fp8_prefix, cache: true, hit: 0.9 },
    fullH100: { router: true, t: 870, small: "self", cfg: CFGS.h100_bf16, cache: true, hit: 0.9 },
    cacheOnly: { router: false, t: 1001, small: "api", cache: true, hit: 0.9 }
  };

  function canon(sample) {
    var R = sample.rows, G = { gaps: sample.gaps, gapScale: sample.gapScale }, n = R.s.length, i, good = 0;
    for (i = 0; i < n; i++) if (R.q[i] >= BAR) good += 1;
    var sh = [], negLen = [];
    for (i = 0; i < n; i++) { sh.push(R.s[(i * SHUF) % n]); negLen.push(-R.pin[i]); }
    var out = { rows: n, goodShare: good / n,
                auc: { learned: auc(R.s, R.q), shuffled: auc(sh, R.q), length: auc(negLen, R.q) },
                mix: { L4: mix(R, "L4"), H100: mix(R, "H100") },
                router: {}, atFloor: {}, three: {}, presets: {}, capacity: {}, cache: {}, plans: {} };
    ["learned", "shuffled", "length"].forEach(function (pol) {
      var fr = frontier(R, pol); out.router[pol] = fr; out.atFloor[pol] = cheapestAtFloor(fr);
    });
    ["oracle", "allbig", "allsmall"].forEach(function (pol) { out.router[pol] = route(R, pol, 0); });
    [850, 870, 900].forEach(function (t) { out.three[String(t)] = route(R, "learned", t); });
    ["gpt41", "gpt5", "paper"].forEach(function (pr) {
      out.presets[pr] = { t870: route(R, "learned", 870, pr), allbig: route(R, "allbig", 0, pr), allsmall: route(R, "allsmall", 0, pr) };
    });
    Object.keys(CFGS).forEach(function (k) { out.capacity[k] = sweep(R, G, CFGS[k]); });
    Object.keys(CACHE).forEach(function (pr) {
      ["dynamic-first", "static-first"].forEach(function (lay) { out.cache[pr + "|" + lay] = cacheCost(R, pr, lay, 0.9); });
    });
    out.cache["sonnet45|static-first|h0.5"] = cacheCost(R, "sonnet45", "static-first", 0.5);
    out.cache["sonnet45|static-first|h0.1"] = cacheCost(R, "sonnet45", "static-first", 0.1);
    ["short", "long"].forEach(function (s) { out.cache["sonnet45|static-first|" + s] = cacheCost(R, "sonnet45", "static-first", 0.9, s); });
    Object.keys(PLANS).forEach(function (k) { out.plans[k] = plan(R, G, PLANS[k]); });
    return out;
  }

  var engine = { SYS: SYS, BAR: BAR, FLOOR: FLOOR, PRICES: PRICES, GPUS: GPUS, MODELS: MODELS, CACHE: CACHE, SEM: SEM,
                 SWEEP_LENGTH: SWEEP.length, LAMS: LAMS, SLO: SLO, VOLUME: VOLUME, PEAK: PEAK, CFGS: CFGS, PLANS: PLANS,
                 route: route, frontier: frontier, cheapestAtFloor: cheapestAtFloor, auc: auc, mem: mem,
                 stepFns: stepFns, mix: mix, simulate: simulate, sweep: sweep, cacheCost: cacheCost, plan: plan, canon: canon };

  if (typeof module !== "undefined" && module.exports) { module.exports = engine; return; }
  root.INF_ENGINE = engine;
})(typeof window !== "undefined" ? window : this);
