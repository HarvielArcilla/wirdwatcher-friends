// Bundles the window UI (React) into renderer/dist. The background process
// runs unbundled from src/.
import { build } from 'esbuild'

await build({
  entryPoints: { app: 'src/renderer/main.jsx' },
  outdir: 'renderer/dist',
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: ['chrome130'],
  jsx: 'automatic',
  sourcemap: true,
  minify: process.env.NODE_ENV === 'production',
  define: { 'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development') },
  logLevel: 'warning'
})
