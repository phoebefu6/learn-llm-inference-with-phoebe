# learn-llm-inference-with-phoebe - official course map (source map)

Internal build document. Never linked from an audience page. Built 2026-11-08 by the course lead.
Bucket `ai`, single-track 6 sessions x 45 min, bench in session 6. Audience: builders (ML / platform
engineers, data scientists, technical PMs) who already ship an LLM feature and now own its bill and its
latency. Question across the course: the feature works; how do we make it cheap and fast enough without
losing quality?

**Fast-moving tooling and prices: re-verify the changelog before delivery.** Every tool, model, version
and price fact below is dated 2026-11-08 and carries "re-verify" by default.

Evidence tiers: **[S] read at source** (fetched and read 2026-11-08) · **[R] reported** (secondary, or a
primary we did not read in full) · **[C] constructed** (invented for teaching, labelled on the page) ·
**[M] modelled** (computed by a stated rule, labelled on the widget).

## Session titles (locked; sibling h1/h2 grepped 2026-11-08)

| # | File | Title | Diff |
|---|------|-------|------|
| 1 | courses/01-where-the-money-goes.html | Where the money and the milliseconds go | foundations (green) |
| 2 | courses/02-routing.html | Routing: not every question needs the big model | core (yellow) |
| 3 | courses/03-batching.html | Batching and the GPU you rent | core (yellow) |
| 4 | courses/04-quantised-serving-and-kv-cache.html | Quantised serving and the KV cache | deeper (orange) |
| 5 | courses/05-caching-as-a-cost-lever.html | Caching as a cost lever | deeper (orange) |
| 6 | courses/06-the-serving-bench.html | The serving bench: Kiln's serving plan | bench night (red) |

Collisions checked: "Where the money went" (finance a3), "Where the money actually goes" (an h2), "The
routing playbook" (when-ai 06), "Routing decisions expire" (an h2). Ours differ in full string. Case names
in use and avoided: Larkline, Beacon, Callwell, Cadence, DataDesk, Lanternfish. "Kiln": 0 hits in courses.

## Running case [C]

**Kiln** (constructed), a fictional B2B SaaS whose in-app assistant launched well; its model bill tripled
in a quarter while p95 first-token latency doubled. One large API model (gpt-4.1 as the stand-in) serves
every request. Every page labels it "Constructed Kiln example". People: Maya (platform engineer), Theo
(product lead), both constructed. Kiln constants [C]: 1,200-token static system prompt + tool definitions
on every request; 1,500,000 requests a month; peak three times the average; floor: 95% acceptable answers;
target: p95 time to first token 1 s on the self-hosted side.

## The bench data [S + M]

- **Rows [S]:** RouteLLM's released dataset `routellm/gpt4_dataset` on Hugging Face, files `train.jsonl`
  (109,101 rows) and `valid.jsonl` (10,000 rows). Licence: Apache-2.0 (dataset card `license: apache-2.0`
  and a LICENSE file in the repo, read 2026-11-08). Each row: a real user prompt (sources lmsys-chat-1m,
  sharegpt, anthropic-hh, flan_v2_*, evol_instruct, ultrachat, false_qa, truthful_qa), GPT-4's answer,
  Mixtral 8x7B's answer, and `mixtral_score` 1-5 (GPT-4 as judge scoring Mixtral's answer). Valid split
  score counts: 5: 6,931; 4: 1,716; 3: 429; 2: 432; 1: 492 (computed). Share scoring 4 or 5: train 86.5%,
  valid 86.5% (computed).
- **RouterBench [S, licence check]:** paper arXiv:2403.12031 says "The code and data are available at
  github.com/withmartian/routerbench". Code licence MIT (GitHub API). The Hugging Face dataset card
  `withmartian/routerbench` has NO licence field. With no stated licence, redistribution is not granted, so
  RouterBench rows are NOT shipped; the course cites the paper only. RouteLLM's data is Apache-2.0, so it is
  the rows we ship. Other RouteLLM HF datasets with an apache-2.0 tag: `gpt4_judge_battles`; several others
  (`arena_battles_embeddings`, `mmlu_battles`, ...) carry no licence tag and were not used.
