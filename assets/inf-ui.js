/* inf-ui.js - the widgets for learn-llm-inference-with-phoebe. Every number is computed by
 * assets/inf-live.js (window.INF_ENGINE) from assets/inf-sample.js; nothing here is hard-coded.
 * Mount points: <div class="inf-widget" data-part="router|capacity|cache|plan"></div>
 * Page API for checks: window.INF_BENCH.router.set({...}), .capacity.set({...}), .cache.set({...}),
 * .plan.set({...}); each returns the numbers it printed.
 */
(function () {
  "use strict";
  var E = window.INF_ENGINE, S = window.INF_SAMPLE;
  if (!E || !S) return;
  var R = S.rows, G = { gaps: S.gaps, gapScale: S.gapScale };

  function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
  function pct1(x) { return (x * 100).toFixed(1) + "%"; }
  function usd2(x) { return "$" + x.toFixed(2); }
  function usd0(x) { return isFinite(x) ? "$" + Math.round(x).toLocaleString("en-US") : "not servable"; }
  function n0(x) { return Math.round(x).toLocaleString("en-US"); }
  function n1(x) { return x.toFixed(1); }
  function secs(x) { return x < 10 ? (x * 1000 < 1000 ? Math.round(x * 1000) + " ms" : x.toFixed(2) + " s") : (x >= 100 ? Math.round(x) + " s" : x.toFixed(1) + " s"); }

  function metric(label, val, unit, kind) {
    return '<div class="mb-metric"><span class="mb-mlabel">' + esc(label) + '</span><span class="mb-mvalue">' + esc(val) +
      '</span><span class="mb-munit">' + esc(unit || "") + '</span>' +
      (kind ? '<span class="mb-mkind ' + (kind === "computed" ? "is-measured" : "is-heuristic") + '">' + esc(kind) + "</span>" : "") + "</div>";
  }
  function presetRow(name, items, cur) {
    var h = '<div class="mb-presets" role="radiogroup">';
    items.forEach(function (it) {
      h += '<label class="mb-preset' + (it.anti ? " is-anti" : "") + (it.id === cur ? " is-on" : "") + '"><input type="radio" name="' + name +
        '" value="' + it.id + '"' + (it.id === cur ? " checked" : "") + '><span class="mb-pname">' + esc(it.label) +
        (it.anti ? ' <em class="mb-anti">' + esc(it.anti) + "</em>" : "") + '</span><span class="mb-pnote">' + esc(it.note) + "</span></label>";
    });
    return h + "</div>";
  }
  function select(id, label, opts, cur) {
    var h = '<label class="fb-field" for="' + id + '">' + esc(label) + '<select id="' + id + '">';
    opts.forEach(function (o) { h += '<option value="' + esc(o[0]) + '"' + (String(o[0]) === String(cur) ? " selected" : "") + ">" + esc(o[1]) + "</option>"; });
    return h + "</select></label>";
  }
  function onRadio(root, name, fn) {
    Array.prototype.forEach.call(root.querySelectorAll('input[name="' + name + '"]'), function (el) {
      el.addEventListener("change", function () { fn(el.value); });
    });
  }
  function markRadio(root, name, cur) {
    Array.prototype.forEach.call(root.querySelectorAll('input[name="' + name + '"]'), function (el) {
      el.checked = el.value === cur; el.parentNode.classList.toggle("is-on", el.checked);
    });
  }
  var uid = 0;

  /* ================= Part A: the router ================= */
  function RouterWidget(el) {
    var id = "ir" + (uid++);
    var st = { policy: el.getAttribute("data-policy") || "learned", t: +(el.getAttribute("data-t") || 870), len: 50, preset: "gpt41", scramble: false };
    var POL = [
      { id: "learned", label: "Learned router", note: "12 features of the prompt text, fit on RouteLLM's train split; slide the threshold" },
      { id: "length", label: "Length router", note: "short prompts go to the small model; slide the length cut" },
      { id: "allbig", label: "Everything big", note: "today's Kiln: one large model for every request" },
      { id: "allsmall", label: "Everything small", note: "the cheapest line on the chart", anti: "anti-lever" },
      { id: "oracle", label: "Hindsight", note: "routes on the judge's score, which no router knows in advance: the ceiling" }
    ];
    el.innerHTML = '<p class="fb-h">The router: 2,000 real prompts, two models, one threshold</p>' +
      presetRow(id + "p", POL, st.policy) +
      '<div class="fb-controls">' +
      '<label class="fb-field fb-wide" for="' + id + 't">Router threshold: send small when score is at least <output id="' + id + 'to"></output><input type="range" id="' + id + 't" min="700" max="950" step="10" value="' + st.t + '"></label>' +
      select(id + "l", "Length cut (estimated prompt tokens)", E.SWEEP_LENGTH.map(function (x) { return [x, x >= 100000 ? "any length" : "up to " + x]; }), st.len) +
      select(id + "pr", "Prices per 1M tokens, in / out (read 2026-11-08)", Object.keys(E.PRICES).map(function (k) {
        var p = E.PRICES[k]; return [k, p.label + ": $" + p.big[0].toFixed(2) + " / $" + p.big[1].toFixed(2) + " vs $" + p.small[0].toFixed(2) + " / $" + p.small[1].toFixed(2)]; }), st.preset).replace('class="fb-field"', 'class="fb-field fb-wide"') +
      "</div>" +
      '<label class="fb-card fb-retrain" for="' + id + 'x"><span><input type="checkbox" id="' + id + 'x"> <strong>Break button: scramble the router.</strong> Each prompt reads another prompt\'s score. If the router carries a real signal, quality at the same cost must fall.</span></label>' +
      '<div class="mb-verdict" id="' + id + 'v"></div><div class="mb-metrics" id="' + id + 'm"></div>' +
      '<div class="fb-card"><h5>Cost against quality, every threshold</h5><div class="fb-stage" id="' + id + 'c"></div></div>' +
      '<p class="fb-route">Rows: RouteLLM routellm/gpt4_dataset (Apache-2.0), 2,000 held-out prompts. Quality: GPT-4 as judge scored the small model (Mixtral 8x7B) 1-5; 4 or 5 counts as acceptable, and the big model\'s answer is the judge\'s reference, so it counts as acceptable. Tokens are characters / 4, an estimate. Kiln\'s 1,200-token system prompt is constructed and added to every request.</p>';
    var q = function (s) { return el.querySelector(s); };
    var res, aucMemo = {};
    function aucFor(pol) {
      if (!(pol in aucMemo)) {
        var sc = null, i, n = R.s.length;
        if (pol === "learned") sc = R.s;
        else if (pol === "shuffled") { sc = []; for (i = 0; i < n; i++) sc.push(R.s[(i * 7919) % n]); }
        else if (pol === "length") { sc = []; for (i = 0; i < n; i++) sc.push(-R.pin[i]); }
        aucMemo[pol] = sc ? E.auc(sc, R.q).toFixed(3) : "n/a";
      }
      return aucMemo[pol];
    }
    function cur() {
      var pol = st.policy === "learned" && st.scramble ? "shuffled" : st.policy;
      var t = st.policy === "length" ? st.len : st.t;
      return { pol: pol, t: t };
    }
    function render() {
      var c = cur();
      res = E.route(R, c.pol, c.t, st.preset);
      q("#" + id + "to").textContent = (st.t / 1000).toFixed(2);
      q("#" + id + "t").disabled = st.policy !== "learned";
      q("#" + id + "l").disabled = st.policy !== "length";
      q("#" + id + "x").disabled = st.policy !== "learned";
      var ok = res.acceptRate >= E.FLOOR - 1e-12;
      var v = q("#" + id + "v");
      v.className = "mb-verdict " + (ok ? "is-good" : "is-bad");
      v.textContent = (ok ? "Clears" : "Fails") + " Kiln's 95% floor: " + pct1(res.acceptRate) + " acceptable, " + pct1(res.saving) + " cheaper than everything big";
      q("#" + id + "m").innerHTML =
        metric("Sent to the small model", pct1(res.shareSmall), n0(res.nSmall) + " of 2,000", "computed") +
        metric("Acceptable answers", pct1(res.acceptRate), n0(res.acceptable) + " of 2,000", "computed") +
        metric("Weak answers shipped", n0(res.badShipped), "small model scored 1-3", "computed") +
        metric("Cost per 1,000 requests", usd2(res.cost1k), "everything big: " + usd2(res.allBig1k), "computed") +
        metric("Saving vs everything big", pct1(res.saving), "same rows, same prices", "computed") +
        metric("Router signal (AUC)", aucFor(c.pol), "0.5 = a coin, 1.0 = hindsight", "computed");
      q("#" + id + "c").innerHTML = chart(c);
    }
    function chart(c) {
      var W = 560, H = 300, x0 = 64, x1 = 540, y0 = 250, y1 = 24;
      var lines = { learned: E.frontier(R, "learned", st.preset), length: E.frontier(R, "length", st.preset) };
      if (st.scramble) lines.shuffled = E.frontier(R, "shuffled", st.preset);
      var cmax = E.route(R, "allbig", 0, st.preset).cost1k * 1.04;
      var ymin = 0.85;
      function X(v) { return x0 + (x1 - x0) * v / cmax; }
      function Y(a) { return y0 - (y0 - y1) * (a - ymin) / (1 - ymin); }
      var h = '<svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Acceptable-answer rate against cost per 1,000 requests for every router threshold">';
      h += '<line class="fb-axis" x1="' + x0 + '" y1="' + y0 + '" x2="' + x1 + '" y2="' + y0 + '"/><line class="fb-axis" x1="' + x0 + '" y1="' + y0 + '" x2="' + x0 + '" y2="' + y1 + '"/>';
      var fy = Y(E.FLOOR);
      h += '<line class="fb-now" x1="' + x0 + '" y1="' + fy + '" x2="' + x1 + '" y2="' + fy + '"/><text class="fb-cap" x="' + (x0 + 6) + '" y="' + (fy - 6) + '">95% floor</text>';
      [0.85, 0.90, 1.0].forEach(function (a) { h += '<text class="fb-cap" x="' + (x0 - 8) + '" y="' + (Y(a) + 4) + '" text-anchor="end">' + Math.round(a * 100) + "%</text>"; });
      h += '<text class="fb-cap" x="' + x0 + '" y="' + (y0 + 18) + '">$0</text><text class="fb-cap" x="' + x1 + '" y="' + (y0 + 18) + '" text-anchor="end">' + usd2(cmax / 1.04) + ' per 1,000</text>';
      h += '<text class="fb-cap" x="' + ((x0 + x1) / 2) + '" y="' + (y0 + 36) + '" text-anchor="middle">cost per 1,000 requests</text>';
      var sty = { learned: "fb-small", length: "fb-big", shuffled: "fb-ghost" };
      Object.keys(lines).forEach(function (k) {
        var d = "";
        lines[k].forEach(function (p, i) { d += (i ? " L" : "M") + X(p.cost1k).toFixed(1) + " " + Y(Math.max(ymin, p.acceptRate)).toFixed(1); });
        h += '<path class="' + sty[k] + '" fill="none" d="' + d + '"/>';
      });
      var key = [["learned", "learned router", "fb-key-small"], ["length", "length router", "fb-key-big"]];
      if (st.scramble) key.push(["shuffled", "scrambled", "fb-key-now"]);
      key.forEach(function (k, i) { h += '<rect class="' + k[2] + '" x="' + (x0 + 14) + '" y="' + (y1 + 6 + i * 16) + '" width="12" height="4"/><text class="fb-cap" x="' + (x0 + 30) + '" y="' + (y1 + 12 + i * 16) + '">' + k[1] + "</text>"; });
      h += '<circle class="fb-be" cx="' + X(res.cost1k).toFixed(1) + '" cy="' + Y(Math.max(ymin, res.acceptRate)).toFixed(1) + '" r="6"/>';
      return h + "</svg>";
    }
    onRadio(el, id + "p", function (v) { st.policy = v; markRadio(el, id + "p", v); render(); });
    q("#" + id + "t").addEventListener("input", function (e) { st.t = +e.target.value; render(); });
    q("#" + id + "l").addEventListener("change", function (e) { st.len = +e.target.value; render(); });
    q("#" + id + "pr").addEventListener("change", function (e) { st.preset = e.target.value; render(); });
    q("#" + id + "x").addEventListener("change", function (e) { st.scramble = e.target.checked; render(); });
    render();
    return {
      set: function (o) {
        for (var k in o) st[k] = o[k];
        markRadio(el, id + "p", st.policy); q("#" + id + "t").value = st.t; q("#" + id + "l").value = st.len;
        q("#" + id + "pr").value = st.preset; q("#" + id + "x").checked = st.scramble; render(); return res;
      },
      result: function () { return res; }
    };
  }

  /* ================= Part B: capacity ================= */
  function CapacityWidget(el) {
    var id = "ic" + (uid++);
    var st = { gpu: "L4", model: "llama8b", w: el.getAttribute("data-w") || "bf16", kv: "bf16", mode: "cont", paged: true, prefix: false,
               lam: +(el.getAttribute("data-lam") || 0.5) };
    if (el.getAttribute("data-prefix") === "1") st.prefix = true;
    var focus = el.getAttribute("data-focus") || "all";
    el.innerHTML = '<p class="fb-h">Capacity: what one GPU actually serves</p>' +
      '<div class="fb-controls">' +
      select(id + "g", "GPU (HF Endpoints $/h, read 2026-11-08)", [["L4", "L4 24 GB, 300 GB/s, $0.80/h"], ["A100", "A100 80 GB, 2,039 GB/s, $2.50/h"], ["H100", "H100 80 GB, 3,350 GB/s, $4.50/h"]], st.gpu) +
      select(id + "mo", "Model", [["llama8b", "Llama 3.1 8B (8.03B params)"], ["llama70b", "Llama 3.1 70B (70.55B params)"]], st.model) +
      select(id + "w", "Weights", [["bf16", "BF16, 2 bytes"], ["fp8", "FP8, 1 byte"], ["int8", "INT8, 1 byte"], ["int4", "INT4 weight-only, 0.5 byte"]], st.w) +
      select(id + "kv", "KV cache", [["bf16", "BF16, 2 bytes"], ["fp8", "FP8, 1 byte"]], st.kv) +
      "</div><div class=\"fb-controls\">" +
      select(id + "b", "Batching", [["cont", "Continuous (iteration-level)"], ["static", "Static (whole batch, then the next)"]], st.mode) +
      select(id + "pg", "KV memory", [["1", "Paged: reserve what each request uses"], ["0", "Reserved: 4,096 tokens per slot"]], st.paged ? "1" : "0") +
      select(id + "pf", "Prefix cache", [["0", "Off: prefill the whole prompt"], ["1", "On: the system prompt's KV is reused"]], st.prefix ? "1" : "0") +
      select(id + "lam", "Load (requests per second)", E.LAMS.map(function (x) { return [x, String(x)]; }), st.lam) +
      "</div>" +
      '<div class="mb-verdict" id="' + id + 'v"></div><div class="mb-metrics" id="' + id + 'm"></div>' +
      '<div class="fb-card"><h5>p95 time to first token as load rises <button type="button" class="btn" id="' + id + 's">Run the load sweep</button></h5><div class="fb-stage" id="' + id + 'c"><p class="fb-route">Press the button: 20 loads x 1,000 simulated requests, in your browser.</p></div><div class="mb-metrics" id="' + id + 'sm"></div></div>' +
      '<p class="fb-route"><strong>Modelled, not measured.</strong> Decode time = bytes read per step (weights + every running sequence\'s KV) / (memory bandwidth x 0.6); prefill = 2 x parameters x prompt tokens / (dense BF16 TFLOPS x 0.5). 90% of GPU memory usable, 1.5 GB held back for the runtime, at most 256 sequences. Arrivals: a seeded queue of 1,000 requests with Kiln\'s real prompt and answer lengths. Sanity check: vLLM\'s 2024 blog reports Llama 3 8B at 1 token every 13 ms under light load (GPU not named in that sentence); this model says 8.1 ms on an H100, so read it as optimistic.</p>';
    var q = function (s) { return el.querySelector(s); };
    var res, sw = null;
    function cfg() { return { gpu: st.gpu, model: st.model, w: st.w, kv: st.kv, mode: st.mode, paged: st.paged, prefix: st.prefix }; }
    function render() {
      var c = cfg(), m = E.mem(R, c.gpu, c.model, c.w, c.kv, c.paged);
      var f = E.stepFns(c.gpu, c.model, c.w, c.kv);
      res = { mem: m, sim: m.fits ? E.simulate(R, G, c, st.lam) : null, decode1ms: f.decode(1, m.avgCtx) * 1000 };
      var v = q("#" + id + "v");
      if (!m.fits) {
        v.className = "mb-verdict is-bad"; v.textContent = "Does not fit: " + n1(m.weightsGB) + " GB of weights against " + n1(m.usableGB) + " GB usable";
      } else if (!res.sim) {
        v.className = "mb-verdict is-bad"; v.textContent = "Fits, but no room for even one request's KV cache";
      } else {
        var ok = res.sim.p95 <= E.SLO;
        v.className = "mb-verdict " + (ok ? "is-good" : "is-bad");
        v.textContent = (ok ? "Meets" : "Misses") + " the 1 s p95 first-token target at " + st.lam + " requests/s: p95 " + secs(res.sim.p95);
      }
      var h = metric("Weights in memory", n1(m.weightsGB) + " GB", "usable " + n1(m.usableGB) + " GB", "computed") +
        metric("KV cache per token", n0(m.kvPerTokKB) + " KB", "2 x layers x KV heads x head dim x bytes", "computed");
      if (m.fits) {
        h += metric("KV pool", n0(m.poolTokens) + " tokens", n1(m.poolGB) + " GB left for KV", "computed") +
          metric("Concurrent requests", n0(m.seqCap), st.paged ? "paged, at Kiln's mean " + n0(m.avgCtx) + " tokens" : "reserved 4,096 tokens each", "computed") +
          metric("Decode, one request alone", n1(res.decode1ms) + " ms/token", "roofline estimate", "modelled");
        if (res.sim) h += metric("p95 time to first token", secs(res.sim.p95), "p50 " + secs(res.sim.p50), "modelled") +
          metric("Output throughput", n0(res.sim.tokPerS) + " tok/s", "mean batch " + n1(res.sim.meanBatch), "modelled");
      }
      q("#" + id + "m").innerHTML = h;
      if (sw) drawSweep();
    }
    function drawSweep() {
      var W = 560, H = 270, x0 = 60, x1 = 540, y0 = 220, y1 = 20, ymax = 5;
      var h = '<svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="p95 time to first token against load, with the 1 second target">';
      h += '<line class="fb-axis" x1="' + x0 + '" y1="' + y0 + '" x2="' + x1 + '" y2="' + y0 + '"/><line class="fb-axis" x1="' + x0 + '" y1="' + y0 + '" x2="' + x0 + '" y2="' + y1 + '"/>';
      var L = E.LAMS, nL = L.length;
      function X(i) { return x0 + (x1 - x0) * i / (nL - 1); }
      function Y(s) { return y0 - (y0 - y1) * Math.min(s, ymax) / ymax; }
      h += '<line class="fb-now" x1="' + x0 + '" y1="' + Y(E.SLO) + '" x2="' + x1 + '" y2="' + Y(E.SLO) + '"/><text class="fb-cap" x="' + (x1 - 4) + '" y="' + (Y(E.SLO) - 6) + '" text-anchor="end">1 s target</text>';
      [0, 5].forEach(function (s) { h += '<text class="fb-cap" x="' + (x0 - 8) + '" y="' + (Y(s) + 4) + '" text-anchor="end">' + s + " s</text>"; });
      [0, 6, 12, 19].forEach(function (i) { h += '<text class="fb-cap" x="' + X(i) + '" y="' + (y0 + 18) + '" text-anchor="middle">' + L[i] + "</text>"; });
      h += '<text class="fb-cap" x="' + ((x0 + x1) / 2) + '" y="' + (y0 + 38) + '" text-anchor="middle">requests per second (top of the chart = 5 s or worse)</text>';
      if (sw.fits) {
        var d = ""; sw.points.forEach(function (p, i) { d += (i ? " L" : "M") + X(i).toFixed(1) + " " + Y(p.p95).toFixed(1); });
        h += '<path class="fb-small" fill="none" d="' + d + '"/>';
        sw.points.forEach(function (p, i) { if (p.lam === sw.lamMax) h += '<circle class="fb-be" cx="' + X(i).toFixed(1) + '" cy="' + Y(p.p95).toFixed(1) + '" r="6"/>'; });
      }
      q("#" + id + "c").innerHTML = h + "</svg>";
      var price = E.GPUS[st.gpu][3];
      q("#" + id + "sm").innerHTML = !sw.fits ? metric("Max load at target", "none", "does not fit", "modelled") :
        metric("Max load meeting the target", sw.lamMax ? sw.lamMax + " req/s" : "none", "of the 20 loads swept", "modelled") +
        (sw.lamMax ? metric("Cost per 1,000 requests", usd2(sw.cost1kReq), "$" + price.toFixed(2) + "/h at that load", "modelled") +
          metric("Cost per 1M output tokens", usd2(sw.costPer1MOut), n0(sw.tokPerSAtSlo) + " tok/s", "modelled") +
          metric("One GPU for a month", usd0(price * 730), "730 hours, busy or idle", "computed") : "");
    }
    function bind(sel, key, conv) { q(sel).addEventListener("change", function (e) { st[key] = conv(e.target.value); sw = null; q("#" + id + "c").innerHTML = '<p class="fb-route">Settings changed: run the sweep again.</p>'; q("#" + id + "sm").innerHTML = ""; render(); }); }
    var ident = function (x) { return x; };
    bind("#" + id + "g", "gpu", ident); bind("#" + id + "mo", "model", ident); bind("#" + id + "w", "w", ident); bind("#" + id + "kv", "kv", ident);
    bind("#" + id + "b", "mode", ident); bind("#" + id + "pg", "paged", function (x) { return x === "1"; }); bind("#" + id + "pf", "prefix", function (x) { return x === "1"; });
    q("#" + id + "lam").addEventListener("change", function (e) { st.lam = +e.target.value; render(); });
    q("#" + id + "s").addEventListener("click", function () { sw = E.sweep(R, G, cfg()); drawSweep(); });
    render();
    return {
      set: function (o) {
        for (var k in o) st[k] = o[k];
        q("#" + id + "g").value = st.gpu; q("#" + id + "mo").value = st.model; q("#" + id + "w").value = st.w; q("#" + id + "kv").value = st.kv;
        q("#" + id + "b").value = st.mode; q("#" + id + "pg").value = st.paged ? "1" : "0"; q("#" + id + "pf").value = st.prefix ? "1" : "0"; q("#" + id + "lam").value = st.lam;
        sw = null; render(); return res;
      },
      sweep: function () { sw = E.sweep(R, G, cfg()); drawSweep(); return sw; },
      result: function () { return res; }
    };
  }

  /* ================= Part C: cache ================= */
  function CacheWidget(el) {
    var id = "ik" + (uid++);
    var st = { preset: "sonnet45", layout: "dynamic-first", hit: 90, sem: "off" };
    el.innerHTML = '<p class="fb-h">The cache: same traffic, two prompt layouts, one answer cache</p>' +
      presetRow(id + "l", [
        { id: "dynamic-first", label: "Dynamic first", note: "user name, date and the question sit before the system prompt: no two prefixes match" },
        { id: "static-first", label: "Static first", note: "system prompt and tool definitions first, then the changing part" }], st.layout) +
      '<div class="fb-controls">' +
      select(id + "p", "Model and cache prices (read 2026-11-08)", [["sonnet45", "Claude Sonnet 4.5: write 1.25x, read 0.1x, min 1,024 tokens"], ["haiku45", "Claude Haiku 4.5: write 1.25x, read 0.1x, min 4,096 tokens"], ["gpt41", "gpt-4.1: cached input $0.50 vs $2.00, no write premium"]], st.preset) +
      '<label class="fb-field" for="' + id + 'h">Prefix hit rate <output id="' + id + 'ho"></output><input type="range" id="' + id + 'h" min="0" max="100" step="5" value="' + st.hit + '"></label>' +
      select(id + "s", "Answer cache (semantic)", [["off", "Off"], ["short", "Short expiry: 10% hits, 2% of hits wrong (constructed)"], ["long", "Long expiry: 25% hits, 8% of hits wrong (constructed)"]], st.sem) +
      "</div>" +
      '<div class="mb-verdict" id="' + id + 'v"></div><div class="mb-metrics" id="' + id + 'm"></div>' +
      '<p class="fb-route">Traffic: the same 2,000 real prompts and the big model\'s real answer lengths, plus Kiln\'s 1,200-token system prompt (constructed). Multipliers are list prices read 2026-11-08; re-verify. gpt-4.1\'s minimum cacheable length is assumed at 1,024 tokens: OpenAI\'s page says it varies by request settings for earlier models. The answer cache\'s hit share and wrong-answer rate are constructed inputs, not measurements.</p>';
    var q = function (s) { return el.querySelector(s); };
    var res;
    function render() {
      res = E.cacheCost(R, st.preset, st.layout, st.hit / 100, st.sem);
      q("#" + id + "ho").textContent = st.hit + "%";
      var v = q("#" + id + "v");
      if (st.layout === "static-first" && !res.engaged) {
        v.className = "mb-verdict is-bad"; v.textContent = "The cache never engages: the 1,200-token prefix is under this model's minimum";
      } else if (res.saving < 0) {
        v.className = "mb-verdict is-bad"; v.textContent = "Caching costs more: " + pct1(-res.saving) + " above no caching at a " + st.hit + "% hit rate";
      } else {
        v.className = "mb-verdict " + (res.saving > 0 ? "is-good" : "is-ok");
        v.textContent = res.saving > 0 ? "Saves " + pct1(res.saving) + " per request against no caching" : "No saving: no two prompts share a prefix";
      }
      q("#" + id + "m").innerHTML =
        metric("No caching", usd2(res.base1k), "per 1,000 requests", "computed") +
        metric("With the prompt cache", usd2(res.cache1k), res.engaged ? "prefix cached" : "cache not engaged", "computed") +
        metric("After the answer cache", usd2(res.after1k), "per 1,000 requests", st.sem === "off" ? "computed" : "modelled") +
        metric("Wrong cached answers", n1(res.wrongPer1k), "per 1,000 requests", st.sem === "off" ? "computed" : "modelled") +
        metric("Write premium pays off above", res.breakEvenHit ? pct1(res.breakEvenHit) : "any hit", "prefix hit rate", "computed");
    }
    onRadio(el, id + "l", function (v) { st.layout = v; markRadio(el, id + "l", v); render(); });
    q("#" + id + "p").addEventListener("change", function (e) { st.preset = e.target.value; render(); });
    q("#" + id + "h").addEventListener("input", function (e) { st.hit = +e.target.value; render(); });
    q("#" + id + "s").addEventListener("change", function (e) { st.sem = e.target.value; render(); });
    render();
    return {
      set: function (o) {
        for (var k in o) st[k] = o[k];
        markRadio(el, id + "l", st.layout); q("#" + id + "p").value = st.preset; q("#" + id + "h").value = st.hit; q("#" + id + "s").value = st.sem;
        render(); return res;
      },
      result: function () { return res; }
    };
  }

  /* ================= the stacked plan ================= */
  function PlanWidget(el) {
    var id = "ip" + (uid++);
    var P = E.PLANS;
    var PRE = [
      { id: "baseline", label: "Today", note: "everything on gpt-4.1, no cache" },
      { id: "cacheOnly", label: "Cache only", note: "static-first prompt, 90% prefix hits" },
      { id: "routerApi", label: "Router + mini API", note: "threshold 0.87; small side on gpt-4.1-mini" },
      { id: "routerSelf", label: "Router + own L4", note: "small side on one L4, FP8, prefix cache" },
      { id: "full", label: "Full stack", note: "router + own L4 + prompt cache on the big side" },
      { id: "fullH100", label: "Full stack on an H100", note: "same, but a bigger GPU for the small side" },
      { id: "allSmallSelf", label: "Everything small", note: "no router, all traffic on own L4s", anti: "anti-lever" },
      { id: "shuffledFull", label: "Full stack, scrambled router", note: "break button: the router's scores shuffled", anti: "break" }
    ];
    var st = { preset: el.getAttribute("data-plan") || "full" };
    el.innerHTML = '<p class="fb-h">Kiln\'s plan: router + serving + cache, one monthly bill</p>' + presetRow(id + "p", PRE, st.preset) +
      '<div class="mb-verdict" id="' + id + 'v"></div><div class="mb-metrics" id="' + id + 'm"></div>' +
      '<div class="fb-card"><h5>Monthly bill, big side and small side</h5><div class="fb-stage" id="' + id + 'c"></div></div>' +
      '<p class="fb-route">Constructed Kiln example: 1,500,000 requests a month, peak three times the average, a 95% acceptable-answer floor, a 1 s p95 first-token target for the self-hosted side. Router quality and token counts are computed from the real rows; GPU capacity is the model above; prices are list prices read 2026-11-08 (re-verify). People and on-call cost for self-hosting are not in these numbers.</p>';
    var q = function (s) { return el.querySelector(s); };
    var res;
    function render() {
      res = E.plan(R, G, P[st.preset]);
      var v = q("#" + id + "v");
      var ok = res.clearsFloor;
      v.className = "mb-verdict " + (ok ? "is-good" : "is-bad");
      v.textContent = (ok ? "Clears the 95% floor" : "Fails the 95% floor") + ": " + usd0(res.total) + " a month, " + pct1(res.saving) + " under today's " + usd0(res.baseline);
      q("#" + id + "m").innerHTML =
        metric("Monthly total", usd0(res.total), usd2(res.per1k) + " per 1,000 requests", "computed") +
        metric("Big side (API)", usd0(res.bigMonth), pct1(1 - res.shareSmall) + " of requests", "computed") +
        metric("Small side", usd0(res.smallMonth), res.replicas > 0 ? res.replicas + " GPU" + (res.replicas > 1 ? "s" : "") + ", " + res.lamMax + " req/s each at target" : (res.shareSmall > 0 ? "gpt-4.1-mini" : "none"), res.replicas > 0 ? "modelled" : "computed") +
        metric("Small side at peak", res.peakSmall.toFixed(2) + " req/s", "3x the average, " + pct1(res.shareSmall) + " of traffic", "computed") +
        metric("Acceptable answers", pct1(res.acceptRate), "floor 95%", "computed") +
        metric("Saving vs today", pct1(res.saving), "today " + usd0(res.baseline), "computed");
      var W = 560, H = 120, x0 = 120, x1 = 540, mx = res.baseline;
      function X(vv) { return x0 + (x1 - x0) * vv / mx; }
      var h = '<svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Monthly bill split into big side and small side, against today">';
      h += '<text class="fb-lab" x="' + (x0 - 10) + '" y="38" text-anchor="end">this plan</text><rect class="fb-bar is-urgent" x="' + x0 + '" y="24" width="' + Math.max(0, X(res.bigMonth) - x0).toFixed(1) + '" height="22"/>';
      h += '<rect class="fb-bar" x="' + X(res.bigMonth).toFixed(1) + '" y="24" width="' + Math.max(0, X(Math.min(mx, res.total)) - X(res.bigMonth)).toFixed(1) + '" height="22"/>';
      h += '<text class="fb-lab" x="' + (x0 - 10) + '" y="84" text-anchor="end">today</text><rect class="fb-ghost" x="' + x0 + '" y="70" width="' + (x1 - x0) + '" height="22"/>';
      h += '<rect class="fb-key-big" x="' + x0 + '" y="104" width="12" height="4"/><text class="fb-cap" x="' + (x0 + 16) + '" y="110">big side</text><rect class="fb-key-small" x="' + (x0 + 90) + '" y="104" width="12" height="4"/><text class="fb-cap" x="' + (x0 + 106) + '" y="110">small side</text>';
      q("#" + id + "c").innerHTML = h + "</svg>";
    }
    onRadio(el, id + "p", function (v) { st.preset = v; markRadio(el, id + "p", v); render(); });
    render();
    return { set: function (o) { for (var k in o) st[k] = o[k]; markRadio(el, id + "p", st.preset); render(); return res; }, result: function () { return res; } };
  }

  /* ================= Session 1: one request, split ================= */
  function MixWidget(el) {
    var id = "im" + (uid++);
    var st = { gpu: el.getAttribute("data-gpu") || "L4" };
    el.innerHTML = '<p class="fb-h">One Kiln request, split into prefill and decode</p><div class="fb-controls">' +
      select(id + "g", "GPU serving Llama 3.1 8B in BF16, alone", [["L4", "L4 24 GB, 300 GB/s"], ["A100", "A100 80 GB, 2,039 GB/s"], ["H100", "H100 80 GB, 3,350 GB/s"]], st.gpu) +
      '</div><div class="mb-metrics" id="' + id + 'm"></div>' +
      '<p class="fb-route">Token counts: means over the 2,000 real prompts and GPT-4 answers (characters / 4), plus Kiln\'s constructed 1,200-token system prompt. Bill split at gpt-4.1 list prices ($2.00 in, $8.00 out per 1M, read 2026-11-08). Times are the roofline MODEL with one request on the GPU: prefill from compute, decode from memory bandwidth.</p>';
    var q = function (s) { return el.querySelector(s); };
    var res;
    function render() {
      res = E.mix(R, st.gpu);
      q("#" + id + "m").innerHTML =
        metric("Prompt tokens (prefill)", n0(res.meanTin), "mean per request", "computed") +
        metric("Answer tokens (decode)", n0(res.meanOb), "mean, big model", "computed") +
        metric("Input share of the bill", pct1(res.inputShare), "output is the rest", "computed") +
        metric("Prefill, whole prompt", n0(res.prefillMs) + " ms", "about the first-token wait", "modelled") +
        metric("Decode, per answer token", n1(res.decodeMs) + " ms", "whole answer " + secs(res.answerMs / 1000), "modelled") +
        metric("One decode token vs one prompt token", n0(res.decodeOverPrefillTok) + "x", "GPU time, batch of one", "modelled");
    }
    q("#" + id + "g").addEventListener("change", function (e) { st.gpu = e.target.value; render(); });
    render();
    return { set: function (o) { for (var k in o) st[k] = o[k]; q("#" + id + "g").value = st.gpu; render(); return res; }, result: function () { return res; } };
  }

  var api = { router: [], capacity: [], cache: [], plan: [], mix: [] };
  var MAKERS = { mix: MixWidget, router: RouterWidget, capacity: CapacityWidget, cache: CacheWidget, plan: PlanWidget };
  Array.prototype.forEach.call(document.querySelectorAll(".inf-widget"), function (el) {
    var part = el.getAttribute("data-part");
    if (MAKERS[part]) api[part].push(MAKERS[part](el));
  });
  window.INF_BENCH = {
    mix: api.mix[0], router: api.router[0], capacity: api.capacity[0], cache: api.cache[0], plan: api.plan[0], all: api,
    canon: function () { return E.canon(S); }
  };
})();
