<script>
  import { onMount, tick } from 'svelte';
  import { drawStroke, drawTextItem, backgroundCanvas, strokeNear, uid } from '../lib/engine/ink.js';
  import { renderPdfPage } from '../lib/pdf.js';

  let { page, tool = 'pen', color = '#1f2937', size = 3, dark = false, onContentChange, onZoomChange, register } = $props();

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
  let currentPageId = null;
  let lastFitKey = null;
  let spaceDown = false;
  let saveTimer = null;
  let dirty = false;

  $effect(() => {
    const p = page;
    if (!p) {
      if (editing) commitEdit();
      if (currentPageId != null) flushSave(currentPageId);
      strokes = [];
      texts = [];
      live = null;
      editing = null;
      eraserPos = null;
      pdfCanvas = null;
      currentPageId = null;
      return;
    }
    if (p.id === currentPageId) return;
    // Page is changing: commit any pending text edit and save the OLD page's
    // content to the OLD page id (strokes/texts still hold the old content
    // until we reset them below).
    if (editing) commitEdit();
    if (currentPageId != null) flushSave(currentPageId);
    currentPageId = p.id;
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
    // Keep zoom/pan when the new page has the same size; only re-fit when the
    // page size actually changes (e.g. A4 -> PDF page).
    const key = `${p.width}x${p.height}`;
    if (key !== lastFitKey) {
      lastFitKey = key;
      fitView();
    }
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

  // Redraw the surrounding background when the light/dark theme changes.
  $effect(() => {
    void dark;
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
      ctx.drawImage(
        backgroundCanvas(page.background, page.width, page.height, RES),
        0,
        0,
        page.width,
        page.height
      );
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
    const bg = getComputedStyle(document.documentElement).getPropertyValue('--canvas-bg').trim() || '#e9e6df';
    ctx.fillStyle = bg;
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
    if (live) drawStroke(ctx, live, true);
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
    clampView();
    requestDraw();
  }

  // Keep the page centered horizontally (no horizontal scrolling) and clamp the
  // vertical offset so the page can be scrolled up/down but never lost off-screen.
  function clampView() {
    if (!containerEl || !page) return;
    const vw = containerEl.clientWidth;
    const vh = containerEl.clientHeight;
    const scale = view.scale;
    const pageH = page.height * scale;
    const tx = (vw - page.width * scale) / 2;
    const ty = pageH <= vh ? (vh - pageH) / 2 : Math.min(0, Math.max(vh - pageH, view.ty));
    view = { scale, tx, ty };
  }

  function fitView() {
    if (!containerEl || !page) return;
    const pad = 36;
    const s = Math.min(
      (containerEl.clientWidth - pad * 2) / page.width,
      (containerEl.clientHeight - pad * 2) / page.height
    );
    const scale = Math.max(0.05, Math.min(s, 6));
    view = { scale, tx: 0, ty: 0 };
    clampView();
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
    // Anchor the point under the cursor vertically; horizontal is re-centered.
    const py = (cy - view.ty) / s0;
    view = { scale: s1, tx: view.tx, ty: cy - py * s1 };
    clampView();
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
    const isMouse = e.pointerType === 'mouse';
    if (isMouse && e.button !== 0 && e.button !== 1) return;
    if (isMouse && e.button === 1) e.preventDefault();
    if (editing) commitEdit();
    canvasEl.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      if (live) {
        live = null;
        requestDraw();
      }
      eraserPos = null;
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
    if ((isMouse && e.button === 1) || spaceDown || tool === 'select') {
      gesture = { type: 'pan', startX: e.clientX, startY: e.clientY, view0: { ...view } };
      canvasEl.classList.add('panning');
    } else if (tool === 'text') {
      // Cancel the pointerdown so the browser doesn't fire the compatibility
      // mousedown event — its default action would steal focus from the
      // freshly-focused text overlay and immediately blur (commit) it.
      e.preventDefault();
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
      const py = (gesture.mid0.y - v0.ty) / v0.scale;
      view = { scale: s1, tx: v0.tx, ty: mid1.y - py * s1 };
      clampView();
      notifyZoom();
      requestDraw();
      return;
    }
    if (gesture?.type === 'pan') {
      // Vertical pan only — the page stays centered horizontally.
      view = { scale: view.scale, tx: view.tx, ty: gesture.view0.ty + (e.clientY - gesture.startY) };
      clampView();
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
    if (gesture?.type === 'pinch' && pointers.size < 2) {
      gesture = null;
      eraserPos = null;
      requestDraw();
    }
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
        scheduleSave(page?.id);
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
      // Vertical scroll only — horizontal delta is ignored.
      view = { ...view, ty: view.ty - e.deltaY };
      clampView();
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
    scheduleSave(page?.id);
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
    scheduleSave(page?.id);
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
    scheduleSave(page?.id);
  }

  function redo() {
    if (!redoStack.length) return;
    undoStack.push({ strokes, texts });
    const s = redoStack.pop();
    strokes = s.strokes;
    texts = s.texts;
    scheduleSave(page?.id);
  }

  function cancelSave() {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
  }

  // Debounced autosave. The page id is captured at schedule time and re-checked
  // at fire time so a save can never land on the wrong page after a switch.
  function scheduleSave(pid) {
    if (pid == null) return;
    dirty = true;
    if (saveTimer) clearTimeout(saveTimer);
    const content = { strokes, texts };
    saveTimer = setTimeout(() => {
      saveTimer = null;
      dirty = false;
      if (currentPageId !== pid) return; // page switched; flushSave already saved
      onContentChange?.(pid, content);
    }, 700);
  }

  // Immediate save of the current content (awaited by the caller before any
  // page switch). Returns a promise so switches can be serialized.
  function flushSave(pid = page?.id) {
    cancelSave();
    if (pid == null || !dirty) return Promise.resolve();
    dirty = false;
    return Promise.resolve(onContentChange?.(pid, { strokes, texts }));
  }

  function onKeyDown(e) {
    if (editing) {
      if (e.key === 'Escape') commitEdit();
      return;
    }
    if (e.code === 'Space' && !e.repeat) {
      const t = e.target;
      if (t === document.body || t === canvasEl) {
        spaceDown = true;
        canvasEl.classList.add('space-pan');
        e.preventDefault();
      }
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

  function onKeyUp(e) {
    if (e.code === 'Space') {
      spaceDown = false;
      canvasEl?.classList.remove('space-pan');
    }
  }

  function onBlur() {
    spaceDown = false;
    canvasEl?.classList.remove('space-pan');
  }

  onMount(() => {
    ready = true;
    resize();
    const ro = new ResizeObserver(() => resize());
    if (containerEl) ro.observe(containerEl);
    canvasEl.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      ro.disconnect();
      canvasEl?.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      cancelSave();
      if (dirty && currentPageId != null) flushSave(currentPageId);
    };
  });

  // Expose the imperative API to the parent (Svelte 5 components have no
  // instance object, so bind:this can't be used for this).
  $effect(() => {
    register?.({ undo, redo, zoomIn, zoomOut, fitView, flushSave, commitEdit });
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