- **Quality label [C]:** "acceptable" = judge score 4 or 5. The big model's answer is the judge's
  reference, so a request routed big counts as acceptable. The RouteLLM paper itself turns judge output
  into win/tie/loss labels and does not state a score threshold [S, paper v4]; our 4-or-5 bar is ours.
- **Tokens [M]:** characters / 4, rounded up, per prompt and per answer. Labelled an estimate.
- **The router [S data, computed]:** a 12-feature text-only logistic regression (prompt length, line
  count, code marks, digit share, maths words, creative words, reasoning words, question marks, non-ASCII
  share, rewrite verbs, format words, word count) fit with scikit-learn 1.9.0 on train.jsonl to predict
  "scored 4 or 5" (materials/build-inf-sample.py). AUC on all 10,000 valid rows 0.677 (Python only); on the
  shipped sample 0.662 (computed by both engines). It is deliberately cheap and weak: RouteLLM's own
  routers are trained models, not this.
- **Sample:** 2,000 rows from valid.jsonl, seed 20261108. Shipped as integers only, no text: score
  0-1000, judge score, prompt / GPT-4 answer / Mixtral answer token estimates, task id. assets/inf-sample.js,
  53.6 KB. Share acceptable in the sample: 87.1%. Arrival gaps: 3,000 exponential(1) draws, seed 20261109.

## Canon numbers (python == node, 2,452 values, relative tolerance 1e-9; planted 0.1% fault fails)

Run: `python3 materials/inf_reference.py assets/inf-sample.js` vs `node materials/inf-node.js .`, compared
by `materials/compare-ladder.py`. Frozen in materials/canon.json. Strings below are as the widgets print.

**Request mix (session 1, mix widget):** mean prompt 1,300 tokens (1,200 system + real prompt), mean big
answer 250 tokens, mean small answer 288; input is 56.5% of the gpt-4.1 bill. Llama 3.1 8B BF16, batch of
one [M]: L4 prefill 345 ms, decode 90.3 ms per token, whole answer 22.5 s, one decode token = 340x a prompt
token in GPU time; H100 prefill 42 ms, decode 8.1 ms, whole answer 2.02 s, 249x.

**Router (session 2 and bench Part A), gpt-4.1 / gpt-4.1-mini prices:**

| Policy | Threshold | To small | Acceptable | Weak answers shipped | Cost per 1,000 | Saving |
|---|---|---|---|---|---|---|
| Everything big | | 0.0% | 100.0% | 0 | $4.60 | 0.0% |
| Learned | 0.85 | 67.4% (1,348) | 93.4% (1,868) | 132 | $2.15 | 53.3% |
| Learned | 0.87 | 59.0% (1,179) | 95.7% (1,913) | 87 | $2.49 | 45.9% |
| Learned | 0.90 | 42.7% (854) | 97.4% (1,947) | 53 | $3.08 | 33.0% |
| Length, up to 50 tokens (cheapest at floor) | 50 | 56.2% | 95.5% | 91 | $2.61 | 43.2% |
| Scrambled (break), cheapest at floor | 0.91 | 33.8% | 96.2% | 77 | $3.37 | 26.7% |
| Scrambled at 0.87 | 0.87 | 59.0% | 92.7% | 147 | $2.45 | |
| Everything small (anti-lever) | | 100.0% | 87.1% | 259 | $0.98 | 78.7% |
| Hindsight (ceiling) | | 87.1% | 100.0% | 0 | $1.44 | 68.7% |

Cheapest learned threshold clearing 95%: 0.87. AUC on the sample: learned 0.662, length 0.631, scrambled
0.529. Presets at 0.87: gpt-5 / gpt-5-mini $2.21 vs $4.12 all big (46.5%); RouteLLM paper prices $8.79 vs
$20.49 (57.1%), all small $0.38 (98.1%).

**Capacity (session 3, 4 and bench Part B), Llama 3.1 8B unless stated, [M], target p95 TTFT 1 s:**

