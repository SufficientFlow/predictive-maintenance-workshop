// Tiny canvas line chart. points: [{t, v}]. Fixed y-range on purpose: auto-scaling would make
// normal noise look like a fault.
//
// markers: [{t, color, dashed, label, labelAt: 'top' | 'bottom'}]

export const COLORS = { temp: '#ffa94d', you: '#ffd43b', model: '#c9a7ff' };

export function drawChart(canvas, points, opts = {}) {
  const { yMin = 35, yMax = 95, markers = [], color = COLORS.temp } = opts;
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (!w || !h) return;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  const t0 = opts.tMin ?? points[0]?.t ?? 0;
  const t1 = opts.tMax ?? points.at(-1)?.t ?? 1;
  const pad = 6;
  const x = (t) => ((t - t0) / Math.max(1, t1 - t0)) * w;
  const y = (v) => {
    const f = (v - yMin) / (yMax - yMin);
    return pad + (1 - Math.min(1, Math.max(0, f))) * (h - 2 * pad);
  };

  // Gridlines
  ctx.strokeStyle = 'rgba(232, 238, 244, 0.08)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 1; i < 4; i++) {
    const gy = Math.round((h * i) / 4) + 0.5;
    ctx.moveTo(0, gy);
    ctx.lineTo(w, gy);
  }
  ctx.stroke();

  // Temperature line
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  let first = true;
  for (const p of points) {
    if (p.t < t0) continue;
    if (first) ctx.moveTo(x(p.t), y(p.v));
    else ctx.lineTo(x(p.t), y(p.v));
    first = false;
  }
  ctx.stroke();

  // Markers
  ctx.font = '13px "IBM Plex Sans", system-ui, sans-serif';
  for (const m of markers) {
    if (m.t < t0 || m.t > t1) continue;
    const mx = Math.round(x(m.t)) + 0.5;
    ctx.strokeStyle = m.color;
    ctx.lineWidth = 2;
    ctx.setLineDash(m.dashed ? [5, 4] : []);
    ctx.beginPath();
    ctx.moveTo(mx, 0);
    ctx.lineTo(mx, h);
    ctx.stroke();
    ctx.setLineDash([]);
    if (m.label) {
      ctx.fillStyle = m.color;
      if (m.labelAt === 'bottom') {
        ctx.textAlign = 'right';
        ctx.fillText(m.label, mx - 6, h - 10);
      } else {
        ctx.textAlign = 'left';
        ctx.fillText(m.label, mx + 6, 20);
      }
    }
  }
}
