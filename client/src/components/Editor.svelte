<script>
  import Canvas from './Canvas.svelte';
  import Icon from './Icon.svelte';
  import { api } from '../lib/api.js';
  import { PEN_COLORS, HIGHLIGHTER_COLORS } from '../lib/engine/ink.js';
  import { exportNotebookPdf } from '../lib/export.js';

  let {
    notebook,
    pages = [],
    page = null,
    saveState = 'saved',
    onOpenPage,
    onContentChange,
    onPagesChanged,
    onPagePatch,
    onToggleSidebar,
    onOpenSettings,
    dark = false,
    register,
  } = $props();

  let canvasApi = $state(null);
  let tool = $state('pen');
  let color = $state('#1f2937');
  let size = $state(3);
  let zoomPct = $state(100);
  let exporting = $state(false);
  let bgOpen = $state(false);

  function registerCanvas(api_) {
    canvasApi = api_;
  }

  const I = {
    pen: ['M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z'],
    highlighter: ['m9 11-6 6v3h9l3-3', 'm22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4'],
    eraser: ['m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21', 'M22 21H7', 'm5 11 9 9'],
    text: ['M17 6H3', 'M21 12H3', 'M15.5 18H3'],
    hand: ['M18 11V6a2 2 0 0 0-4 0v5', 'M14 10V4a2 2 0 0 0-4 0v2', 'M10 10.5V6a2 2 0 0 0-4 0v8', 'M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15'],
    undo: ['M3 7v6h6', 'M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2L3 13'],
    redo: ['M21 7v6h-6', 'M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2l3 3'],
    plus: ['M5 12h14', 'M12 5v14'],
    trash: ['M3 6h18', 'M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6', 'M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2'],
    download: ['M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4', 'M7 10l5 5 5-5', 'M12 15V3'],
    chevronLeft: ['m15 18-6-6 6-6'],
    chevronRight: ['m9 18 6-6-6-6'],
    grid: ['M3 3h7v7H3z', 'M14 3h7v7h-7z', 'M14 14h7v7h-7z', 'M3 14h7v7H3z'],
    menu: ['M4 6h16', 'M4 12h16', 'M4 18h16'],
    gear: [
      'M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z',
      'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
    ],
  };

  const TOOLS = [
    { id: 'pen', icon: I.pen, label: 'Pen' },
    { id: 'highlighter', icon: I.highlighter, label: 'Highlighter' },
    { id: 'eraser', icon: I.eraser, label: 'Eraser' },
    { id: 'text', icon: I.text, label: 'Text' },
    { id: 'select', icon: I.hand, label: 'Pan' },
  ];

  const SIZES = [
    { v: 2, label: 'Thin' },
    { v: 3.5, label: 'Medium' },
    { v: 6, label: 'Thick' },
  ];

  const BGS = [
    { id: 'blank', label: 'Blank' },
    { id: 'ruled', label: 'Ruled' },
    { id: 'grid', label: 'Grid' },
    { id: 'dots', label: 'Dots' },
  ];

  const palette = $derived(tool === 'highlighter' ? HIGHLIGHTER_COLORS : PEN_COLORS);

  function setTool(t) {
    tool = t;
    bgOpen = false;
    if (t === 'highlighter' && !HIGHLIGHTER_COLORS.includes(color)) color = HIGHLIGHTER_COLORS[0];
    if (t !== 'highlighter' && !PEN_COLORS.includes(color)) color = PEN_COLORS[0];
  }

  function setZoomPct(z) {
    zoomPct = Math.round(z * 100);
  }

  function prevPage() {
    const i = pages.findIndex((p) => p.id === page.id);
    if (i > 0) switchPage(pages[i - 1].id);
  }

  function nextPage() {
    const i = pages.findIndex((p) => p.id === page.id);
    if (i < pages.length - 1) switchPage(pages[i + 1].id);
  }

  async function switchPage(id) {
    await flush();
    onOpenPage(id);
  }

  // Persist the current page (text edit + pending autosave) before leaving it.
  async function flush() {
    canvasApi?.commitEdit?.();
    await canvasApi?.flushSave?.();
  }

  // Expose flush to App so it can persist the page before switching notebooks.
  $effect(() => {
    register?.({ flush });
  });

  async function addPage() {
    const p = await api.createPage(notebook.id, { background: 'blank', afterId: page.id });
    await onPagesChanged();
    switchPage(p.id);
  }

  async function deletePage() {
    if (pages.length <= 1) {
      alert('A notebook needs at least one page.');
      return;
    }
    if (!confirm('Delete this page?')) return;
    const i = pages.findIndex((p) => p.id === page.id);
    await flush();
    await api.deletePage(page.id);
    await onPagesChanged();
    const next = pages[i - 1] ?? pages[i];
    if (next) switchPage(next.id);
  }

  async function movePage(dir) {
    await api.movePage(page.id, dir);
    await onPagesChanged();
    switchPage(page.id);
  }

  async function setBackground(bg) {
    bgOpen = false;
    if (page.background === 'pdf' || page.background === bg) return;
    await api.savePage(page.id, { background: bg });
    onPagePatch({ background: bg });
  }

  async function exportAll() {
    exporting = true;
    try {
      await exportNotebookPdf(notebook);
    } catch (e) {
      alert('Export failed: ' + e.message);
    } finally {
      exporting = false;
    }
  }
