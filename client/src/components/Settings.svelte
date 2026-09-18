<script>
  let { dark, onDarkChange, onClose } = $props();

  function onKey(e) {
    if (e.key === 'Escape') onClose();
  }
</script>

<svelte:window onkeydown={onKey} />

<div
  class="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4"
  role="dialog"
  aria-modal="true"
  aria-label="Settings"
  onclick={onClose}
>
  <div
    class="w-full max-w-md rounded-xl bg-white p-5 shadow-xl"
    onclick={(e) => e.stopPropagation()}
  >
    <div class="mb-4 flex items-center justify-between">
      <h2 class="text-base font-semibold">Settings</h2>
      <button class="rounded p-1 text-stone-500 hover:bg-stone-100" aria-label="Close settings" onclick={onClose}>
        ✕
      </button>
    </div>

    <section>
      <h3 class="mb-2 text-xs font-medium uppercase tracking-wide text-stone-400">Appearance</h3>
      <div class="flex items-center justify-between rounded-lg border border-stone-200 px-3 py-2.5">
        <div>
          <p class="text-sm font-medium text-stone-700">Dark mode</p>
          <p class="text-xs text-stone-500">Switch the interface to a darker palette.</p>
        </div>
        <button
          role="switch"
          aria-checked={dark}
          aria-label="Toggle dark mode"
          class="relative h-6 w-11 shrink-0 rounded-full transition-colors {dark ? 'bg-[#4f7cff]' : 'bg-stone-300'}"
          onclick={() => onDarkChange(!dark)}
        >
          <span
            class="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all {dark ? 'left-[1.375rem]' : 'left-0.5'}"
          ></span>
        </button>
      </div>
    </section>
  </div>
</div>
