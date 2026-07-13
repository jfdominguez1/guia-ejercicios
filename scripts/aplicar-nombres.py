#!/usr/bin/env python3
"""Aplica las traducciones de nombres al catálogo.

Lee scripts/out/nombres_es.json ({id: nombre_es}) y lo mergea en
src/data/ejercicios.json. Si a un ejercicio le falta traducción, usa
nombre_en como fallback (nombre_es nunca queda null).

Uso: python3 scripts/aplicar-nombres.py
"""

import json
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
CATALOGO = RAIZ / "src" / "data" / "ejercicios.json"
NOMBRES = RAIZ / "scripts" / "out" / "nombres_es.json"


def main() -> None:
    catalogo = json.loads(CATALOGO.read_text())
    nombres: dict[str, str] = json.loads(NOMBRES.read_text())

    sin_traduccion: list[str] = []
    actualizado = []
    for e in catalogo:
        nombre = nombres.get(e["id"], "").strip()
        if not nombre:
            # los extras ya vienen con nombre_es propio — no pisarlo
            nombre = e.get("nombre_es") or e["nombre_en"]
            if not e.get("nombre_es"):
                sin_traduccion.append(e["id"])
        actualizado.append({**e, "nombre_es": nombre})

    nulos = sum(1 for e in actualizado if not e["nombre_es"])
    if nulos:
        sys.exit(f"ERROR: {nulos} ejercicios quedaron sin nombre_es")

    CATALOGO.write_text(json.dumps(actualizado, ensure_ascii=False, indent=1))
    publica = RAIZ / "public" / "data" / "ejercicios.json"
    publica.parent.mkdir(parents=True, exist_ok=True)
    publica.write_text(json.dumps(actualizado, ensure_ascii=False, separators=(",", ":")))
    print(f"{len(actualizado)} nombres aplicados; fallback a nombre_en: "
          f"{len(sin_traduccion)} {sin_traduccion[:10] if sin_traduccion else ''}")


if __name__ == "__main__":
    main()
