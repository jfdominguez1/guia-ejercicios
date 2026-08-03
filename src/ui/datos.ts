// Capa de datos del cliente: catálogo cacheado, rutas con BASE_URL y guardas.

import { corregirTipos } from '../lib/registro';
import { storage } from '../lib/storage';
import type { Ejercicio, Perfil } from '../lib/tipos';

export const rutaBase = import.meta.env.BASE_URL.replace(/\/$/, '');

/**
 * Le pide al navegador que marque el almacenamiento como persistente, así el SO
 * no lo borra bajo presión de espacio (fue una de las causas del incidente de
 * pérdida de datos). El navegador decide; en una PWA instalada suele concederlo.
 * No bloquea nada: se dispara y se olvida. El respaldo sigue siendo la red real.
 */
export function pedirPersistencia(): void {
  try {
    navigator.storage?.persist?.().catch(() => {});
  } catch {
    // API ausente en navegadores viejos: seguimos igual.
  }
}

/**
 * Corrige de una vez el tipo de las sesiones viejas mal clasificadas (el wizard
 * las guardaba todas como 'fuerza'). Se corre al abrir Hoy: sin esto el
 * historial y el resumen para la IA siguen contando mal lo ya registrado.
 */
export function repararTiposDeSesion(catalogo: Ejercicio[]): void {
  const sesiones = storage.getSesiones();
  const corregidas = corregirTipos(sesiones, catalogo);
  if (corregidas !== sesiones) storage.setSesiones(corregidas);
}

let cache: Ejercicio[] | null = null;

export async function cargarCatalogo(): Promise<Ejercicio[]> {
  if (!cache) {
    const respuesta = await fetch(`${rutaBase}/data/ejercicios.json`);
    if (!respuesta.ok) throw new Error(`No pude cargar el catálogo (${respuesta.status})`);
    cache = (await respuesta.json()) as Ejercicio[];
  }
  return cache;
}

/** Catálogo + ejercicios CUSTOM importados por el usuario. */
export async function cargarCatalogoCompleto(): Promise<Ejercicio[]> {
  return [...(await cargarCatalogo()), ...storage.getCustoms()];
}

export const urlGif = (id: string) => `${rutaBase}/media/gif/${id}.gif`;
export const urlImg = (id: string) => `${rutaBase}/media/img/${id}.jpg`;

/** ¿Este ejercicio tiene archivo de demostración en /media? */
export function tieneDemo(e: Ejercicio): boolean {
  return !e.custom && e.media !== 'ninguna';
}

/**
 * Bloque de demostración de un ejercicio, o '' si no hay nada que mostrar.
 * Los que crea el usuario y las modalidades de cardio (`media: 'ninguna'`, no
 * existe un GIF de "andar en bici") no tienen archivo: pedirlo igual deja el
 * ícono de imagen rota, porque el `onerror` cae a un .jpg que tampoco está.
 * Una sola implementación para las tres pantallas que la mostraban.
 */
export function htmlDemo(e: Ejercicio, alt = ''): string {
  if (!tieneDemo(e)) return '';
  const texto = escapar(alt);
  if (e.media === 'img') return `<img class="gif" src="${urlImg(e.id)}" alt="${texto}" />`;
  return `<img class="gif" src="${urlGif(e.id)}" alt="${texto}" onerror="this.onerror=null;this.src='${urlImg(e.id)}'" />`;
}

/** URLs de media a precachear para "Descargar todas las demostraciones". */
export function urlsDeMedia(catalogo: Ejercicio[]): string[] {
  return catalogo.filter(tieneDemo).flatMap((e) =>
    e.media === 'img' ? [urlImg(e.id)] : [urlGif(e.id), urlImg(e.id)],
  );
}

/** Fecha local (no UTC — a las 22:00 de Argentina toISOString ya es mañana). */
export function hoyISO(): string {
  const d = new Date();
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mes}-${dia}`;
}

/** Sin perfil, toda página redirige al onboarding. */
export function exigirPerfil(): Perfil | null {
  const perfil = storage.getPerfil();
  if (!perfil) window.location.href = `${rutaBase}/perfil/`;
  return perfil;
}

/**
 * Arma una pantalla y, si algo falla, lo DICE.
 *
 * Sin esto un error deja puesto el "Cargando…" del HTML para siempre: el
 * síntoma no distingue "todavía está cargando" de "reventó", y en un teléfono
 * no hay consola donde mirar. Costó un día entero de la ficha de ejercicio
 * inutilizable (03/08) hasta encontrar que el problema era el service worker.
 */
export async function arrancarPantalla(
  selector: string,
  montar: () => void | Promise<void>,
): Promise<void> {
  try {
    await montar();
  } catch (error) {
    console.error(error);
    const caja = document.querySelector(selector);
    if (!caja) throw error;
    const detalle = error instanceof Error ? error.message : String(error);
    caja.innerHTML = `
      <div class="carta">
        <p class="error">No pude abrir esta pantalla.</p>
        <p class="ayuda">${escapar(detalle)}</p>
        <button type="button" id="btn-reintentar" style="margin-top:8px">Reintentar</button>
        <p class="ayuda" style="margin-top:8px">Tus datos están a salvo. Si sigue igual, entrá a Perfil y hacé un respaldo.</p>
      </div>`;
    caja.querySelector('#btn-reintentar')?.addEventListener('click', () => location.reload());
  }
}

export function escapar(texto: string): string {
  const div = document.createElement('div');
  div.textContent = texto;
  return div.innerHTML;
}

const DIAS_LARGOS = 86_400_000;
export function haceDias(fechaISO: string, hoy: string): string {
  const dias = Math.round((Date.parse(hoy) - Date.parse(fechaISO)) / DIAS_LARGOS);
  if (dias <= 0) return 'hoy';
  if (dias === 1) return 'ayer';
  return `hace ${dias} días`;
}
