// UpscalePress – AI upscaling worker: Real-ESRGAN (BSD-3-Clause) run with ONNX Runtime Web (WebGPU, or the processor).
// The picture is cut into tiles with a margin around them, so there are no visible seams. Nothing is uploaded.
import * as ort from 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0/dist/ort.webgpu.min.mjs';
ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0/dist/';
ort.env.wasm.numThreads = 1;
let UPC = null;
const CACHE = 'upscalepress-model';
async function core() { if (!UPC) { const src = await (await fetch(new URL('up-core.js', self.location.href))).text(); UPC = new Function(src + '\nreturn UPC;')(); } return UPC; }
async function bytes(m) {
  let cache = null; try { cache = await caches.open(CACHE); } catch (_) {}
  let res = cache ? await cache.match(m.url) : null;
  if (res) return new Uint8Array(await res.arrayBuffer());
  res = await fetch(m.url); if (!res.ok) throw new Error('The AI model could not be downloaded (' + res.status + '). Check the internet connection.');
  const total = Number(res.headers.get('Content-Length')) || m.size, rd = res.body.getReader(), parts = []; let got = 0, last = 0;
  for (;;) { const { done, value } = await rd.read(); if (done) break; parts.push(value); got += value.length; if (got - last > 1e6) { last = got; postMessage({ type: 'progress', phase: 'download', p: got / total }); } }
  if (got < m.size * 0.9) throw new Error('The AI model download was cut off. Please try again.');
  const b = new Uint8Array(got); let o = 0; for (const p of parts) { b.set(p, o); o += p.length; }
  if (cache) try { await cache.put(m.url, new Response(b, { headers: { 'Content-Type': 'application/octet-stream' } })); } catch (_) {}
  return b;
}
const sessions = {};
let device = '';
async function session(key, force) {
  const k = key + (force || '');
  if (sessions[k]) return sessions[k];
  const U = await core(), m = U.MODELS[key], b = await bytes(m);
  postMessage({ type: 'progress', phase: 'load', p: 0 });
  let gpu = false; try { gpu = !!(navigator.gpu && (await navigator.gpu.requestAdapter())); } catch (_) {}
  const tries = force ? [force] : gpu ? ['webgpu', 'wasm'] : ['wasm'];
  let err = null;
  for (const ep of tries) { try { sessions[k] = await ort.InferenceSession.create(b, { executionProviders: [ep] }); device = ep; return sessions[k]; } catch (e) { err = e; } }
  throw err || new Error('The AI model could not start on this computer.');
}
let cancel = false;
self.onmessage = async (e) => {
  const msg = e.data;
  if (msg.type === 'cancel') { cancel = true; return; }
  if (msg.type !== 'run') return;
  cancel = false;
  try {
    const U = await core(), m = U.MODELS[msg.model];
    let s = await session(msg.model, msg.force);
    const rgba = new Uint8ClampedArray(msg.rgba), W = msg.W, H = msg.H;
    const tiles = U.plan(W, H, m.tile, m.pad, m.fixed), t0 = Date.now(), hasF16 = typeof Float16Array !== 'undefined';
    postMessage({ type: 'progress', phase: 'run', p: 0, device });
    for (let k = 0; k < tiles.length; k++) {
      if (cancel) throw new Error('cancelled');
      const t = tiles[k];
      let x = U.window(rgba, W, H, t, m.fp16);
      const feeds = {};
      if (m.fp16 && !hasF16) x = U.toHalf(x);
      feeds[s.inputNames[0]] = new ort.Tensor(m.fp16 ? 'float16' : 'float32', x, [1, 3, t.ih, t.iw]);
      if (m.denoise && s.inputNames[1]) { const d = Math.max(0, Math.min(1, msg.denoise == null ? 0.5 : msg.denoise)); feeds[s.inputNames[1]] = new ort.Tensor('float16', hasF16 ? new Float16Array([d]) : U.toHalf(new Float32Array([d])), [1]); }
      const r = await s.run(feeds), o = r[s.outputNames[0]];
      let d = o.data; if (d instanceof Uint16Array) d = U.fromHalf(d);
      const px = U.core(d, t);
      try { o.dispose && o.dispose(); } catch (_) {}
      postMessage({ type: 'tile', x: t.x * 4, y: t.y * 4, w: t.w * 4, h: t.h * 4, px }, [px.buffer]);
      const el = (Date.now() - t0) / 1000;
      postMessage({ type: 'progress', phase: 'run', p: (k + 1) / tiles.length, eta: (el / (k + 1)) * (tiles.length - k - 1), device });
    }
    postMessage({ type: 'done', device });
  } catch (err) { postMessage({ type: 'error', message: String((err && err.message) || err), device }); }
};
