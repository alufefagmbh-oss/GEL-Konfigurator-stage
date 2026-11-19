import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
base: '/GEL-Konfiturator-stage/',
  plugins: [react(), tailwindcss()],
  assetsInclude: ['**/*.wasm'],
  worker: { format: 'es' },
  optimizeDeps: {
    exclude: ['opencascade.js'],
  },
  build: {
    modulePreload: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('/node_modules/three/')) return 'three-core'
          if (id.includes('/node_modules/@react-three/fiber/')) return 'three-fiber'
          if (id.includes('/node_modules/@react-three/drei/') || id.includes('/node_modules/three-stdlib/')) {
            return 'three-drei'
          }
        },
      },
    },
  },
})
