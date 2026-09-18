<script>
  import { api } from '../lib/api.js';

  let {
    folders = [],
    notebooks = [],
    tags = [],
    selectedNotebookId = null,
    activeTag = null,
    onSelectNotebook,
    onNewNotebook,
    onNewFolder,
    onOpenNotebookModal,
    onToggleTag,
    onSelectSearchResult,
    onClose,
  } = $props();

  let query = $state('');
  let results = $state(null);
  let searchTimer = null;

  $effect(() => {
    const q = query.trim();
    if (searchTimer) clearTimeout(searchTimer);
    if (!q) {
      results = null;
      return;
    }
    searchTimer = setTimeout(async () => {
      try {
        results = await api.search(q);
      } catch {
        results = [];
      }
    }, 300);
  });

  const grouped = $derived.by(() => {
    const byId = new Map(folders.map((f) => [f.id, f]));
    const groups = new Map();
    for (const nb of notebooks) {
      const name = nb.folderId != null && byId.has(nb.folderId) ? byId.get(nb.folderId).name : 'No folder';
      if (!groups.has(name)) groups.set(name, []);
      groups.get(name).push(nb);
    }
    return [...groups.entries()];
  });

  function fmtDate(s) {
    if (!s) return '';
    const d = new Date(s);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) {
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }
</script>

<aside class="flex h-full w-72 shrink-0 flex-col border-r border-stone-200 bg-white">
  <div class="flex items-center gap-2 px-4 pt-4 pb-2">
    <div class="flex h-8 w-8 items-center justify-center rounded-lg bg-[#4f7cff] text-sm font-bold text-white">I</div>
    <h1 class="text-lg font-semibold tracking-tight">Inkwell</h1>
    <button class="ml-auto rounded p-1 text-stone-500 hover:bg-stone-100 md:hidden" onclick={onClose} aria-label="Close sidebar">✕</button>
  </div>

  <div class="px-3 pb-2">
    <input
      type="search"
      class="w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-1.5 text-sm outline-none focus:border-[#4f7cff]"
      placeholder="Search notes…"
      bind:value={query}
    />
  </div>

  <div class="flex gap-2 px-3 pb-3">
    <button class="flex-1 rounded-lg bg-[#4f7cff] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#3d68e0]" onclick={() => onNewNotebook(null)}>
      + Notebook
    </button>
    <button class="rounded-lg border border-stone-200 px-3 py-1.5 text-sm text-stone-600 hover:bg-stone-50" onclick={() => onNewFolder(null)}>
      + Folder
    </button>
  </div>

  {#if tags.length}
    <div class="flex flex-wrap gap-1.5 px-3 pb-3">
      {#each tags as tag (tag.id)}
        <button
          class="rounded-full border px-2.5 py-0.5 text-xs {activeTag === tag.name
            ? 'border-[#4f7cff] bg-[#4f7cff] text-white'
            : 'border-stone-200 text-stone-600 hover:bg-stone-50'}"
          onclick={() => onToggleTag(tag.name)}
        >
          #{tag.name}
        </button>
      {/each}
    </div>
  {/if}

  <div class="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
    {#if results !== null}
      <p class="px-2 pb-1 pt-2 text-xs font-medium uppercase tracking-wide text-stone-400">Results</p>
      {#if results.length === 0}
        <p class="px-2 text-sm text-stone-400">Nothing found.</p>
      {:else}
        {#each results as r (JSON.stringify(r))}
          <button class="w-full rounded-lg px-2 py-1.5 text-left text-sm hover:bg-stone-50" onclick={() => onSelectSearchResult(r)}>
            <span class="font-medium text-stone-700">{r.kind === 'title' ? 'Notebook' : 'Page'} </span>
            <span class="text-stone-500">{r.snippet}</span>
          </button>
        {/each}
      {/if}
    {:else}
      {#if notebooks.length === 0}
        <p class="px-2 pt-4 text-sm text-stone-400">No notebooks yet. Create one to get started.</p>
      {/if}
      {#each grouped as [folderName, items] (folderName)}
        <div class="flex items-center justify-between px-2 pb-1 pt-3">
          <p class="text-xs font-medium uppercase tracking-wide text-stone-400">{folderName}</p>
          <button
            class="text-xs text-stone-400 hover:text-stone-600"
            title="New notebook in this folder"
            onclick={() => onNewNotebook(folders.find((f) => f.name === folderName)?.id ?? null)}
          >
            +
          </button>
        </div>
        {#each items as nb (nb.id)}
          <div
            class="group flex items-center gap-2 rounded-lg px-2 py-1.5 {nb.id === selectedNotebookId
              ? 'bg-[#eef2ff]'
              : 'hover:bg-stone-50'}"
          >
            <button class="flex min-w-0 flex-1 items-center gap-2 text-left" onclick={() => onSelectNotebook(nb.id)}>
              <span class="h-2.5 w-2.5 shrink-0 rounded-full" style="background:{nb.color}"></span>
              <span class="min-w-0 flex-1">
                <span class="block truncate text-sm font-medium text-stone-800">{nb.title}</span>
                <span class="block truncate text-xs text-stone-400">
                  {nb.pageCount} page{nb.pageCount === 1 ? '' : 's'} · {fmtDate(nb.updatedAt)}
                </span>
              </span>
            </button>
            <button
              class="rounded p-1 text-stone-400 opacity-70 hover:bg-stone-200 md:opacity-0 md:group-hover:opacity-100"
              title="Notebook settings"
              onclick={() => onOpenNotebookModal(nb)}
            >
              ⋯
            </button>
          </div>
        {/each}
      {/each}
    {/if}
  </div>
</aside>