| Config | Weights | KV/token | KV pool | Seqs | Decode b=1 | Max load at 1 s | $/1,000 req | $/1M out |
|---|---|---|---|---|---|---|---|---|
| L4 BF16 | 16.1 GB | 128 KB | 30,818 tok | 19 | 90.4 ms | 0.25 req/s | $0.89 | $3.20 |
| L4 FP8 weights | 8.0 GB | 128 KB | 92,084 | 57 | 45.8 ms | 0.75 | $0.30 | $1.08 |
| L4 INT4 weights | 4.0 GB | 128 KB | 122,717 | 77 | 23.5 ms | 0.75 | $0.30 | $1.07 |
| L4 FP8 + FP8 KV | 8.0 GB | 64 KB | 184,169 | 115 | 45.2 ms | 0.75 | $0.30 | $1.07 |
| L4 FP8, reserved KV (no paging) | 8.0 GB | 128 KB | 92,084 | 22 | 45.8 ms | 0.5 | $0.44 | $1.60 |
| L4 FP8, static batching + reserved | 8.0 GB | | | 22 | | none (p95 30.5 s at 0.25) | | |
| L4 FP8 + prefix cache | 8.0 GB | 128 KB | 92,084 | 57 | 45.8 ms | 1.5 | $0.15 | $0.56 |
| A100 BF16 | 16.1 GB | 128 KB | 415,340 | 256 | 13.3 ms | 4 | $0.17 | $0.64 |
| H100 BF16 | 16.1 GB | 128 KB | 415,340 | 256 | 8.1 ms | 12 | $0.10 | $0.41 |
| H100, 70B BF16 | does not fit (141.1 GB of weights vs 72.0 GB usable) | | | | | | | |
| H100, 70B INT4 | 35.3 GB | 320 KB | 107,492 | 67 | 17.8 ms | 0.75 | $1.67 | $5.97 |

Usable memory: L4 21.6 GB, A100/H100 72.0 GB. Prefill of the 1,200-token system prompt alone on L4 319 ms.
At 1 req/s p95: FP8 1.25 s, INT4 1.09 s, FP8 + FP8 KV 1.16 s (all miss 1 s). L4 FP8 sweep p95: 0.25 req/s 656 ms, 0.5 772 ms, 0.75 957 ms, 1 1.25 s, 1.25 53.3 s; mean batch 3.8 / 9.0 /
17.0 / 30.6 / 46.7; tokens/s 70 / 139 / 206 / 271 / 313. Static at 0.5: 48.4 s. Reserved at 0.75: 11.1 s.
Prefix cache: p95 174 ms at 0.25, 335 ms at 1.5, 71.3 s at 2. H100 BF16: 60 ms at 0.25, 257 ms at 12.
One GPU-month (730 h): L4 $584, A100 $1,825, H100 $3,285.

**Cache (session 5 and bench Part C), same traffic, big model answers, hit rate 90% unless stated:**

| Model | Layout | No cache /1,000 | Prompt cache /1,000 | Saving |
|---|---|---|---|---|
| Claude Sonnet 4.5 | dynamic first | $7.65 | $7.65 | 0.0% |
| Claude Sonnet 4.5 | static first | $7.65 | $4.82 | 37.0% |
| Claude Sonnet 4.5 | static first, hit 50% | | $6.48 | 15.3% |
| Claude Sonnet 4.5 | static first, hit 10% (anti) | | $8.13 | -6.4% (costs more) |
| Claude Haiku 4.5 | static first (prefix 1,200 < 4,096 minimum) | $2.55 | $2.55 | 0.0% |
| gpt-4.1 | static first | $4.60 | $2.98 | 35.2% |

Write premium (1.25x write, 0.1x read) pays off above a 21.7% hit rate. Answer cache [C inputs]: short expiry
(10% hits, 2% wrong) $4.34, 43.3% saving, 2.0 wrong answers per 1,000; long expiry (25%, 8%) $3.61, 52.7%,
20.0 wrong per 1,000.

**The plan (bench), 1,500,000 requests/month:**

