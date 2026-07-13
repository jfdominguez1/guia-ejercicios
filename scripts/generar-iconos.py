#!/usr/bin/env python3
"""Genera los íconos de la PWA: un disco olímpico de 15kg (amarillo).

Dibuja en alta resolución (supersampling ×4) y baja con LANCZOS.
Output: public/icons/{icon-192,icon-512,maskable-512,apple-touch-icon}.png

Uso: python3 scripts/generar-iconos.py
"""

from pathlib import Path

from PIL import Image, ImageDraw

RAIZ = Path(__file__).resolve().parent.parent
SALIDA = RAIZ / "public" / "icons"

FONDO = (27, 26, 22)        # --papel oscuro
AMARILLO = (242, 185, 13)   # --accion (disco de 15kg)
AMARILLO_OSCURO = (196, 148, 8)
TINTA = (27, 26, 22)


def dibujar_disco(tam: int, margen_pct: float) -> Image.Image:
    """Disco visto de frente: aro amarillo, ranuras de agarre y buje central."""
    ss = 4
    lado = tam * ss
    img = Image.new("RGBA", (lado, lado), (*FONDO, 255))
    d = ImageDraw.Draw(img)
    centro = lado / 2
    radio = lado / 2 * (1 - margen_pct)

    def circulo(r: float, color: tuple[int, ...]) -> None:
        d.ellipse([centro - r, centro - r, centro + r, centro + r], fill=color)

    # cuerpo del disco con borde biselado
    circulo(radio, (*AMARILLO_OSCURO, 255))
    circulo(radio * 0.94, (*AMARILLO, 255))
    # anillo de apoyo grabado
    circulo(radio * 0.62, (*AMARILLO_OSCURO, 255))
    circulo(radio * 0.56, (*AMARILLO, 255))
    # ranuras de agarre (2 pastillas horizontales, como los bumper)
    ancho_r = radio * 0.34
    alto_r = radio * 0.115
    for lado_x in (-1, 1):
        cx = centro + lado_x * radio * 0.78
        d.rounded_rectangle(
            [cx - ancho_r / 2, centro - alto_r, cx + ancho_r / 2, centro + alto_r],
            radius=alto_r,
            fill=(*AMARILLO_OSCURO, 255),
        )
    # buje central
    circulo(radio * 0.30, (*AMARILLO_OSCURO, 255))
    circulo(radio * 0.26, (*TINTA, 255))
    circulo(radio * 0.10, (90, 88, 80, 255))

    return img.resize((tam, tam), Image.LANCZOS)


def main() -> None:
    SALIDA.mkdir(parents=True, exist_ok=True)
    # normal: disco casi al borde
    dibujar_disco(192, 0.06).save(SALIDA / "icon-192.png")
    dibujar_disco(512, 0.06).save(SALIDA / "icon-512.png")
    # maskable: zona segura del 20% (el SO recorta círculo/squircle)
    dibujar_disco(512, 0.22).save(SALIDA / "maskable-512.png")
    # iOS pone sus propias esquinas redondeadas
    dibujar_disco(180, 0.10).save(SALIDA / "apple-touch-icon.png")
    for archivo in sorted(SALIDA.glob("*.png")):
        print(f"{archivo.relative_to(RAIZ)} ({archivo.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
