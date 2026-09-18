<script>
  import { onMount, tick } from 'svelte';
  import { drawStroke, drawTextItem, drawBackground, strokeNear, uid } from '../lib/engine/ink.js';
  import { renderPdfPage } from '../lib/pdf.js';

  let { page, tool = 'pen', color = '#1f2937', size = 3, onContentChange, onZoomChange } = $props();

  let containerEl = $state(null);
  let canvasEl = $state(null);
  let textEl = $state(null);
  let contentCanvas = null;
  let pdfCanvas = null;

  let strokes = $state([]);
  let texts = $state([]);
  let live = null;
  let editing = $state(null);
  let eraserPos = null;

  let view = $state({ scale: 1, tx: 0, ty: 0 });
  let dpr = 1;
  let ready = false;

  const RES = 2;
  const pointers = new Map();
  let gesture = null;
  let rafPending = false;
  const undoStack = [];
  const redoStack = [];

  $effect(() => {
    const p = page;
    if (!p) return;
    strokes = (p.content?.strokes ?? []).map((s) => ({ ...s, id: s.id ?? uid() }));
    texts = (p.content?.texts ?? []).map((t) => ({ ...t, id: t.id ?? uid() }));
    live = null;
    editing = null;
    eraserPos = null;
    pdfCanvas = null;
    undoStack.length = 0;
    redoStack.length = 0;
    ensureContentCanvas();
    renderContent();
    requestDraw();
    fitView();
    if (p.background === 'pdf' && p.pdfId != null) {
      renderPdfPage(p.pdfId, (p.pdfPage ?? 0) + 1, RES)
        .then((c) => {
          if (page?.id !== p.id) return;
          pdfCanvas = c;
          renderContent();
          requestDraw();
        })
        .catch((e) => console.error('pdf render failed', e));
    }
  });

  $effect(() => {
    const s = strokes;
    const t = texts;
    const bg = page?.background;
    if (!contentCanvas) return;
    renderContent();
    requestDraw();
  });

  function ensureContentCanvas() {
    const w = Math.max(1, Math.round(page.width * RES));
    const h = Math.max(1, Math.round(page.height * RES));
    if (!contentCanvas || contentCanvas.width !== w || contentCanvas.height !== h) {
      contentCanvas = document.createElement('canvas');
      contentCanvas.width = w;
      contentCanvas.height = h;
    }
  }

  function renderContent() {
    if (!contentCanvas || !page) return;
    const ctx = contentCanvas.getContext('2d');
    ctx.setTransform(RES, 0, 0, RES, 0, 0);
    ctx.clearRect(0, 0, page.width, page.height);
    if (page.background === 'pdf') {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, page.width, page.height);
      if (pdfCanvas) ctx.drawImage(pdfCanvas, 0, 0, page.width, page.height);
    } else {
      drawBackground(ctx, page.background, page.width, page.height);
    }
    for (const s of strokes) drawStroke(ctx, s);
    for (const t of texts) drawTextItem(ctx, t);
  }

  function requestDraw() {
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(() => {
      rafPending = false;
      draw();
    });
  }

  function draw() {
    if (!canvasEl || !page || !ready) return;
    const ctx = canvasEl.getContext('2d');
    const W = canvasEl.width;
    const H = canvasEl.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#e9e6df';
    ctx.fillRect(0, 0, W, H);
    const k = dpr * view.scale;
    ctx.setTransform(k, 0, 0, k, dpr * view.tx, dpr * view.ty);
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.28)';
    ctx.shadowBlur = 24 / view.scale;
    ctx.shadowOffsetY = 5 / view.scale;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, page.width, page.height);
    ctx.restore();
    if (contentCanvas) ctx.drawImage(contentCanvas, 0, 0, page.width, page.height);
    if (live) drawStroke(ctx, live);
    if (tool === 'eraser' && eraserPos) {
      ctx.save();
      ctx.strokeStyle = 'rgba(31,41,55,0.65)';
      ctx.lineWidth = 1.5 / view.scale;
      const r = 8 / view.scale + 4;
      ctx.beginPath();
      ctx.arc(eraserPos.x, eraserPos.y, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  function resize() {
    if (!containerEl || !canvasEl) return;
    dpr = window.devicePixelRatio || 1;
    const w = containerEl.clientWidth;
    const h = containerEl.clientHeight;
    if (w === 0 || h === 0) return;
    canvasEl.width = Math.round(w * dpr);
    canvasEl.height = Math.round(h * dpr);
    canvasEl.style.width = w + 'px';
    canvasEl.style.height = h + 'px';
    requestDraw();
  }

  function fitView() {
    if (!containerEl || !page) return;
    const pad = 36;
    const s = Math.min(
      (containerEl.clientWidth - pad * 2) / page.width,
      (containerEl.clientHeight - pad * 2) / page.height
    );
    const scale = Math.max(0.05, Math.min(s, 6));
    view = {
      scale,
      tx: (containerEl.clientWidth - page.width * scale) / 2,
      ty: (containerEl.clientHeight - page.height * scale) / 2,
    };
    notifyZoom();
    requestDraw();
  }

  function notifyZoom() {
    onZoomChange?.(view.scale);
  }

  function zoomIn() {
    if (!containerEl) return;
    zoomAt(1.25, containerEl.clientWidth / 2, containerEl.clientHeight / 2);
  }

  function zoomOut() {
    if (!containerEl) return;
    zoomAt(0.8, containerEl.clientWidth / 2, containerEl.clientHeight / 2);
  }

  function zoomAt(factor, cx, cy) {
    const s0 = view.scale;
    const s1 = Math.max(0.05, Math.min(8, s0 * factor));
    if (s1 === s0) return;
    const px = (cx - view.tx) / s0;
    const py = (cy - view.ty) / s0;
    view = { scale: s1, tx: cx - px * s1, ty: cy - py * s1 };
    notifyZoom();
    requestDraw();
  }

  function toPage(e) {
    const rect = canvasEl.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left - view.tx) / view.scale,
      y: (e.clientY - rect.top - view.ty) / view.scale,
    };
  }

  function onPointerDown(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (editing) commitEdit();
    canvasEl.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      if (live) {
        live = null;
        requestDraw();
      }
      const [a, b] = [...pointers.values()];
      gesture = {
        type: 'pinch',
        d0: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
        mid0: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
        view0: { ...view },
      };
      return;
    }
    const p = toPage(e);
    if (tool === 'select') {
      gesture = { type: 'pan', startX: e.clientX, startY: e.clientY, view0: { ...view } };
      canvasEl.classList.add('panning');
    } else if (tool === 'text') {
      startTextEdit(p.x, p.y);
    } else if (tool === 'eraser') {
      gesture = { type: 'erase' };
      eraserPos = p;
      eraseAt(p.x, p.y);
      requestDraw();
    } else {
      live = {
        id: uid(),
        tool,
        color,
        size: tool === 'highlighter' ? size * 5 : size,
        points: [[p.x, p.y, e.pressure || 0.5]],
      };
      requestDraw();
    }
  }

  function onPointerMove(e) {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (gesture?.type === 'pinch' && pointers.size >= 2) {
      const [a, b] = [...pointers.values()];
      const d1 = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
      const mid1 = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const v0 = gesture.view0;
      const s1 = Math.max(0.05, Math.min(8, v0.scale * (d1 / gesture.d0)));
      const px = (gesture.mid0.x - v0.tx) / v0.scale;
      const py = (gesture.mid0.y - v0.ty) / v0.scale;
      view = { scale: s1, tx: mid1.x - px * s1, ty: mid1.y - py * s1 };
      notifyZoom();
      requestDraw();
      return;
    }
    if (gesture?.type === 'pan') {
      view = {
        scale: view.scale,
        tx: gesture.view0.tx + (e.clientX - gesture.startX),
        ty: gesture.view0.ty + (e.clientY - gesture.startY),
      };
      requestDraw();
      return;
    }
    if (gesture?.type === 'erase') {
      const p = toPage(e);
      eraserPos = p;
      eraseAt(p.x, p.y);
      requestDraw();
      return;
    }
    if (live) {
      const events = e.getCoalescedEvents?.() || [e];
      for (const ev of events) {
        const p = toPage(ev);
        const last = live.points[live.points.length - 1];
        if (Math.hypot(p.x - last[0], p.y - last[1]) < 0.4) continue;
        live.points.push([p.x, p.y, ev.pressure || 0.5]);
      }
      requestDraw();
    }
  }

  function onPointerEnd(e) {
    pointers.delete(e.pointerId);
    if (gesture?.type === 'pinch' && pointers.size < 2) gesture = null;
    if (gesture?.type === 'pan') {
      gesture = null;
      canvasEl.classList.remove('panning');
    }
    if (gesture?.type === 'erase') {
      if (pointers.size === 0) {
        gesture = null;
        eraserPos = null;
        requestDraw();
      }
      return;
    }
    if (live) {
      if (live.points.length > 0) {
        pushUndo();
        strokes = [...strokes, live];
        scheduleSave();
      }
      live = null;
      requestDraw();
    }
  }

  function onWheel(e) {
    e.preventDefault();
    const rect = canvasEl.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    if (e.ctrlKey || e.metaKey) {
      zoomAt(Math.exp(-e.deltaY * 0.01), cx, cy);
    } else {
      view = { ...view, tx: view.tx - e.deltaX, ty: view.ty - e.deltaY };
      requestDraw();
    }
  }

  function eraseAt(x, y) {
    const r = 8 / view.scale + 4;
    const keep = [];
    const removed = [];
    for (const s of strokes) (strokeNear(s, x, y, r) ? removed : keep).push(s);
    if (!removed.length) return;
    pushUndo();
    strokes = keep;
    scheduleSave();
  }

  function startTextEdit(x, y) {
    const t = {
      id: uid(),
      x,
      y,
      w: 320,
      text: '',
      size: 18,
      color: color === '#ffffff' ? '#1f2937' : color,
    };
    pushUndo();
    texts = [...texts, t];
    editing = { ...t };
    requestDraw();
    tick().then(() => textEl?.focus());
  }

  function commitEdit() {
    if (!editing) return;
    const id = editing.id;
    const text = editing.text;
    if (!text.trim()) {
      texts = texts.filter((t) => t.id !== id);
    } else {
      texts = texts.map((t) => (t.id === id ? { ...t, text } : t));
    }
    editing = null;
    scheduleSave();
  }

  function pushUndo() {
    undoStack.push({ strokes, texts });
    if (undoStack.length > 60) undoStack.shift();
    redoStack.length = 0;
  }

  function undo() {
    if (!undoStack.length) return;
    redoStack.push({ strokes, texts });
    const s = undoStack.pop();
    strokes = s.strokes;
    texts = s.texts;
    scheduleSave();
  }

  function redo() {
    if (!redoStack.length) return;
    undoStack.push({ strokes, texts });
    const s = redoStack.pop();
    strokes = s.strokes;
    texts = s.texts;
    scheduleSave();
  }

  let saveTimer = null;
  let dirty = false;

  function scheduleSave() {
    dirty = true;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(flushSave, 700);
  }

  function flushSave() {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    if (!dirty || !page) return;
    dirty = false;
    onContentChange?.(page.id, { strokes, texts });
  }

  function onKeyDown(e) {
    if (editing) {
      if (e.key === 'Escape') commitEdit();
      return;
    }
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
    } else if (mod && e.key.toLowerCase() === 'y') {
      e.preventDefault();
      redo();
    }
  }

  onMount(() => {
    ready = true;
    resize();
    const ro = new ResizeObserver(() => resize());
    if (containerEl) ro.observe(containerEl);
    canvasEl.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('keydown', onKeyDown);
    return () => {
      ro.disconnect();
      canvasEl?.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', onKeyDown);
      if (saveTimer) clearTimeout(saveTimer);
    };
  });

  let editStyle = $derived(
    editing
      ? `left:${editing.x * view.scale + view.tx}px;top:${editing.y * view.scale + view.ty}px;width:${editing.w * view.scale}px;height:${Math.max(48, editing.size * 2.7 * view.scale)}px;font-size:${editing.size * view.scale}px;line-height:${editing.size * 1.35 * view.scale}px;color:${editing.color};`
      : ''
  );
</script>

<div class="relative h-full w-full overflow-hidden" bind:this={containerEl}>
  <canvas
    class="ink-canvas tool-{tool}"
    bind:this={canvasEl}
    onpointerdown={onPointerDown}
    onpointermove={onPointerMove}
    onpointerup={onPointerEnd}
    onpointercancel={onPointerEnd}
  ></canvas>
  {#if editing}
    <textarea
      class="text-edit-overlay"
      bind:this={textEl}
      style={editStyle}
      placeholder="Type here…"
      bind:value={editing.text}
      onblur={commitEdit}
      onkeydown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          commitEdit();
        }
        e.stopPropagation();
      }}
    ></textarea>
  {/if}
</div>