| Plan | Monthly | Per 1,000 | Big side | Small side | Acceptable | Saving | Floor |
|---|---|---|---|---|---|---|---|
| Today, everything gpt-4.1 | $6,896 | $4.60 | $6,896 | $0 | 100.0% | 0.0% | clears |
| Cache only | $4,466 | $2.98 | $4,466 | $0 | 100.0% | 35.2% | clears |
| Router + gpt-4.1-mini | $3,732 | $2.49 | $2,850 | $882 | 95.7% | 45.9% | clears |
| Router + own L4 (FP8, prefix cache; easy-side peak 1.02 req/s) | $3,434 | $2.29 | $2,850 | $584 (1 GPU, 1.5 req/s) | 95.7% | 50.2% | clears |
| Full stack (router + L4 + prompt cache) | $2,436 | $1.62 | $1,852 | $584 | 95.7% | 64.7% | clears |
| Full stack on an H100 | $5,137 | $3.42 | $1,852 | $3,285 (1 GPU, 12 req/s) | 95.7% | 25.5% | clears |
| Everything small on own L4s (anti) | $1,168 | $0.78 | $0 | $1,168 (2 GPUs) | 87.1% | 83.1% | FAILS |
| Full stack, scrambled router (break) | $2,391 | $1.59 | $1,807 | $584 | 92.7% | 65.3% | FAILS |

Model check: the roofline says Llama 3.1 8B decodes at 8.1 ms per token on an H100 with one request; vLLM's
2024 performance post reports "1 token every 13 ms under light load" for Llama 3 8B (GPU not named in that
sentence; the post benchmarks A100 and H100). The model is optimistic; say so on every capacity number.
Quality data is GPT-4 vs Mixtral 8x7B; the self-hosted model in capacity is Llama 3.1 8B. They are
different small models: the routing numbers teach the shape, re-measure with your own small model.

## Prices [S, list price, read 2026-11-08, re-verify]

- **OpenAI** (developers.openai.com/api/docs/pricing; platform.openai.com redirects), standard per 1M,
  input / cached input / output: gpt-5 $1.25 / $0.125 / $10.00; gpt-5-mini $0.25 / $0.025 / $2.00; gpt-5-nano
  $0.05 / $0.005 / $0.40; gpt-4.1 $2.00 / $0.50 / $8.00; gpt-4.1-mini $0.40 / $0.10 / $1.60; gpt-4o-mini $0.15 /
  $0.075 / $0.60. Newer models also listed (gpt-5.4, gpt-5.5, gpt-5.6 family); not used. Batch tier: gpt-5
  $0.625 / $0.0625 / $5.00.
- **OpenAI Batch API** (guides/batch): "50% cost discount compared to synchronous APIs"; "Each batch
  completes within 24 hours (and often more quickly)"; the completion window can only be `24h`.
- **OpenAI prompt caching** (guides/prompt-caching): "enabled by default for supported OpenAI models";
  minimum cacheable prompt 1,024 tokens for GPT-5.6 and later, "varies by request settings for earlier
  models" (so the bench's 1,024 for gpt-4.1 is an assumption, labelled); in-memory retention "around 5 to
  10 minutes of inactivity, up to one hour", extended up to 24 hours; put "stable developer instructions and
  shared reference material first".
- **Anthropic** (platform.claude.com/docs/en/about-claude/pricing; docs.claude.com redirects), per MTok
  base input / 5-min write / 1-h write / cache hit / output: Sonnet 4.5 $3 / $3.75 / $6 / $0.30 / $15 (the
  caching page labels Sonnet 4.5 deprecated); Haiku 4.5 $1 / $1.25 / $2 / $0.10 / $5; Opus 4.5 to 4.8 and Opus
  5 $5 / $6.25 / $10 / $0.50 / $25; Sonnet 5.5 $2 / $2.50 / $4 / $0.10 / $10. Batch: "a 50 percent discount on
  both input and output tokens".
- **Anthropic prompt caching** (build-with-claude/prompt-caching): write 1.25x (5 min), 2x (1 h), read 0.1x
  base input (exceptions: Opus 5.5 and Sonnet 5.5 reads 0.05x); "Cache prefixes are created in the following
  order: tools, system, then messages"; "up to 4 cache breakpoints"; default 5-minute lifetime; minimum
  cacheable 1,024 tokens for Sonnet 4.5 / 4.6 / 5 and Opus 4.8, 4,096 for Haiku 4.5, Opus 4.5 and 4.6, 2,048
  for Opus 4.7, 512 for the 5.5 family.
- **Hugging Face Inference Endpoints** per hour, AWS, 1 GPU (huggingface.co/pricing): L4 $0.80, L40S $1.80,
  A100 80GB $2.50, H100 80GB $4.50, H200 $5.00, B200 $9.25. The docs page
  (huggingface.co/docs/inference-endpoints/pricing) lists L4 $0.80, A10G $1, L40S $1.80, A100 $2.50 and H100
  on GCP only at $10/h: **the two pages disagree on H100**; the bench uses $4.50 and the widget says read
  2026-11-08, re-verify.