</script>

<div class="flex h-full min-h-0 flex-1">
  <!-- left tool rail -->
  <div class="flex shrink-0 flex-col items-center gap-1 border-r border-stone-200 bg-white px-1 py-2" style="width:3.4rem">
    {#each TOOLS as t (t.id)}
      <button
        class="rounded-lg p-2 {tool === t.id ? 'bg-[#eef2ff] text-[#4f7cff]' : 'text-stone-600 hover:bg-stone-100'}"
        title={t.label}
        onclick={() => setTool(t.id)}
      >
        <Icon d={t.icon} />
      </button>
    {/each}

    <div class="my-1 h-px w-8 bg-stone-200"></div>

    <div class="grid grid-cols-2 gap-1.5">
      {#each palette as c (c)}
        <button
          class="h-5 w-5 rounded-full border {c === color
            ? 'border-[#4f7cff] ring-2 ring-[#4f7cff]/40'
            : 'border-stone-300'}"
          style="background:{c}"
          title={c}
          onclick={() => (color = c)}
        ></button>
      {/each}
    </div>

    <div class="my-1 h-px w-8 bg-stone-200"></div>

    {#each SIZES as s (s.v)}
      <button
        class="flex h-8 w-8 items-center justify-center rounded-lg {size === s.v ? 'bg-[#eef2ff]' : 'hover:bg-stone-100'}"
        title={s.label}
        onclick={() => (size = s.v)}
      >
        <span class="rounded-full bg-stone-700" style="width:{s.v * 2.2}px;height:{s.v * 2.2}px"></span>
      </button>
    {/each}

    <div class="my-1 h-px w-8 bg-stone-200"></div>

    <button class="rounded-lg p-2 text-stone-600 hover:bg-stone-100" title="Undo (Ctrl+Z)" onclick={() => canvasApi?.undo()}>
      <Icon d={I.undo} />
    </button>
    <button class="rounded-lg p-2 text-stone-600 hover:bg-stone-100" title="Redo (Ctrl+Shift+Z)" onclick={() => canvasApi?.redo()}>
      <Icon d={I.redo} />
    </button>

    <div class="my-1 h-px w-8 bg-stone-200"></div>

    <button class="rounded-lg p-1.5 text-stone-600 hover:bg-stone-100" title="Zoom out" onclick={() => canvasApi?.zoomOut()}>−</button>
    <button class="min-w-10 rounded-lg px-1 py-0.5 text-center text-xs text-stone-600 hover:bg-stone-100" title="Fit to screen" onclick={() => canvasApi?.fitView()}>
      {zoomPct}%
    </button>
    <button class="rounded-lg p-1.5 text-stone-600 hover:bg-stone-100" title="Zoom in" onclick={() => canvasApi?.zoomIn()}>+</button>

    <div class="relative my-1 h-px w-8 bg-stone-200"></div>

    <div class="relative">
      <button
        class="rounded-lg p-2 {bgOpen ? 'bg-[#eef2ff] text-[#4f7cff]' : 'text-stone-600 hover:bg-stone-100'}"
        title="Page background"
        onclick={() => (bgOpen = !bgOpen)}
        disabled={page?.background === 'pdf'}
      >
        <Icon d={I.grid} />
      </button>
      {#if bgOpen}
        <div class="absolute left-full top-0 z-30 ml-1 w-28 rounded-lg border border-stone-200 bg-white p-1 shadow-lg">
          {#each BGS as bg (bg.id)}
            <button
              class="w-full rounded px-2 py-1 text-left text-sm hover:bg-stone-50 {page?.background === bg.id ? 'font-semibold text-[#4f7cff]' : 'text-stone-700'}"
              onclick={() => setBackground(bg.id)}
            >
              {bg.label}
            </button>
          {/each}
        </div>
      {/if}
    </div>
  </div>

  <!-- main column -->
  <div class="flex min-w-0 flex-1 flex-col">
    <div class="flex h-12 shrink-0 items-center gap-1 border-b border-stone-200 bg-white px-2 sm:px-3">
      <button class="rounded p-1.5 text-stone-500 hover:bg-stone-100 md:hidden" onclick={onToggleSidebar} aria-label="Menu">
        <Icon d={I.menu} />
      </button>
      <div class="flex min-w-0 items-center gap-2">
        <span class="h-2.5 w-2.5 shrink-0 rounded-full" style="background:{notebook.color}"></span>
        <h2 class="truncate text-sm font-semibold">{notebook.title}</h2>
      </div>
      <span class="ml-2 hidden text-xs text-stone-400 sm:inline">
        {saveState === 'saving' ? 'Saving…' : saveState === 'unsaved' ? 'Unsaved' : 'Saved'}
      </span>
      <div class="flex-1"></div>
      {#if page}
        <div class="flex items-center gap-1 rounded-lg bg-stone-100 px-1 py-0.5">
          <button class="rounded p-1 text-stone-600 hover:bg-white disabled:opacity-30" disabled={page.idx === 0} onclick={prevPage} title="Previous page">
            <Icon d={I.chevronLeft} size={16} />
          </button>
          <span class="min-w-14 text-center text-xs font-medium text-stone-600">{page.idx + 1} / {pages.length}</span>
          <button class="rounded p-1 text-stone-600 hover:bg-white disabled:opacity-30" disabled={page.idx >= pages.length - 1} onclick={nextPage} title="Next page">
            <Icon d={I.chevronRight} size={16} />
          </button>
        </div>
        <button class="rounded p-1.5 text-stone-600 hover:bg-stone-100" title="Move page earlier" disabled={page.idx === 0} onclick={() => movePage('prev')}>
          <Icon d={I.chevronLeft} size={16} />
        </button>
        <button class="rounded p-1.5 text-stone-600 hover:bg-stone-100" title="Move page later" disabled={page.idx >= pages.length - 1} onclick={() => movePage('next')}>
          <Icon d={I.chevronRight} size={16} />
        </button>
        <button class="rounded p-1.5 text-stone-600 hover:bg-stone-100" title="Add page" onclick={addPage}>
          <Icon d={I.plus} />
        </button>
        <button class="rounded p-1.5 text-stone-600 hover:bg-stone-100" title="Delete page" onclick={deletePage}>
          <Icon d={I.trash} />
        </button>
        <button
          class="flex items-center gap-1.5 rounded-lg bg-[#4f7cff] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#3d68e0] disabled:opacity-50"
          title="Export notebook as PDF"
          onclick={exportAll}
          disabled={exporting}
        >
          <Icon d={I.download} size={14} />
          {exporting ? 'Exporting…' : 'Export PDF'}
        </button>
      {/if}
      <button class="rounded p-1.5 text-stone-600 hover:bg-stone-100" title="Settings" aria-label="Settings" onclick={onOpenSettings}>
        <Icon d={I.gear} size={18} />
      </button>
    </div>

    <div class="min-h-0 flex-1">
      {#if page}
        <Canvas
          register={registerCanvas}
          page={page}
          tool={tool}
          color={color}
          size={size}
          {dark}
          onContentChange={onContentChange}
          onZoomChange={setZoomPct}
        />
      {:else}
        <div class="flex h-full items-center justify-center text-sm text-stone-400">No page selected</div>
      {/if}
    </div>
  </div>
</div>
