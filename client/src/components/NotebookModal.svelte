<script>
  import { onMount } from 'svelte';
  import { api } from '../lib/api.js';

  let { notebook, folders = [], onClose, onSaved, onDeleted } = $props();

  let title = $state(notebook.title);
  let folderId = $state(notebook.folderId ?? '');
  let tagsText = $state(notebook.tags.join(', '));
  let busy = $state(false);

  onMount(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  async function save() {
    busy = true;
    try {
      const tags = tagsText
        .split(',')
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean);
      const nb = await api.updateNotebook(notebook.id, {
        title: title.trim() || notebook.title,
        folderId: folderId === '' ? null : Number(folderId),
        tags,
      });
      onSaved(nb);
      onClose();
    } finally {
      busy = false;
    }
  }

  async function del() {
    if (!confirm(`Delete "${notebook.title}" and all its pages?`)) return;
    busy = true;
    try {
      await api.deleteNotebook(notebook.id);
      onDeleted(notebook.id);
      onClose();
    } finally {
      busy = false;
    }
  }
</script>

<div
  class="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4"
  role="button"
  aria-label="Close dialog"
  onclick={onClose}
  onkeydown={(e) => e.key === 'Escape' && onClose()}
>
  <div class="w-full max-w-md rounded-xl bg-white p-5 shadow-xl" onclick={(e) => e.stopPropagation()}>
    <h2 class="mb-4 text-base font-semibold">Notebook settings</h2>

    <label for="nb-title" class="mb-1 block text-xs font-medium text-stone-500">Title</label>
    <input
      id="nb-title"
      class="mb-3 w-full rounded-lg border border-stone-200 px-3 py-1.5 text-sm outline-none focus:border-[#4f7cff]"
      bind:value={title}
    />

    <label for="nb-folder" class="mb-1 block text-xs font-medium text-stone-500">Folder</label>
    <select
      id="nb-folder"
      class="mb-3 w-full rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-sm outline-none focus:border-[#4f7cff]"
      bind:value={folderId}
    >
      <option value="">No folder</option>
      {#each folders as f (f.id)}
        <option value={f.id}>{f.name}</option>
      {/each}
    </select>

    <label for="nb-tags" class="mb-1 block text-xs font-medium text-stone-500">Tags (comma separated)</label>
    <input
      id="nb-tags"
      class="mb-4 w-full rounded-lg border border-stone-200 px-3 py-1.5 text-sm outline-none focus:border-[#4f7cff]"
      bind:value={tagsText}
      placeholder="study, work"
    />

    <div class="flex items-center gap-2">
      <button
        class="rounded-lg bg-[#4f7cff] px-4 py-1.5 text-sm font-medium text-white hover:bg-[#3d68e0] disabled:opacity-50"
        disabled={busy}
        onclick={save}
      >
        Save
      </button>
      <button
        class="rounded-lg border border-red-200 px-4 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
        disabled={busy}
        onclick={del}
      >
        Delete
      </button>
      <button class="ml-auto rounded-lg px-3 py-1.5 text-sm text-stone-500 hover:bg-stone-100" onclick={onClose}>
        Close
      </button>
    </div>
  </div>
</div>