- **Together AI** (together.ai/pricing): dedicated inference HGX H100 $5.49 per GPU-hour on demand; GPU
  clusters H100 $3.99 on demand, $1.99 preemptible. Serverless Qwen2.5 7B Instruct Turbo $0.30 / $0.30 per
  1M. Llama 3.1 8B and 3.3 70B are no longer listed as serverless.

## Hardware and model facts [S]

- NVIDIA L4 (nvidia.com/en-us/data-center/l4): 24 GB, 300 GB/s; FP16/BF16 242 TFLOPS and FP8 485 "shown
  with sparsity. Specifications are one-half lower without sparsity" -> dense BF16 121 (our arithmetic).
- A100 80GB (nvidia.com/en-us/data-center/a100): 1,935 GB/s PCIe, 2,039 GB/s SXM; BF16 312 TFLOPS dense,
  624 with sparsity.
- H100 (nvidia.com/en-us/data-center/h100): SXM 80 GB, 3.35 TB/s, BF16 1,979 TFLOPS with sparsity (dense
  989.5, our arithmetic); NVL 94 GB, 3.9 TB/s.
- Llama 3.1 8B Instruct config.json (unsloth mirror; meta-llama is gated, HTTP 401): 32 layers, 8 KV heads,
  hidden 4096, 32 attention heads, head_dim 128, intermediate 14,336, vocab 128,256. Parameters computed
  from these shapes (untied embeddings): 8,030,261,248.
- Llama 3.1 70B Instruct config.json (unsloth mirror): 80 layers, 8 KV heads, hidden 8192, 64 heads (head dim
  128 derived), intermediate 28,672. Computed parameters 70,553,706,496.
- Qwen2.5 7B Instruct config.json: 28 layers, 4 KV heads, hidden 3584, 28 heads (head dim 128 derived).
- KV bytes per token = 2 (K and V) x layers x KV heads x head dim x bytes: Llama 3.1 8B BF16 131,072 bytes =
  128 KB; 70B 320 KB; Qwen2.5 7B 56 KB (computed). Cross-check with PagedAttention's OPT-13B example: "2 x
  5120 x 40 x 2" = 800 KB per token [S].

## Modelling choices [M] (all on the widget)

