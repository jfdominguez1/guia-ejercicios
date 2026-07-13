#!/usr/bin/env python3
"""Preprocesa el dataset de ejercicios al catálogo español de la app.

Lee reference/libs/exercises-dataset (solo lectura), filtra por 4 grupos de
equipamiento, clasifica cada ejercicio por patrón de movimiento, copia la
media (gif + thumb) renombrada por id y genera:
  - src/data/ejercicios.json   (catálogo de la app, nombre_es se completa después)
  - scripts/out/nombres-pendientes.json  ({id: nombre_en} para traducir)

Uso: python3 scripts/preprocesar.py  (desde la raíz del proyecto)
"""

import json
import shutil
import sys
import unicodedata
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
DATASET = RAIZ.parent.parent / "reference" / "libs" / "exercises-dataset"
DICCIONARIO = RAIZ / "scripts" / "diccionario-es.json"
SALIDA_JSON = RAIZ / "src" / "data" / "ejercicios.json"
SALIDA_PENDIENTES = RAIZ / "scripts" / "out" / "nombres-pendientes.json"
MEDIA_GIF = RAIZ / "public" / "media" / "gif"
MEDIA_IMG = RAIZ / "public" / "media" / "img"

GRUPOS: dict[str, list[str]] = {
    "banda": ["band", "resistance band"],
    "pesas": ["dumbbell", "barbell", "ez barbell", "olympic barbell", "kettlebell", "weighted"],
    "maquina": [
        "cable", "leverage machine", "smith machine", "sled machine",
        "elliptical machine", "stepmill machine", "upper body ergometer",
        "stationary bike", "skierg machine",
    ],
    "cuerpo": ["body weight"],
}

# Elongación / movilidad (JFD 2026-07-12): entra TODO lo que matchee por
# nombre, con equipamiento propio (pelota, rodillo) además de los 4 grupos.
ELONGACION_KEYWORDS = ["stretch", "yoga", "pose", "mobility", "foam roll"]
GRUPO_ELONGACION: dict[str, str] = {
    "body weight": "cuerpo",
    "assisted": "cuerpo",
    "weighted": "cuerpo",
    "rope": "banda",       # se hace igual con banda o toalla
    "stability ball": "pelota",
    "roller": "rodillo",
}

# Patrones por keyword en name, en orden de prioridad (primer match gana).
# 'leg press' va antes que 'press' para caer en piernas-empuje y no en empuje.
PATRONES: list[tuple[list[str], str]] = [
    (["leg press", "squat", "lunge"], "piernas-empuje"),
    (["press", "bench"], "empuje"),
    (["pulldown", "pull-up", "chin", "row", "pull"], "traccion"),
    (["deadlift", "hip thrust", "bridge"], "cadera"),
    (["curl"], "curl"),  # solo si target es biceps/hamstrings (ver clasificar)
    (["extension", "pushdown"], "extension"),
    (["raise", "fly", "lateral"], "elevacion"),
    (["crunch", "sit-up", "plank", "twist"], "core"),
]
TARGETS_CURL = {"biceps", "hamstrings"}

# Cardio de impacto (saltos/burpees/jacks) — curado a mano 2026-07-12 (A3).
# El generador/swaps no los proponen para nivel empiezo con 50+ años.
CARDIO_IMPACTO_IDS: set[str] = {
    "3220",  # astride jumps
    "1160",  # burpee
    "1201",  # dumbbell burpee
    "0501",  # jack burpee
    "3224",  # jack jump
    "3219",  # scissor jumps
    "3222",  # semi squat jump
    "3361",  # skater hops
    "3223",  # star jump
}

