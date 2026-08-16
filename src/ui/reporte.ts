// El botón "Reportar un problema" y su overlay. Vive en el layout, así que
// está en TODAS las pantallas — los bugs aparecen entrenando, no en Perfil.
//
// Es un overlay a propósito, no una página: no navega a ningún lado, así que
// no corta la sesión en curso — el wizard queda montado tal cual atrás y al
// cerrar estás exactamente donde estabas, con las series cargadas intactas.

import { armarReporte, contextoDeDraft, fechaHoraLocal, versionDeSw } from '../lib/reporte';
import { storage } from '../lib/storage';
import { TOPE_TEXTO } from '../lib/texto';
import { rutaBase } from './datos';

/** Sello del bundle, leído del sw.js sellado. Best-effort: sin red no hay versión. */
async function versionApp(): Promise<string | undefined> {
  try {
    const respuesta = await fetch(`${rutaBase}/sw.js`);
    if (!respuesta.ok) return undefined;
    return versionDeSw(await respuesta.text());
  } catch {
    return undefined;
  }
}

/** El draft del wizard, si hay una sesión sin guardar. Crudo: lo valida contextoDeDraft. */
function draftCrudo(): unknown {
  try {
    return JSON.parse(localStorage.getItem('ge:draft') ?? 'null');
  } catch {
    return null;
  }
}

function cerrar(overlay: HTMLElement): void {
  overlay.remove();
}

function abrirOverlay(): void {
  if (document.querySelector('#overlay-reporte')) return;
  const overlay = document.createElement('div');
  overlay.id = 'overlay-reporte';
  overlay.innerHTML = `
    <div class="carta caja-reporte" role="dialog" aria-modal="true" aria-labelledby="titulo-reporte">
      <span class="eyebrow" id="titulo-reporte">Reportar un problema de la app</span>
      <p class="ayuda">Contá qué anda mal (no es para notas de entrenamiento — para eso
      está la observación del ejercicio). Se guarda con fecha, pantalla y versión,
      y le llega al desarrollador en tu próximo respaldo o export.</p>
      <textarea id="texto-reporte" rows="4" maxlength="${TOPE_TEXTO}"
        placeholder="Ej: toco Guardar y no pasa nada · el dibujo de tal ejercicio se ve congelado"></textarea>
      <button type="button" class="boton-principal" id="btn-guardar-reporte" style="margin-top:10px">Guardar reporte</button>
      <button type="button" class="boton-secundario" id="btn-cancelar-reporte">Cancelar</button>
    </div>`;
  // Tocar el fondo oscuro también cierra (sin guardar): es el gesto natural.
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) cerrar(overlay);
  });
  overlay.querySelector('#btn-cancelar-reporte')!.addEventListener('click', () => cerrar(overlay));
  overlay.querySelector('#btn-guardar-reporte')!.addEventListener('click', async () => {
    const campo = overlay.querySelector('#texto-reporte') as HTMLTextAreaElement;
    const boton = overlay.querySelector('#btn-guardar-reporte') as HTMLButtonElement;
    boton.disabled = true;
    const reporte = armarReporte(campo.value, {
      fecha: fechaHoraLocal(new Date()),
      pantalla: location.pathname,
      version: await versionApp(),
      sesionActiva: contextoDeDraft(draftCrudo()),
    });
    if (!reporte) {
      boton.disabled = false;
      campo.focus();
      return;
    }
    storage.agregarReporte(reporte);
    overlay.querySelector('.caja-reporte')!.innerHTML = `
      <span class="eyebrow">✓ Reporte guardado</span>
      <p class="ayuda">Gracias — viaja en tu próximo respaldo y en el export para la IA.
      Seguí donde estabas: no se tocó nada de tu sesión.</p>
      <button type="button" class="boton-principal" id="btn-cerrar-reporte" style="margin-top:10px">Volver</button>`;
    overlay.querySelector('#btn-cerrar-reporte')!.addEventListener('click', () => cerrar(overlay));
  });
  document.body.appendChild(overlay);
  (overlay.querySelector('#texto-reporte') as HTMLTextAreaElement).focus();
}

/** Engancha el botón del layout. Se llama una vez por página, desde Base. */
export function montarReporte(): void {
  document.querySelector('#btn-reportar')?.addEventListener('click', abrirOverlay);
}
