<script>
  import { onMount } from 'svelte';
  import { renderPdfPage } from '../lib/pdf.js';

  let { pdfId, pdfPage = 0, width = 120 } = $props();
  let canvasEl = $state(null);
  let failed = $state(false);

  onMount(async () => {
    try {
      const src = await renderPdfPage(pdfId, pdfPage + 1, 1);
      if (!canvasEl) return;
      const scale = width / src.width;
      canvasEl.width = width;
      canvasEl.height = Math.max(1, Math.round(src.height * scale));
      const ctx = canvasEl.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvasEl.width, canvasEl.height);
      ctx.drawImage(src, 0, 0, canvasEl.width, canvasEl.height);
    } catch (e) {
      console.error('thumb render failed', e);
      failed = true;
    }
  });
</script>

{#if failed}
  <div class="flex aspect-[3/4] w-full items-center justify-center rounded bg-stone-100 text-xs text-stone-400">PDF</div>
{:else}
  <canvas bind:this={canvasEl} class="aspect-[3/4] w-full rounded border border-stone-200 bg-white object-contain"></canvas>
{/if}
