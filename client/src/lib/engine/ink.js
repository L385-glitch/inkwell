// Pure ink rendering helpers (page coordinate space, 1 unit = 1 CSS px of the page)

export const A4 = { w: 794, h: 1123 };

export const PEN_COLORS = ['#1f2937', '#ffffff', '#dc2626', '#2563eb', '#16a34a', '#d97706'];
export const HIGHLIGHTER_COLORS = ['#fde047', '#bbf7d0', '#bfdbfe', '#fbcfe8', '#fed7aa'];

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
}

export function drawStroke(ctx, s) {
  const pts = s.points;
  if (!pts || pts.length === 0) return;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (s.tool === 'highlighter') {
    ctx.globalAlpha = 0.4;
    ctx.globalCompositeOperation = 'multiply';
    ctx.strokeStyle = s.color;
    ctx.lineWidth = s.size;
    ctx.beginPath();
    if (pts.length === 1) {
      ctx.moveTo(pts[0][0] - 0.1, pts[0][1]);
      ctx.lineTo(pts[0][0] + 0.1, pts[0][1]);
    } else {
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length - 1; i++) {
        const mx = (pts[i][0] + pts[i + 1][0]) / 2;
        const my = (pts[i][1] + pts[i + 1][1]) / 2;
        ctx.quadraticCurveTo(pts[i][0], pts[i][1], mx, my);
      }
      ctx.lineTo(pts[pts.length - 1][0], pts[pts.length - 1][1]);
    }
    ctx.stroke();
  } else {
    ctx.strokeStyle = s.color;
    if (pts.length === 1) {
      ctx.fillStyle = s.color;
      const r = (s.size * (0.4 + 0.6 * pts[0][2])) / 2;
      ctx.beginPath();
      ctx.arc(pts[0][0], pts[0][1], Math.max(r, 0.5), 0, Math.PI * 2);
      ctx.fill();
    } else {
      for (let i = 1; i < pts.length; i++) {
        const p0 = pts[i - 1];
        const p1 = pts[i];
        ctx.lineWidth = Math.max(0.5, s.size * (0.4 + 0.6 * (p0[2] + p1[2]) / 2));
        ctx.beginPath();
        ctx.moveTo(p0[0], p0[1]);
        ctx.lineTo(p1[0], p1[1]);
        ctx.stroke();
      }
    }
  }
  ctx.restore();
}

export function drawTextItem(ctx, t) {
  if (!t.text) return;
  ctx.save();
  ctx.fillStyle = t.color;
  ctx.font = `${t.size}px -apple-system, "Segoe UI", Roboto, "Helvetica Neue", sans-serif`;
  ctx.textBaseline = 'top';
  const lines = wrapText(ctx, t.text, t.w || 320);
  let y = t.y;
  for (const line of lines) {
    ctx.fillText(line, t.x, y);
    y += t.size * 1.35;
  }
  ctx.restore();
}

export function wrapText(ctx, text, maxW) {
  const out = [];
  for (const raw of String(text).split('\n')) {
    if (!raw) {
      out.push('');
      continue;
    }
    let line = '';
    for (const word of raw.split(' ')) {
      const test = line ? line + ' ' + word : word;
      if (ctx.measureText(test).width <= maxW || !line) line = test;
      else {
        out.push(line);
        line = word;
      }
    }
    out.push(line);
  }
  return out;
}

export function drawBackground(ctx, background, w, h) {
  ctx.save();
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  const step = 32;
  if (background === 'ruled') {
    ctx.strokeStyle = '#c7d4e8';
    ctx.lineWidth = 1;
    for (let y = step * 2; y < h; y += step) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
  } else if (background === 'grid') {
    ctx.strokeStyle = '#d8dce3';
    ctx.lineWidth = 1;
    for (let x = 0; x <= w; x += step) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = 0; y <= h; y += step) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
  } else if (background === 'dots') {
    ctx.fillStyle = '#b9bec7';
    for (let x = step / 2; x < w; x += step) {
      for (let y = step / 2; y < h; y += step) {
        ctx.beginPath();
        ctx.arc(x, y, 1.1, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  ctx.restore();
}

export function strokeNear(s, x, y, r) {
  const pts = s.points;
  if (!pts || pts.length === 0) return false;
  let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
  for (const p of pts) {
    if (p[0] < minx) minx = p[0];
    if (p[0] > maxx) maxx = p[0];
    if (p[1] < miny) miny = p[1];
    if (p[1] > maxy) maxy = p[1];
  }
  if (x < minx - r || x > maxx + r || y < miny - r || y > maxy + r) return false;
  for (let i = 1; i < pts.length; i++) {
    if (distToSeg(x, y, pts[i - 1], pts[i]) <= r) return true;
  }
  if (pts.length === 1 && Math.hypot(pts[0][0] - x, pts[0][1] - y) <= r) return true;
  return false;
}

function distToSeg(px, py, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  if (l2 === 0) return Math.hypot(px - a[0], py - a[1]);
  let t = ((px - a[0]) * dx + (py - a[1]) * dy) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (a[0] + t * dx), py - (a[1] + t * dy));
}
