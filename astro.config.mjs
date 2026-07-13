// @ts-check
import { defineConfig } from 'astro/config';

// GitHub Pages sirve la app bajo /guia-ejercicios/ — toda URL interna
// (media, ejercicios.json, sw.js, manifest) debe usar import.meta.env.BASE_URL
export default defineConfig({
  site: 'https://jfdominguez1.github.io',
  base: '/guia-ejercicios',
});
