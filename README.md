# Learn LLM Inference and Model Serving with Phoebe

Six 45-minute sessions for builders who ship an LLM feature and now own its bill and its latency:
where the money and the milliseconds go (prefill and decode), routing between a big and a small model,
batching and the GPU you rent, quantised serving and the KV cache, caching as a cost lever, and a
serving bench that stacks them into one monthly bill.

- Running case: Kiln, a constructed B2B software company. Every Kiln number is labelled constructed.
- Bench rows: 2,000 held-out prompts from RouteLLM's released dataset `routellm/gpt4_dataset`
  (Apache-2.0), shipped as integers only. Router quality, routing share and cost are computed in the
  browser (`assets/inf-live.js`) and reproduced by an independent Python reference.
- GPU capacity is a labelled model (roofline plus a seeded queue), not a measurement.
- Prices are vendor list prices read 2026-11-08; re-verify before use.

Open `index.html` in a browser; no build step. By Phoebe Fu.
