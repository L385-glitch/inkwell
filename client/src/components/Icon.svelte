<script>
  let { d, size = 18 } = $props();
</script>

<svg
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="2"
  stroke-linecap="round"
  stroke-linejoin="round"
  class="shrink-0"
  aria-hidden="true"
>
  {#each d as path}
    <path d={path} />
  {/each}
</svg>
