#!/usr/bin/env python3
"""Agrega al catálogo las modalidades de cardio "libres" (bici, correr, remo…).

Por qué existe: el catálogo original trae 28 ejercicios de cardio y casi todos
son HIIT de peso corporal (burpees, jumping jacks, saltos). Los de máquina
tienen nombres que no dicen qué sesión estás haciendo ("Bicicleta estática
trote v. 3"), y no hay forma de anotar "hoy hice zona 2 en bici, 40 minutos".

Estas 12 entradas son por MODALIDAD + INTENCIÓN, que es como se piensa una
sesión de cardio en la práctica: no es lo mismo un Z2 de 40' que unos
intervalos de 20', aunque los dos sean "bici". Separadas, el historial y el
gráfico de progreso de cada una quedan limpios.

Tres decisiones que están acá y no se pueden cambiar sin entender por qué:

1. Van al PRINCIPIO del array. `alternativasDe` corta los equivalentes en 12
   siguiendo el orden del catálogo; si se agregan al final, "Cambiar ejercicio
   ⇄" nunca las muestra porque los 28 cardios viejos llenan el cupo primero.
   Prepender no altera ninguna rutina generada: `poolFuerza` y
   `generarElongacion` filtran por tipo antes de que el orden importe.

2. `movimiento` = "otro-sistema-cardiovascular", el mismo que ya usan los
   cardios del catálogo. Es lo que hace que aparezcan como EQUIVALENTES al
   tocar "Cambiar ejercicio ⇄" estando en la cinta. Con un movimiento propio
   quedarían fuera de esa lista, que es justo el caso de uso.

3. `media: "ninguna"` — no hay GIF de "andar en bici". Sin el flag, el <img>
   pide un .gif que no existe y el onerror cae a un .jpg que tampoco, así que
   se ve el ícono de imagen rota; y "Descargar todas las demostraciones"
   pediría 24 archivos 404.

`unidad` NO se define acá: vive en la dosis de la rutina, y `dosisInicial`
ya devuelve 'min' para todo lo que es cardio.

Idempotente: correrlo dos veces no duplica nada.
"""

from __future__ import annotations

import json
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
DESTINOS = [
    (RAIZ / "src/data/ejercicios.json", 1),  # fuente legible (la leen los tests)
    (RAIZ / "public/data/ejercicios.json", None),  # la que sirve la app, minificada
]

MOVIMIENTO = "otro-sistema-cardiovascular"
PIERNAS = ["Cuádriceps", "Isquiotibiales", "Pantorrillas"]

