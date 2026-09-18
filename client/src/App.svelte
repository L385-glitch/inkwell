<script>
  import { onMount } from 'svelte';
  import Sidebar from './components/Sidebar.svelte';
  import Editor from './components/Editor.svelte';
  import NotebookModal from './components/NotebookModal.svelte';
  import { api } from './lib/api.js';
  import { getPageCount, getPageSize } from './lib/pdf.js';

  let folders = $state([]);
  let notebooks = $state([]);
  let tags = $state([]);
  let selectedNotebookId = $state(null);
  let pages = $state([]);
  let page = $state(null);
  let activeTag = $state(null);
  let saveState = $state('saved');
  let modalNotebook = $state(null);
  let sidebarOpen = $state(false);
  let importing = $state(false);
  let fileInput;

  const notebook = $derived(notebooks.find((n) => n.id === selectedNotebookId) ?? null);

  async function refresh() {
    const [f, n, t] = await Promise.all([api.listFolders(), api.listNotebooks(), api.listTags()]);
    folders = f;
    notebooks = n;
    tags = t;
  }

  async function selectNotebook(id) {
    if (id === selectedNotebookId) return;
    selectedNotebookId = id;
    sidebarOpen = false;
    page = null;
    pages = await api.listPages(id);
    const first = pages[0];
    if (first) await openPage(first.id);
  }

  async function openPage(id) {
    const p = await api.getPage(id);
    page = p;
    saveState = 'saved';
  }

  async function handleContentChange(pageId, content) {
    saveState = 'saving';
    try {
      await api.savePage(pageId, { content });
      saveState = 'saved';
    } catch {
      saveState = 'unsaved';
    }
  }

  async function refreshPages() {
    if (!selectedNotebookId) return;
    pages = await api.listPages(selectedNotebookId);
  }

  function patchPage(patch) {
    if (!page) return;
    page = { ...page, ...patch };
  }

  async function newNotebook(folderId) {
    const title = prompt('Notebook name:', 'New notebook');
    if (title === null) return;
    const nb = await api.createNotebook(title.trim() || 'New notebook', folderId);
    await refresh();
    await selectNotebook(nb.id);
  }

  async function newFolder(parentId) {
    const name = prompt('Folder name:', 'New folder');
    if (name === null) return;
    await api.createFolder(name.trim() || 'New folder', parentId);
    await refresh();
  }

  function toggleTag(name) {
    activeTag = activeTag === name ? null : name;
  }

  function selectSearchResult(r) {
    if (!r.notebookId) return;
    if (r.notebookId === selectedNotebookId) {
      if (r.pageId) openPage(r.pageId);
      return;
    }
    selectNotebook(r.notebookId).then(() => {
      if (r.pageId) openPage(r.pageId);
    });
  }

  function importPdf() {
    fileInput?.click();
  }

  async function onPdfFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    importing = true;
    try {
      const { id: pdfId, name } = await api.uploadPdf(file);
      const count = await getPageCount(pdfId);
      const nb = await api.createNotebook(name.replace(/\.pdf$/i, ''), null);
      const initial = await api.listPages(nb.id);
      if (initial.length) await api.deletePage(initial[0].id);
      for (let i = 0; i < count; i++) {
        const { w, h } = await getPageSize(pdfId, i + 1);
        await api.createPage(nb.id, { background: 'pdf', pdfId, pdfPage: i, width: w, height: h });
      }
      await refresh();
      await selectNotebook(nb.id);
    } catch (err) {
      alert('PDF import failed: ' + err.message);
    } finally {
      importing = false;
    }
  }

  function onModalSaved(nb) {
    notebooks = notebooks.map((n) => (n.id === nb.id ? nb : n));
  }

  function onModalDeleted(id) {
    notebooks = notebooks.filter((n) => n.id !== id);
    if (selectedNotebookId === id) {
      selectedNotebookId = null;
      pages = [];
      page = null;
    }
  }

  onMount(refresh);
</script>

<div class="flex h-full overflow-hidden">
  {#if sidebarOpen}
    <div
      class="fixed inset-0 z-20 bg-black/30 md:hidden"
      role="button"
      aria-label="Close sidebar"
      onclick={() => (sidebarOpen = false)}
      onkeydown={(e) => e.key === 'Escape' && (sidebarOpen = false)}
    ></div>
  {/if}
  <div class="z-30 h-full {sidebarOpen ? 'fixed inset-y-0 left-0 shadow-xl' : 'hidden md:block'}">
    <Sidebar
      {folders}
      notebooks={activeTag ? notebooks.filter((n) => n.tags.includes(activeTag)) : notebooks}
      {tags}
      selectedNotebookId={selectedNotebookId}
      {activeTag}
      onSelectNotebook={(id) => selectNotebook(id)}
      onNewNotebook={newNotebook}
      onNewFolder={newFolder}
      onOpenNotebookModal={(nb) => (modalNotebook = nb)}
      onToggleTag={toggleTag}
      onSelectSearchResult={selectSearchResult}
      onClose={() => (sidebarOpen = false)}
    />
  </div>

  <div class="flex min-w-0 flex-1 flex-col">
    {#if notebook && pages.length}
      <Editor
        {notebook}
        {pages}
        {page}
        {saveState}
        onOpenPage={(id) => openPage(id)}
        onContentChange={handleContentChange}
        onPagesChanged={refreshPages}
        onPagePatch={patchPage}
        onToggleSidebar={() => (sidebarOpen = true)}
      />
    {:else}
      <div class="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
        <div class="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#4f7cff] text-2xl font-bold text-white">I</div>
        <div>
          <h2 class="text-xl font-semibold">Inkwell</h2>
          <p class="mx-auto mt-1 max-w-sm text-sm text-stone-500">
            Your self-hosted handwriting notes. Write on paper or PDFs, organize with folders and tags, and export to PDF.
          </p>
        </div>
        <div class="flex flex-wrap justify-center gap-3">
          <button class="rounded-lg bg-[#4f7cff] px-4 py-2 text-sm font-medium text-white hover:bg-[#3d68e0]" onclick={() => newNotebook(null)}>
            + New notebook
          </button>
          <button
            class="rounded-lg border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-50"
            onclick={importPdf}
            disabled={importing}
          >
            {importing ? 'Importing…' : 'Import PDF'}
          </button>
        </div>
      </div>
    {/if}
  </div>

  <input type="file" accept="application/pdf" class="hidden" bind:this={fileInput} onchange={onPdfFile} />

  {#if modalNotebook}
    <NotebookModal
      notebook={modalNotebook}
      {folders}
      onClose={() => (modalNotebook = null)}
      onSaved={onModalSaved}
      onDeleted={onModalDeleted}
    />
  {/if}
</div>
