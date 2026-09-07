import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base is set for GitHub Pages project-site hosting (/reserve-desk/).
// Override with BASE_PATH=/ for local or root-domain deploys.
export default defineConfig({
  plugins: [react()],
  base: process.env.BASE_PATH ?? '/reserve-desk/',
  test: { globals: true, environment: 'node' },
})
