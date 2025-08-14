import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'
import cesium from 'vite-plugin-cesium';

export default defineConfig({
  base: '/Tower-Simulation-POC/',
  plugins: [tailwindcss(), cesium()],
})