# (id, nombre_es, nombre_en, grupo, equipment, impacto, secundarios, pasos)
MODALIDADES = [
    (
        "CARDIO-bici-z2",
        "Bici — zona 2",
        "bike — zone 2",
        "maquina",
        "stationary bike",
        False,
        PIERNAS,
        [
            "Ajustá el asiento: con el pedal abajo, la rodilla queda casi extendida.",
            "Pedaleá parejo a una intensidad en la que podrías mantener una conversación.",
            "Buscá la zona de FC objetivo y quedate ahí: si subís de más, bajá la resistencia.",
            "Sostené el ritmo todo el bloque — la gracia de la zona 2 es que sea continua.",
            "Cerrá con 3-5 minutos suaves para bajar pulsaciones.",
        ],
    ),
    (
        "CARDIO-bici-intervalos",
        "Bici — intervalos",
        "bike — intervals",
        "maquina",
        "stationary bike",
        False,
        PIERNAS,
        [
            "Entrá en calor 5-10 minutos pedaleando suave.",
            "Alterná bloques fuertes con bloques de recuperación activa (no pares del todo).",
            "En el bloque fuerte subí resistencia o cadencia hasta que hablar cueste.",
            "En la recuperación bajá hasta poder respirar por la nariz.",
            "Cerrá con 5 minutos suaves.",
        ],
    ),
    (
        "CARDIO-cinta-pendiente",
        "Cinta — caminata en pendiente",
        "treadmill — incline walk",
        "maquina",
        "treadmill",
        False,
        PIERNAS,
        [
            "Subí la inclinación hasta que caminar exija, sin necesidad de correr.",
            "Caminá erguido y no te cuelgues de los manubrios: te saca la mitad del trabajo.",
            "Ajustá velocidad e inclinación para quedarte en la zona de FC objetivo.",
            "Sostené el ritmo todo el bloque.",
            "Bajá la inclinación de a poco los últimos minutos.",
        ],
    ),
    (
        "CARDIO-cinta-intervalos",
        "Cinta — intervalos",
        "treadmill — intervals",
        "maquina",
        "treadmill",
        True,
        PIERNAS,
        [
            "Entrá en calor 5-10 minutos caminando o trotando suave.",
            "Alterná bloques rápidos con bloques de caminata o trote regenerativo.",
            "Cambiá la velocidad con anticipación: la cinta tarda en acelerar y en frenar.",
            "Si la respiración no se recupera en el bloque suave, alargalo.",
            "Cerrá caminando 5 minutos.",
        ],
    ),
    (
        "CARDIO-correr-z2",
        "Correr — zona 2",
        "run — zone 2",
        "cuerpo",
        "body weight",
        True,
        PIERNAS,
        [
            "Arrancá caminando o trotando muy suave los primeros minutos.",
            "Sostené un ritmo en el que puedas hablar en frases completas.",
            "Si para quedarte en zona 2 tenés que caminar, caminá: es lo correcto, no una falla.",
            "Mantené el ritmo constante todo el bloque.",
            "Cerrá caminando unos minutos.",
        ],
    ),
    (
        "CARDIO-correr-intervalos",
        "Correr — intervalos",
        "run — intervals",
        "cuerpo",
        "body weight",
        True,
        PIERNAS,
        [
            "Entrá en calor 10 minutos de trote suave y algo de movilidad.",
            "Alterná tramos rápidos con tramos de trote muy suave o caminata.",
            "Buscá terminar cada tramo fuerte con la sensación de que te quedaba uno más.",
            "No recortes la recuperación: es lo que sostiene la calidad de los tramos.",
            "Cerrá con 5-10 minutos suaves.",
        ],
    ),
    (
        "CARDIO-eliptica-z2",
        "Elíptica — zona 2",
        "elliptical — zone 2",
        "maquina",
        "elliptical machine",
        False,
        PIERNAS,
        [
            "Apoyá los pies completos en las plataformas y agarrá los manubrios sin colgarte.",
            "Movete parejo, empujando y traccionando con los brazos además de las piernas.",
            "Ajustá la resistencia para quedarte en la zona de FC objetivo.",
            "Sostené el ritmo todo el bloque.",
            "Bajá la resistencia los últimos minutos.",
        ],
    ),
    (
        "CARDIO-remo-z2",
        "Remo — zona 2",
        "rowing — zone 2",
        "maquina",
        "rowing machine",
        False,
        ["Dorsales", "Cuádriceps", "Glúteos"],
        [
            "Sujetá los pies y agarrá la manija con los brazos estirados y la espalda recta.",
            "El orden es piernas, cadera, brazos — y a la vuelta al revés.",
            "Buscá remadas largas y tranquilas antes que muchas y cortas.",
            "Sostené el ritmo dentro de la zona de FC objetivo.",
            "Cerrá remando suave un par de minutos.",
        ],
    ),
    (
        "CARDIO-escalera",
        "Escalera / stepper",
        "stair climber",
        "maquina",
        "stair climber",
        False,
        ["Glúteos", "Cuádriceps", "Pantorrillas"],
        [
            "Subí erguido, sin apoyar el peso en los manubrios.",
            "Pisá el escalón completo, no solo con la punta del pie.",
            "Ajustá la velocidad para quedarte en la zona de FC objetivo.",
            "Sostené el ritmo todo el bloque.",
            "Bajá la velocidad los últimos minutos.",
        ],
    ),
    (
        "CARDIO-caminata-libre",
        "Caminata al aire libre",
        "outdoor walk",
        "cuerpo",
        "body weight",
        False,
        PIERNAS,
        [
            "Caminá a paso vivo, con el pecho abierto y los brazos sueltos.",
            "Buscá subidas si querés que exija más sin tener que trotar.",
            "Si llevás pulsómetro, apuntá a la zona objetivo; si no, guiate por poder hablar.",
            "Sostené el paso todo el bloque.",
            "Aflojá el ritmo los últimos minutos.",
        ],
    ),
    (
        "CARDIO-natacion",
        "Natación",
        "swimming",
        "cuerpo",
        "body weight",
        False,
        ["Dorsales", "Deltoides", "Core"],
        [
            "Entrá en calor con unos largos suaves.",
            "Elegí el estilo que puedas sostener sin frenar cada dos largos.",
            "Respirá con ritmo fijo, es lo que sostiene la intensidad pareja.",
            "Contá el tiempo total nadando, sin las pausas de borde.",
            "Cerrá con unos largos suaves.",
        ],
    ),
    (
        "CARDIO-libre",
        "Cardio libre",
        "free cardio",
        "cuerpo",
        "body weight",
        False,
        ["Sistema cardiovascular"],
        [
            "Comodín: cualquier actividad aeróbica que no esté en la lista.",
            "Anotá los minutos y, si la tenés, la frecuencia cardíaca promedio.",
            "Usalo para fútbol, tenis, baile, kayak, una clase — lo que hayas hecho.",
            "Si algo se repite seguido, conviene crearlo como ejercicio propio.",
        ],
    ),
]


def construir() -> list[dict]:
    entradas = []
    for id_, es, en, grupo, equipo, impacto, secundarios, pasos in MODALIDADES:
        entradas.append(
            {
                "id": id_,
                "nombre_es": es,
                "nombre_en": en,
                "tipo": "cardio",
                "impacto": impacto,
                "grupo": grupo,
                "equipment": equipo,
                "zona": "Cardio",
                "musculo": "Sistema cardiovascular",
                "secundarios": secundarios,
                "pasos": pasos,
                "movimiento": MOVIMIENTO,
                "basico": True,
                "media": "ninguna",
            }
        )
    return entradas


def main() -> None:
    nuevas = construir()
    ids = {e["id"] for e in nuevas}

    for ruta, sangria in DESTINOS:
        catalogo = json.loads(ruta.read_text(encoding="utf-8"))
        previos = len(catalogo)
        sin_modalidades = [e for e in catalogo if e["id"] not in ids]
        catalogo = nuevas + sin_modalidades
        ruta.write_text(
            json.dumps(catalogo, ensure_ascii=False, indent=sangria)
            if sangria
            else json.dumps(catalogo, ensure_ascii=False, separators=(",", ":")),
            encoding="utf-8",
        )
        print(f"{ruta.relative_to(RAIZ)}: {previos} → {len(catalogo)}")


if __name__ == "__main__":
    main()