Usable GPU memory 90% (vLLM's `--gpu-memory-utilization` default is now 0.92, or 1.0 with the extensible KV
cache [S]); 1.5 GB held back for activations and runtime; memory-bandwidth efficiency 0.6; MFU 0.5 on
dense BF16 TFLOPS for every precision (INT4 weight-only computes in 16-bit; FP8 tensor-core speedups not
modelled); at most 256 sequences (vLLM's `--max-num-seqs` default not read at source); reserved-KV mode
reserves 4,096 tokens per slot; static batching admits a new batch only when the last one fully finishes;
paged continuous batching reserves each request's final length at admission (no preemption); with the
prefix cache on, the 1,200-token system prompt is never re-prefilled. Arrivals: 1,000 requests, Poisson.

## Sources read at source [S] (citation appendix; cite in this form)

1. Kwon et al. 2023, "Efficient Memory Management for Large Language Model Serving with PagedAttention",
   SOSP 2023, arXiv:2309.06180. vLLM "improves the throughput of popular LLMs by 2-4x" vs FasterTransformer
   and Orca; "near-zero waste in KV cache memory"; in existing systems "only 20.4% - 38.2% of the KV cache
   memory is used to store the actual token states"; OPT-13B: one token's KV "800 KB", a 2,048-token request
   "can be as much as 1.6 GB"; 13B on an A100 40GB: about 65% of memory for weights, close to 30% for KV.
   The often-quoted "60-80% waste" and "under 4%" are NOT in the paper text (vLLM's Fig. 2 bar reads 96.3%
   used); do not quote them.
2. Yu et al. 2022, "Orca: A Distributed Serving System for Transformer-Based Generative Models", OSDI 2022
   (usenix.org/conference/osdi22/presentation/yu). Iteration-level scheduling, selective batching; "36.9x
   throughput improvement at the same level of latency" vs NVIDIA FasterTransformer, GPT-3 175B.
3. Chen, Zaharia, Zou 2023, "FrugalGPT", arXiv:2305.05176. API fees "can differ by two orders of
   magnitude"; cascade can "match the performance of the best individual LLM (e.g. GPT-4) with up to 98%
   cost reduction or improve the accuracy over GPT-4 by 4% with the same cost".
4. Ong et al. 2024, "RouteLLM: Learning to Route LLMs with Preference Data", arXiv:2406.18665 (v4 Feb 2025).
   "reduce costs by over 2 times without sacrificing response quality"; four routers (similarity-weighted
   ranking, matrix factorization, BERT classifier, causal LLM classifier); 80k Chatbot Arena battles (about
   65k comparisons after filtering); GPT-4-judge augmentation about 120K samples for about $700; strong
   gpt-4-1106-preview, weak Mixtral 8x7B; assumed prices GPT-4 $10 / $30 per 1M, Mixtral $0.24; metrics PGR,
   CPT, APGR; Table 6 cost-saving ratios at 50% / 80% PGR: MT Bench 3.66x / 2.49x, MMLU 1.41x / 1.14x, GSM8K
   1.49x / 1.27x. The repo README's "up to 85%" is a README claim, not a paper result [R if quoted].
   Repo licence Apache-2.0.
5. Hu et al. 2024, "RouterBench: A Benchmark for Multi-LLM Routing System", arXiv:2403.12031. "over 405k
   inference outcomes" (body: 405,467); datasets MMLU, HellaSwag, Winogrande, ARC Challenge, GSM8K, MBPP,
   MT-Bench, RAG. Model count inconsistent in the paper (14 vs 11); HF card says 11 models. Data licence:
   none stated (see above).
6. Zheng et al. 2023/2024, "SGLang: Efficient Execution of Structured Language Model Programs",
   arXiv:2312.07104: "RadixAttention for KV cache reuse"; "up to 6.4x higher throughput". LMSYS blog
   2024-01-17: radix tree of KV for prompts and generations, LRU eviction of leaves; "up to 5 times higher
   throughput" (the blog's number differs from the paper's; both are each source's own benchmark).
7. Agrawal et al. 2024, "Taming Throughput-Latency Tradeoff in LLM Inference with Sarathi-Serve",
   arXiv:2403.02310: chunked prefills, stall-free scheduling; vs vLLM, Mistral-7B on one A100 2.6x serving
   capacity, Yi-34B on two A100s up to 3.7x, Falcon-180B up to 5.6x.
8. Zhong et al. 2024, "DistServe", OSDI 2024, arXiv:2401.09670: prefill and decode on different GPUs; "7.4x
   more requests or 12.6x tighter SLO".
9. Kurtic et al. 2024, "'Give Me BF16 or Give Me Death'? Accuracy-Performance Trade-Offs in LLM
   Quantization", ACL 2025, arXiv:2411.02355: "FP8 (W8A8-FP) is effectively lossless across all model
   scales"; "well-tuned INT8 (W8A8-INT) achieves surprisingly low (1-3%) accuracy degradation"; "INT4
   weight-only (W4A16-INT) is more competitive than expected, rivaling 8-bit"; over 500,000 evaluations on
   the Llama-3.1 family; "W4A16 is the most cost-efficient for synchronous setups, while W8A8 dominates in
   asynchronous continuous batching". Body tables not read.
10. Lin et al. 2023, "AWQ", MLSys 2024, arXiv:2306.00978: "Protecting only 1% salient weights can greatly
   reduce quantization error"; TinyChat more than 3x over the Hugging Face FP16 implementation.
11. Frantar et al. 2022, "GPTQ", ICLR 2023, arXiv:2210.17323: 175B quantised "in approximately four GPU
   hours" to 3 or 4 bits; runs 175B on a single GPU; around 3.25x (A100) and 4.5x (A6000) over FP16.
12. Leviathan, Kalman, Matias 2023, "Fast Inference from Transformers via Speculative Decoding", ICML 2023,
   arXiv:2211.17192: "2X-3X acceleration" on T5-XXL "without any changes to the outputs".
13. Pope et al. 2022, "Efficiently Scaling Transformer Inference", arXiv:2211.05102: "29ms per token during
   generation (using int8 weight quantization)" at low batch; "76% MFU during large-batch-size processing of
   input tokens"; multiquery attention enables up to 32x larger context. The abstract does not use the words
   prefill / decode / memory bandwidth: the "decode is bandwidth-bound" explanation is our roofline
   arithmetic plus the generation vs input-processing contrast in this abstract.
14. vLLM docs (docs.vllm.ai, Apache-2.0 project): Automatic Prefix Caching "we hash each kv-cache block by the
   tokens in the block and the tokens in the prefix before the block", "We only cache full blocks", LRU
   eviction; PagedAttention design page now marked "a historical document"; quantization list (AutoAWQ,
   BitsAndBytes, GPTQModel, LLM Compressor FP8 W8A8 / INT4 W4A16 / INT8 W8A8, Quantized KV Cache, TorchAO,
   GGUF, ...); chunked prefill "enabled by default whenever possible" in V1; `--gpu-memory-utilization`
   default 0.92 (1.0 with extensible KV cache).
15. vLLM blog 2024-09-05 "vLLM v0.6.0" (vllm.ai/blog/2024-09-05-perf-update): Llama 8B on 1x H100 "2.7x
   higher throughput and 5x faster TPOT" vs v0.5.3; 70B on 4x H100 1.8x / 2x; ShareGPT 500 prompts; "Llama3 8B
   can generate 1 token every 13 ms under light load".
16. SGLang docs (docs.sglang.io): "RadixAttention, prefix caching, and multi-GPU parallelism".
17. Hugging Face TGI docs: "text-generation-inference is now in maintenance mode"; recommends vLLM and
   SGLang (and llama.cpp / MLX locally); features include continuous batching.
18. NVIDIA TensorRT-LLM overview: "In-flight batching"; "Paged KV cache with intelligent block reuse"; FP8
   "can double performance and halve memory consumption compared to 16-bit"; FP4 on B200.
19. DeepLearning.AI short courses (map, not replace; videos and certificates stay official):
   "Efficiently Serving LLMs" (Travis Addair, Predibase, 2h 9m: Text Generation, Batching, Continuous
   Batching, Quantization, Low-Rank Adaptation, Multi-LoRA Inference); "Quantization Fundamentals with
   Hugging Face" (Younes Belkada, Marc Sun, 1h14m); "Quantization in Depth" (Marc Sun, Younes Belkada, 2h20m,
   18 lessons).

