#!/usr/bin/env python3
"""Genera los íconos de la PWA: los discos de la semana (2 hechas de 3).

Es la métrica propia de la app —el número grande de la home— convertida en
marca: discos llenos por las sesiones hechas, uno vacío por la que falta.

Se dibuja con supersampling x6 y se baja con LANCZOS, porque el ícono se juzga
a 48 px en la home del teléfono, no a 512.

Output: public/icons/{icon-192,icon-512,maskable-512,apple-touch-icon}.png

Uso: python3 scripts/generar-iconos.py
"""

from pathlib import Path

from PIL import Image, ImageDraw

RAIZ = Path(__file__).resolve().parent.parent
SALIDA = RAIZ / "public" / "icons"

FONDO = (27, 26, 22)        # --papel oscuro
AMARILLO = (242, 185, 13)   # --accion (disco de 15 kg)
SS = 6

# Radio del disco y separación entre centros, en unidades de 1/100 del lado.
# `normal` llega casi al borde (el ícono ya viene recortado por el launcher);
# `maskable` se achica para entrar en el círculo seguro del 80% que recorta
# Android — tres discos en fila es justo la forma que ese recorte se come.
PROPORCIONES = {
    "normal": {"radio": 13.0, "paso": 30.0},
    "maskable": {"radio": 10.5, "paso": 24.5},
}

HECHAS = 2
TOTAL = 3


def dibujar(lado: int, variante: str) -> Image.Image:
    p = PROPORCIONES[variante]
    img = Image.new("RGBA", (lado, lado), (*FONDO, 255))
    d = ImageDraw.Draw(img)
    u = lado / 100
    radio = p["radio"] * u
    paso = p["paso"] * u
    # Proporcional al radio, no fijo: si no, en la variante maskable (discos
    # más chicos) el aro se come el hueco y el disco vacío se lee como una
    # dona, no como "esta todavía no la hice".
    grosor = max(1, int(radio * 0.26))
    centro_y = lado / 2

    for i in range(TOTAL):
        cx = lado / 2 + (i - (TOTAL - 1) / 2) * paso
        caja = [cx - radio, centro_y - radio, cx + radio, centro_y + radio]
        if i < HECHAS:
            d.ellipse(caja, fill=AMARILLO)
        else:
            # El aro se dibuja hacia adentro para que el diámetro exterior
            # coincida con el de los llenos y la fila quede pareja.
            interior = [c + (grosor / 2 if j < 2 else -grosor / 2) for j, c in enumerate(caja)]
            d.ellipse(interior, outline=AMARILLO, width=grosor)
    return img


ARCHIVOS = [
    ("icon-512.png", 512, "normal"),
    ("icon-192.png", 192, "normal"),
    ("apple-touch-icon.png", 180, "normal"),
    ("maskable-512.png", 512, "maskable"),
]


def main() -> None:
    SALIDA.mkdir(parents=True, exist_ok=True)
    for nombre, tam, variante in ARCHIVOS:
        grande = dibujar(tam * SS, variante)
        grande.resize((tam, tam), Image.LANCZOS).save(SALIDA / nombre)
        print(f"✓ {nombre} ({tam}px, {variante})")
    print(f"\nSalida: {SALIDA}")


if __name__ == "__main__":
    main()
