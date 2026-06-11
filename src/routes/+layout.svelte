<script lang="ts">
  import '../app.css';
  let { children } = $props();
</script>

<div class="min-h-screen bg-slate-50 text-slate-900">
  <main class="mx-auto max-w-5xl px-4 py-4 sm:px-6 lg:px-8">
    {@render children()}
  </main>
</div>