## Teach the disagreement (do not resolve)

- **How much routing saves.** RouteLLM paper "over 2 times" (MT Bench 3.66x at 50% PGR but MMLU 1.41x);
  RouteLLM README "up to 85%"; FrugalGPT "up to 98%" on its tasks; our cheap router 45.9% at a 95% floor on
  2,000 RouteLLM rows. Each is its own benchmark and its own quality bar; savings depend on the task mix.
- **Quantisation cost.** Kurtic et al.: FP8 effectively lossless, INT8 1-3%, INT4 weight-only rivals 8-bit,
  on Llama 3.1 with their evals. Practitioners still report task-specific drops; the honest rule is "run
  your own eval at the precision you will serve".
- **Engine throughput claims.** PagedAttention 2-4x, SGLang paper up to 6.4x vs SGLang blog up to 5x,
  Sarathi-Serve 2.6-5.6x vs vLLM, DistServe 7.4x requests, Orca 36.9x vs FasterTransformer. Each against a
  baseline of its own time; none adds up with the others.
- **Self-host vs API.** Our bench: one L4 beats gpt-4.1-mini for Kiln's small side ($584 vs $882) but an
  H100 loses ($3,285); people and on-call cost not counted. Vendors on both sides argue their side.

## Seams (link, never reteach; absolute https)

