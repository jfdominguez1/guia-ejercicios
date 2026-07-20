#!/usr/bin/env python3
"""Genera candidatos de ícono para la PWA, para elegir mirándolos al tamaño real.

Cada candidato se dibuja con supersampling x6 y se baja con LANCZOS, porque el
ícono se juzga a 48-64 px en la home del teléfono, no a 512.

Uso: python3 scripts/generar-iconos-candidatos.py [carpeta_salida]
"""

import sys
from pathlib import Path

from PIL import Image, ImageDraw

RAIZ = Path(__file__).resolve().parent.parent
SALIDA = Path(sys.argv[1]) if len(sys.argv) > 1 else RAIZ / "scripts" / "out" / "iconos"

FONDO = (27, 26, 22)          # --papel oscuro
AMARILLO = (242, 185, 13)     # --accion (disco de 15 kg)
AMARILLO_OSC = (196, 148, 8)
AZUL = (36, 88, 197)          # --fuerza (disco de 20 kg)
TINTA = (27, 26, 22)
SS = 6


def lienzo(lado: int) -> tuple[Image.Image, ImageDraw.ImageDraw]:
    img = Image.new("RGBA", (lado, lado), (*FONDO, 255))
    return img, ImageDraw.Draw(img)


def circulo(d: ImageDraw.ImageDraw, cx: float, cy: float, r: float, color, ancho: int = 0) -> None:
    caja = [cx - r, cy - r, cx + r, cy + r]
    if ancho:
        d.ellipse(caja, outline=color, width=ancho)
    else:
        d.ellipse(caja, fill=color)


def barra_cargada(lado: int) -> Image.Image:
    """A — Barra con discos. Lo más universal: se lee 'gimnasio' al instante."""
    img, d = lienzo(lado)
    cx = cy = lado / 2
    u = lado / 100  # unidad relativa, así escala parejo

    # eje de la barra
    d.rounded_rectangle([cx - 40 * u, cy - 3.5 * u, cx + 40 * u, cy + 3.5 * u], radius=3.5 * u, fill=AMARILLO_OSC)
    # discos: el grande adentro, el chico afuera (como se carga de verdad)
    for signo in (-1, 1):
        x_grande = cx + signo * 22 * u
        d.rounded_rectangle(
            [x_grande - 6 * u, cy - 30 * u, x_grande + 6 * u, cy + 30 * u], radius=3 * u, fill=AMARILLO
        )
        x_chico = cx + signo * 33 * u
        d.rounded_rectangle(
            [x_chico - 5 * u, cy - 20 * u, x_chico + 5 * u, cy + 20 * u], radius=2.5 * u, fill=AZUL
        )
    return img


def disco_con_check(lado: int) -> Image.Image:
    """B — El disco actual, pero con el ✓ del registro: 'hecha' es la acción central."""
    img, d = lienzo(lado)
    cx = cy = lado / 2
    r = lado / 2 * 0.80
    u = lado / 100

    circulo(d, cx, cy, r, AMARILLO_OSC)
    circulo(d, cx, cy, r * 0.93, AMARILLO)
    circulo(d, cx, cy, r * 0.60, AMARILLO_OSC)
    circulo(d, cx, cy, r * 0.54, AMARILLO)

    # check grueso, centrado ópticamente (no geométricamente: el ✓ pesa a la derecha)
    d.line(
        [(cx - 21 * u, cy + 1 * u), (cx - 6 * u, cy + 16 * u), (cx + 22 * u, cy - 17 * u)],
        fill=TINTA,
        width=int(9 * u),
        joint="curve",
    )
    return img


def discos_semana(lado: int) -> Image.Image:
    """C — La métrica de la app: 3 discos, 2 llenos. Es lo que ves al abrirla."""
    img, d = lienzo(lado)
    u = lado / 100
    cy = lado / 2
    r = 15 * u
    for i, lleno in enumerate((True, True, False)):
        cx = lado / 2 + (i - 1) * 34 * u
        if lleno:
            circulo(d, cx, cy, r, AMARILLO)
        else:
            circulo(d, cx, cy, r, AMARILLO, ancho=int(5 * u))
    return img


CANDIDATOS = {
    "a-barra": barra_cargada,
    "b-disco-check": disco_con_check,
    "c-discos-semana": discos_semana,
}


def main() -> None:
    SALIDA.mkdir(parents=True, exist_ok=True)
    for nombre, dibujar in CANDIDATOS.items():
        grande = dibujar(512 * SS)
        for tam in (512, 192, 64):
            grande.resize((tam, tam), Image.LANCZOS).save(SALIDA / f"{nombre}-{tam}.png")
        print(f"✓ {nombre}")
    print(f"\nSalida: {SALIDA}")


if __name__ == "__main__":
    main()
