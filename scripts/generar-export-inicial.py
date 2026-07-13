#!/usr/bin/env python3
"""Genera el export inicial ("primera vez") para la IA del usuario.

Es la versión bootstrap del ciclo IA del design doc: como todavía no hay
app ni historial, incluye banco completo + schema + la pregunta pidiendo
la RUTINA INICIAL. El usuario completa su perfil en los corchetes, pega
todo en su IA y la respuesta se importará en la app cuando esté la UI.

Uso: python3 scripts/generar-export-inicial.py
Output: scripts/out/export-inicial-ia.md
"""

import json
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
CATALOGO = RAIZ / "src" / "data" / "ejercicios.json"
SALIDA = RAIZ / "scripts" / "out" / "export-inicial-ia.md"

PLANTILLA = """\
# Pedido: armame mi rutina de entrenamiento

## Quién soy

- Edad: [COMPLETÁ: edad]
- Días que puedo entrenar por semana: [COMPLETÁ: 1 a 6]
- Nivel: [COMPLETÁ: "empiezo" (vuelvo a arrancar / poca experiencia) o "entrenado"]
- Objetivo: [COMPLETÁ: "fuerza", "musculo" o "tono"]
- Equipamiento disponible: [COMPLETÁ: lista entre "banda", "pesas", "maquina", "cuerpo", "pelota", "rodillo"]
- FC máxima conocida: [OPCIONAL: en ppm, si la tenés medida con banda/reloj; si no la sabés, borrá esta línea y usá 220−edad]
- FC en reposo: [OPCIONAL: en ppm]
- Notas de salud/lesiones: [OPCIONAL]

Para los días de cardio, definí "fcObjetivo" con zonas como % de mi FC máxima:
Recuperación <61% · Zona 2 61-73% · Tempo 73-81% · Fuerte 81-90%. No prescribas
nada por encima del 90%.

## Qué te pido

Armame **la rutina semanal inicial** con estos datos:

1. **Fuerza**: repartí los días según mi frecuencia (1-2 días full body · 3 días
   full body con énfasis rotado · 4 días superior/inferior · 5-6 push-pull-legs).
   4-6 ejercicios por día, compuestos primero, solo con mi equipamiento.
   Series y reps según mi objetivo (fuerza 4×5-6 · músculo 3-4×8-12 · tono 3×12-15),
   ajustadas a mi edad (40-55: reps mínimas 8, sin cargas axiales máximas ·
   55+: preferí máquina/banda, 12-15 reps, un ejercicio menos por día).
2. **Cardio**: si mi frecuencia semanal lo permite, 1-2 días de cardio
   (caminata en zona 2 y/o intervalos en cinta) usando ejercicios con
   "t": "cardio" del banco, con "unidad": "min" y "fcObjetivo" según mis
   zonas. Es prioritario para mí (salud metabólica) — no lo omitas.
3. **Elongación**: una sesión corta (8-10 min) para las mañanas o los días que
   no hago fuerza, usando los ejercicios con "t": "elongacion" del banco.
   En elongación, repsMin/repsMax son SEGUNDOS de mantenimiento (series 1-2).
4. Explicá brevemente el porqué de la estructura ANTES del JSON.

## Banco de ejercicios disponible (elegí de acá por "id")

Formato compacto: id · n (nombre) · m (movimiento) · mu (músculo) · g (equipamiento) · t (fuerza/elongacion/cardio).
Si te falta algún ejercicio importante que no está en el banco, podés crearlo
(ver "ejercicios nuevos" abajo).

```json
{banco}
```

## Rutina actual

Todavía no tengo — esta es la primera.

## Historial

Todavía no hay sesiones registradas.

## Formato de respuesta REQUERIDO

Devolvé UN SOLO bloque ```json al final con esta estructura exacta:

```
{{
  "perfil": {{
    "edad": <mi edad>,
    "dias": <mis días por semana, 1-6>,
    "nivel": "<empiezo|entrenado>",
    "objetivo": "<fuerza|musculo|tono>",
    "equipamiento": ["<mis grupos: banda|pesas|maquina|cuerpo|pelota|rodillo>"],
    "fcMaxConocida": <ppm, solo si te la di>,
    "fcReposo": <ppm, solo si te la di>
  }},
  "rutina": {{
    "generadaEl": "<fecha ISO YYYY-MM-DD>",
    "seed": 1,
    "origen": "ia",
    "dias": [
      {{
        "nombre": "<ej: Día 1 — Empuje>",
        "enfoque": "<ej: pecho, hombros y tríceps>",
        "ejercicios": [
          {{
            "movimiento": "<campo m del banco>",
            "ejercicioId": "<campo id del banco, o CUSTOM-...>",
            "series": <1-6>,
            "repsMin": <número>,
            "repsMax": <número>,
            "unidad": "<reps|seg|min — opcional, default reps>",
            "fcObjetivo": {{ "min": <ppm>, "max": <ppm> }},
            "descansoSeg": <segundos de descanso entre series>
          }}
        ]
      }}
    ]
  }},
  "nuevos_ejercicios": [
    {{
      "id": "CUSTOM-<slug-corto>",
      "nombre_es": "<nombre en español>",
      "musculo": "<músculo principal>",
      "grupo": "<banda|pesas|maquina|cuerpo|pelota|rodillo>",
      "tipo": "<fuerza|elongacion|cardio>",
      "pasos": ["<paso 1>", "<paso 2>"]
    }}
  ],
  "grupos": [
    {{
      "nombre": "<ej: Movilidad de cadera>",
      "descripcion": "<cuándo usarlo>",
      "ejercicios": [ <mismo formato que los de la rutina> ]
    }}
  ]
}}
```

"grupos" es opcional: bloques sueltos REUTILIZABLES que quedan guardados
aparte de la rutina (calentamientos, movilidad, mini-sesiones de viaje).
También puedo pedirte después SOLO grupos, sin rutina.

Reglas del formato:
- Incluí SIEMPRE el bloque "perfil" con mis datos de arriba pasados a ese
  schema (así la app importa perfil + rutina en un solo paso). Omití
  fcMaxConocida/fcReposo si no te los di.
- Cada "ejercicioId" tiene que existir en el banco (campo id) o estar definido
  en "nuevos_ejercicios" con prefijo CUSTOM-.
- Días de fuerza: 4-6 ejercicios. Sesión de elongación: incluila como un día
  más con "nombre": "Elongación (mañanas / días libres)".
- "unidad" define qué son repsMin/repsMax: en ejercicios cardio usá
  unidad "min" y opcionalmente "fcObjetivo" (zona de frecuencia cardíaca
  objetivo en ppm); en elongación usá unidad "seg"; en fuerza omitila o
  usá "reps".
- En cardio con "series" > 1, "descansoSeg" es la recuperación activa entre
  bloques (ej: 6 bloques de 2 min de trote con 180 seg caminando).
- "nuevos_ejercicios" puede ir vacío: [].
- No agregues texto después del bloque JSON.
"""


def main() -> None:
    catalogo = json.loads(CATALOGO.read_text())
    banco = [
        {"id": e["id"], "n": e["nombre_es"], "m": e["movimiento"],
         "mu": e["musculo"], "g": e["grupo"], "t": e["tipo"]}
        for e in catalogo
    ]
    banco_json = "[\n" + ",\n".join(
        json.dumps(item, ensure_ascii=False, separators=(",", ":")) for item in banco
    ) + "\n]"
    SALIDA.parent.mkdir(parents=True, exist_ok=True)
    SALIDA.write_text(PLANTILLA.format(banco=banco_json))
    kb = SALIDA.stat().st_size / 1024
    print(f"{SALIDA.relative_to(RAIZ)} generado: {len(banco)} ejercicios, {kb:.0f} KB")


if __name__ == "__main__":
    main()
