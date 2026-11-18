// UpscalePress – tile planning, colour conversion and the model list. No DOM – tested with node.
const UPC = (() => {
// All three are Real-ESRGAN models by Xintao Wang et al. (BSD-3-Clause), converted to ONNX
const MODELS = {
  standard: { name: 'Standard – photos (fast)', url: 'https://huggingface.co/James040/realesrganfp16-onnx-5mb/resolve/main/model.onnx', size: 4887469, fp16: true, tile: 256, pad: 12, fixed: 0, denoise: true, pro: false },
  best: { name: 'Best detail – photos (slow)', url: 'https://huggingface.co/imgdesignart/realesrgan-x4-onnx/resolve/main/onnx/model.onnx', size: 67100000, fp16: false, tile: 64, pad: 8, fixed: 64, denoise: false, pro: true },
  anime: { name: 'Drawings, anime & logos', url: 'https://huggingface.co/RekluzLabs/realesrgan_anime6b.onnx/resolve/main/realesrgan_anime6b.onnx', size: 18352469, fp16: false, tile: 160, pad: 10, fixed: 0, denoise: false, pro: true },
};
const SCALE = 4; // every model makes the picture 4× bigger; 2× and 3× are made from that
// cut a W×H picture into tiles: core [x, y, w, h] is kept, the input window adds `pad` pixels around it
// (fixed: the model only takes fixed×fixed windows – the core is then fixed − 2·pad)
function plan(W, H, tile, pad, fixed) {
  const core = fixed ? fixed - 2 * pad : tile, out = [];
  for (let y = 0; y < H; y += core) for (let x = 0; x < W; x += core) {
    const w = Math.min(core, W - x), h = Math.min(core, H - y);
    let ix = x - pad, iy = y - pad, iw = w + 2 * pad, ih = h + 2 * pad;
    if (fixed) { iw = ih = fixed; }
    out.push({ x, y, w, h, ix, iy, iw, ih });
  }
  return out;
}
// the input window as planar RGB floats (edges are repeated outside the picture)
function window(rgba, W, H, t, f16) {
  const n = t.iw * t.ih, buf = f16 ? new (typeof Float16Array !== 'undefined' ? Float16Array : Float32Array)(3 * n) : new Float32Array(3 * n);
  for (let yy = 0; yy < t.ih; yy++) {
    const sy = Math.min(H - 1, Math.max(0, t.iy + yy));
    for (let xx = 0; xx < t.iw; xx++) {
      const sx = Math.min(W - 1, Math.max(0, t.ix + xx)), s = (sy * W + sx) * 4, d = yy * t.iw + xx;
      buf[d] = rgba[s] / 255; buf[n + d] = rgba[s + 1] / 255; buf[2 * n + d] = rgba[s + 2] / 255;
    }
  }
  return buf;
}
// model output (planar RGB, 4× the window) → RGBA of the core only
function core(out, t) {
  const OW = t.iw * SCALE, OH = t.ih * SCALE, n = OW * OH, cw = t.w * SCALE, ch = t.h * SCALE, ox = (t.x - t.ix) * SCALE, oy = (t.y - t.iy) * SCALE;
  const px = new Uint8ClampedArray(cw * ch * 4);
  for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
    const s = (oy + y) * OW + ox + x, d = (y * cw + x) * 4;
    px[d] = out[s] * 255; px[d + 1] = out[n + s] * 255; px[d + 2] = out[2 * n + s] * 255; px[d + 3] = 255;
  }
  return px;
}
// half-float bits (for browsers without Float16Array)
function toHalf(f32) { const f = new Float32Array(1), u = new Uint32Array(f.buffer), h = new Uint16Array(f32.length); for (let i = 0; i < f32.length; i++) { f[0] = f32[i]; const b = u[0], s = (b >> 16) & 0x8000, e = ((b >> 23) & 0xff) - 112, m = b & 0x7fffff; h[i] = e <= 0 ? s : e >= 31 ? s | 0x7c00 : s | (e << 10) | (m >> 13); } return h; }
function fromHalf(h) { const o = new Float32Array(h.length); for (let i = 0; i < h.length; i++) { const v = h[i], e = (v >> 10) & 31, m = v & 1023, sg = v & 0x8000 ? -1 : 1; o[i] = e === 0 ? sg * m * 5.960464477539063e-8 : e === 31 ? sg * 65504 : sg * (1 + m / 1024) * Math.pow(2, e - 15); } return o; }
// output size for a scale; the limits keep the picture inside what a browser canvas can hold
function outSize(W, H, scale) { return { w: Math.round(W * scale), h: Math.round(H * scale) }; }
const LIMIT = { side: 16000, mp: 120 };
const fits = (w, h, maxSide, maxMp) => w <= (maxSide || LIMIT.side) && h <= (maxSide || LIMIT.side) && w * h <= (maxMp || LIMIT.mp) * 1e6;
const safeName = (s) => String(s || 'Image').replace(/\.[a-z0-9]{2,4}$/i, '').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Image';
return { MODELS, SCALE, plan, window, core, toHalf, fromHalf, outSize, fits, LIMIT, safeName };
})();
if (typeof module !== 'undefined') module.exports = UPC;