# Ejercicios básicos (nivel "empiezo"): lista curada explícita, editable a mano.
# Criterio: clásicos simples y seguros, cubriendo movimiento × grupo (curada 2026-07-12).
BASICOS_IDS: set[str] = {
    # sentadilla / piernas empuje
    "0043",  # barbell full squat
    "1760",  # dumbbell goblet squat
    "0413",  # dumbbell squat
    "1004",  # band squat
    "2368",  # split squats (cuerpo)
    "0750",  # smith chair squat
    "0770",  # smith squat
    "0739",  # sled 45 leg press
    "1460",  # walking lunge (cuerpo)
    "0336",  # dumbbell lunge
    # cadera / posterior
    "0032",  # barbell deadlift
    "0300",  # dumbbell deadlift
    "0085",  # barbell romanian deadlift
    "1459",  # dumbbell romanian deadlift
    "1009",  # band stiff leg deadlift
    "1409",  # barbell glute bridge
    "3013",  # low glute bridge on floor (cuerpo)
    "3236",  # resistance band hip thrusts on knees
    # empuje pecho
    "0025",  # barbell bench press
    "0289",  # dumbbell bench press
    "0577",  # lever chest press
    "0748",  # smith bench press
    "1254",  # band bench press
    "0662",  # push-up
    # empuje hombro
    "0091",  # barbell seated overhead press
    "0426",  # dumbbell standing overhead press
    "0603",  # lever shoulder press
    "0997",  # band shoulder press
    # elevaciones hombro
    "0334",  # dumbbell lateral raise
    "0178",  # cable lateral raise
    "0310",  # dumbbell front raise
    "0978",  # band front raise
    "2292",  # dumbbell rear delt raise
    "0993",  # band reverse fly
    # traccion espalda
    "0652",  # pull-up
    "1326",  # chin-up
    "0017",  # assisted pull-up
    "0970",  # band assisted pull-up
    "0198",  # cable pulldown
    "0579",  # lever front pulldown
    "1013",  # band underhand pulldown
    "0861",  # cable seated row
    "1350",  # lever seated row
    "0027",  # barbell bent over row
    "0293",  # dumbbell bent over row
    "0499",  # inverted row (cuerpo)
    "0988",  # band one arm standing low row
    # biceps
    "0294",  # dumbbell biceps curl
    "0031",  # barbell curl
    "0313",  # dumbbell hammer curl
    "0868",  # cable curl
    "0968",  # band alternating biceps curl
    # triceps
    "0201",  # cable pushdown
    "0607",  # lever triceps extension
    "0061",  # barbell lying triceps extension
    "0998",  # band side triceps extension
    "0251",  # chest dip (cuerpo)
    # piernas aislamiento + pantorrillas
    "0585",  # lever leg extension
    "3007",  # resistance band leg extension
    "0586",  # lever lying leg curl
    "0599",  # lever seated leg curl
    "0088",  # barbell seated calf raise
    "1383",  # hack calf raise
    "0999",  # band single leg calf raise
    "1387",  # one leg floor calf raise (cuerpo)
    # core
    "0001",  # 3/4 sit-up
    "0274",  # crunch floor
    "0687",  # russian twist
    "0276",  # dead bug
    "0705",  # side bridge v. 2 (plancha lateral)
    "0689",  # seated leg raise
    "0832",  # weighted crunch
    "1011",  # band seated twist
    # lumbar
    "0489",  # hyperextension (cuerpo)
    "0573",  # lever back extension
    # otros utiles
    "0431",  # dumbbell step-up
    "1008",  # band step-up
    "0220",  # cable shrug
    "1018",  # band shrug
    "0597",  # lever seated hip abduction
    "3006",  # resistance band seated hip abduction
    "0710",  # side hip abduction (cuerpo)
    "0630",  # mountain climber
    "0003",  # air bike
}


def slug(texto: str) -> str:
    """minúsculas sin acentos ni espacios, para claves de movimiento."""
    plano = unicodedata.normalize("NFD", texto)
    plano = "".join(c for c in plano if unicodedata.category(c) != "Mn")
    return plano.lower().replace("/", "-").replace(" ", "-")


def grupo_de(equipment: str) -> str | None:
    for grupo, equipos in GRUPOS.items():
        if equipment in equipos:
            return grupo
    return None


def patron_de(name: str, target: str) -> str:
    nombre = name.lower()
    for keywords, patron in PATRONES:
        if any(k in nombre for k in keywords):
            if patron == "curl" and target not in TARGETS_CURL:
                continue
            return patron
    return "otro"


def es_elongacion(name: str) -> bool:
    return any(k in name.lower() for k in ELONGACION_KEYWORDS)


def tipo_de(ejercicio: dict) -> str:
    """fuerza | elongacion | cardio. Cardio = target sistema cardiovascular."""
    if es_elongacion(ejercicio["name"]):
        return "elongacion"
    if ejercicio["target"] == "cardiovascular system":
        return "cardio"
    return "fuerza"


