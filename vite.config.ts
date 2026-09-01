import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

function githubBase() {
  if (!process.env.GITHUB_ACTIONS) return '/';
  const repo = (process.env.GITHUB_REPOSITORY ?? '').split('/')[1] ?? '';
  return repo.endsWith('.github.io') ? '/' : `/${repo}/`;
}

export default defineConfig({
  base: githubBase(),
  plugins: [react(), tailwindcss()],
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
