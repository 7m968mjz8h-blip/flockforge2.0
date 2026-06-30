import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // '/' works for Vercel/Netlify and for a custom domain.
  // If you deploy to GitHub Pages as a PROJECT site (e.g. username.github.io/flockforge),
  // change this to '/flockforge/' (your repo name, with slashes on both sides) before building.
  base: '/',
})
