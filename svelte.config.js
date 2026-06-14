import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: [vitePreprocess({})],
  kit: {
    adapter: adapter({
      fallback: 'index.html'
    }),
    paths: {
      base: process.env.BASE_PATH !== undefined
        ? process.env.BASE_PATH
        : (process.env.GITHUB_ACTIONS === 'true' ? '/noteds' : '')
    },
    alias: {
      $lib: 'src/lib',
      $components: 'src/components'
    }
  }
};

export default config;