def clasificar(ejercicio: dict, musculos_es: dict[str, str]) -> dict | None:
    tipo = tipo_de(ejercicio)
    if tipo == "elongacion":
        grupo = GRUPO_ELONGACION.get(ejercicio["equipment"])
    else:
        grupo = grupo_de(ejercicio["equipment"])
    if grupo is None:
        return None
    target = ejercicio["target"]
    musculo_es = musculos_es.get(target, target)
    patron = "elongacion" if tipo == "elongacion" else patron_de(ejercicio["name"], target)
    return {
        "id": ejercicio["id"],
        "nombre_es": None,
        "nombre_en": ejercicio["name"],
        "tipo": tipo,
        **({"impacto": ejercicio["id"] in CARDIO_IMPACTO_IDS} if tipo == "cardio" else {}),
        "grupo": grupo,
        "equipment": ejercicio["equipment"],
        "zona": ejercicio["body_part"],
        "musculo": musculo_es,
        "secundarios": ejercicio.get("secondary_muscles") or [],
        "pasos": ejercicio["instruction_steps"]["es"],
        "movimiento": f"{patron}-{slug(musculo_es)}",
        "basico": False,
    }


def copiar_media(catalogo: list[dict]) -> int:
    MEDIA_GIF.mkdir(parents=True, exist_ok=True)
    MEDIA_IMG.mkdir(parents=True, exist_ok=True)
    copiados = 0
    for e in catalogo:
        origen_gif = DATASET / e["_gif"]
        origen_img = DATASET / e["_img"]
        if not origen_gif.exists() or not origen_img.exists():
            print(f"  AVISO: media faltante para {e['id']} ({e['nombre_en']})", file=sys.stderr)
            continue
        shutil.copyfile(origen_gif, MEDIA_GIF / f"{e['id']}.gif")
        shutil.copyfile(origen_img, MEDIA_IMG / f"{e['id']}.jpg")
        copiados += 1
    return copiados


def main() -> None:
    diccionario = json.loads(DICCIONARIO.read_text())
    zonas_es: dict[str, str] = diccionario["zonas"]
    musculos_es: dict[str, str] = diccionario["musculos"]

    crudos = json.loads((DATASET / "data" / "exercises.json").read_text())
    catalogo: list[dict] = []
    for ejercicio in crudos:
        fila = clasificar(ejercicio, musculos_es)
        if fila is None:
            continue
        fila["zona"] = zonas_es.get(fila["zona"], fila["zona"])
        fila["secundarios"] = [musculos_es.get(m, m) for m in fila["secundarios"]]
        fila["_gif"] = ejercicio["gif_url"]
        fila["_img"] = ejercicio["image"]
        catalogo.append(fila)

    sin_pasos = [e["id"] for e in catalogo if not e["pasos"]]
    if sin_pasos:
        sys.exit(f"ERROR: {len(sin_pasos)} ejercicios sin pasos en español: {sin_pasos[:10]}")

    ids_catalogo = {e["id"] for e in catalogo}
    faltantes = BASICOS_IDS - ids_catalogo
    if faltantes:
        sys.exit(f"ERROR: ids de BASICOS_IDS fuera del catálogo: {sorted(faltantes)}")
    for e in catalogo:
        # elongación sin equipo especial es apta para nivel "empiezo"
        elongacion_simple = e["tipo"] == "elongacion" and e["grupo"] in ("cuerpo", "banda")
        e["basico"] = e["id"] in BASICOS_IDS or elongacion_simple

    copiados = copiar_media(catalogo)
    for e in catalogo:
        del e["_gif"], e["_img"]

    SALIDA_JSON.parent.mkdir(parents=True, exist_ok=True)
    SALIDA_JSON.write_text(json.dumps(catalogo, ensure_ascii=False, indent=1))
    # copia servible por la app (fetch en runtime, respetando BASE_URL)
    SALIDA_PUBLICA = RAIZ / "public" / "data" / "ejercicios.json"
    SALIDA_PUBLICA.parent.mkdir(parents=True, exist_ok=True)
    SALIDA_PUBLICA.write_text(json.dumps(catalogo, ensure_ascii=False, separators=(",", ":")))
    SALIDA_PENDIENTES.parent.mkdir(parents=True, exist_ok=True)
    pendientes = {e["id"]: e["nombre_en"] for e in catalogo}
    SALIDA_PENDIENTES.write_text(json.dumps(pendientes, ensure_ascii=False, indent=1))

    grupos_todos = sorted({e["grupo"] for e in catalogo})
    grupos = {g: sum(1 for e in catalogo if e["grupo"] == g) for g in grupos_todos}
    tipos = {t: sum(1 for e in catalogo if e["tipo"] == t) for t in ("fuerza", "elongacion", "cardio")}
    print(f"{len(catalogo)} ejercicios ({grupos}), tipos: {tipos}, "
          f"media copiada: {copiados}, "
          f"básicos: {sum(1 for e in catalogo if e['basico'])}, "
          f"nombres pendientes: {len(pendientes)}")


if __name__ == "__main__":
    main()