- learn-fine-tuning-slm-with-phoebe s6 (per-token vs flat line, break-even, "one L4 at $584/mo assumed
  fully usable"): https://phoebefu6.github.io/learn-fine-tuning-slm-with-phoebe/courses/06-the-break-even-bench.html
  ; s2 weights memory by hand: https://phoebefu6.github.io/learn-fine-tuning-slm-with-phoebe/courses/02-small-models-trade-offs.html
  ; s4 QLoRA: https://phoebefu6.github.io/learn-fine-tuning-slm-with-phoebe/courses/04-lora-and-qlora.html .
  We own what the flat line SERVES (0.75 req/s on L4 FP8 at the 1 s target, 1.5 with prefix cache).
- learn-ai-observability-with-phoebe a4 / b4 (prompt-caching ACCOUNTING):
  https://phoebefu6.github.io/learn-ai-observability-with-phoebe/courses/a4-what-ai-costs-you.html and
  https://phoebefu6.github.io/learn-ai-observability-with-phoebe/courses/b4-cost-and-latency-per-span.html .
  We own caching as DESIGN.
- learn-agent-launch-with-phoebe b3 (TTFT vs total latency SLOs, p95 tails, cost per task):
  https://phoebefu6.github.io/learn-agent-launch-with-phoebe/courses/b3-operational-metrics.html . We own the mechanism.
- learn-voice-multimodal-agents-with-phoebe s2 (voice latency waterfall):
  https://phoebefu6.github.io/learn-voice-multimodal-agents-with-phoebe/courses/02-the-latency-waterfall.html . Linked as an applied case.
- learn-claude-with-phoebe 65 https://phoebefu6.github.io/learn-claude-with-phoebe/courses/65-features.html / learn-langchain: API features; we mention provider batch APIs as an async
  cost lever only.

## Per-session coverage

1. **Where the money and the milliseconds go.** Prefill (all prompt tokens in parallel, compute-bound)
   vs decode (one token per step, every step re-reads the weights: memory-bandwidth-bound); TTFT vs time
   per output token; why output tokens are priced higher (gpt-4.1 $8 vs $2; Sonnet 4.5 $15 vs $3); the
   roofline arithmetic; build-along: the mix widget on Kiln's real request mix. Sources 13, 15, OpenAI and
   Anthropic pricing, GPU specs, DLAI "Text Generation".
2. **Routing.** Fixed tiers, cascades (FrugalGPT), learned routers (RouteLLM); the router's own error as
   a cost (weak answers shipped); the frontier; break button; build-along: router widget at 0.85 / 0.87 /
   0.90. Sources 3, 4, 5, RouteLLM data.
3. **Batching and the GPU you rent.** Static vs continuous (Orca), throughput vs tail latency, utilisation
   and the flat line; chunked prefill (Sarathi-Serve) and disaggregation (DistServe) as Self-study;
   build-along: Kiln's max load at the 1 s target on an L4. Sources 2, 7, 8, 14, 17, 18, DLAI batching.
4. **Quantised serving and the KV cache.** KV bytes per token, PagedAttention, concurrency ceiling,
   weight precision (FP8 / INT8 / INT4 W4A16) and KV precision, quality cost from Kurtic et al., AWQ and
   GPTQ; 70B fit; build-along: fit Kiln's model + KV on one GPU. Sources 1, 9, 10, 11, 14, configs, DLAI
   quantization courses.
5. **Caching as a cost lever.** Prompt layout for prefix hits (provider caches), KV prefix reuse
   (vLLM APC, SGLang RadixAttention), the minimum-length trap, write premium vs hit rate, semantic answer
   cache: hit rate vs staleness and wrong answers; build-along: re-lay out Kiln's prompt and price it.
   Sources 6, 14, 16, Anthropic and OpenAI caching docs; link observability a4 for accounting.
6. **Bench.** API vs managed endpoint vs self-hosted; stack router + batching + quantisation + cache;
   anti-lever and break button; batch APIs as an async lever (50%); speculative decoding as Self-study
   (source 12); capstone: Kiln's decision memo. All widgets.

## Not covered (honest list)

- Running a real model in the browser (impossible): capacity is a labelled model, not a measurement.
- Training any router beyond the cheap logistic one; RouteLLM's matrix-factorisation and BERT routers.
- Multi-GPU tensor / pipeline parallelism, MoE serving internals, multi-LoRA serving (DLAI covers it).
- Kubernetes, autoscaling policy, cold starts, and the people / on-call cost of self-hosting.
- Speculative decoding beyond a Self-study card; FP4 / Blackwell.
- Per-task quantisation evals: we quote Kurtic et al.'s abstract only.
- Measured latency for API models: provider latency is theirs to publish and yours to measure.
- Prompt-caching accounting depth (learn-ai-observability), launch SLO governance (learn-agent-launch).
