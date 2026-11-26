<p align="center"><a href="#english">English</a> | <a href="#espa%C3%B1ol">Español</a></p>

<a id="english"></a>

# Radar

## What it is

Radar is a sidebar pane for Claude Code that shows, live, what the session is doing: which agents are running, the task plan, every tool call, and the files read, edited or created. It is a Claude Code mod (function hooks) and opens by itself when a session starts.

![Radar, Placa view: motherboard graph of the session](docs/board.png)

*Board view (rendered preview).*

![Radar view: the main agent in the centre, subagents on the inner ring, tool kinds on the outer ring](docs/radar.png)

*Radar view, the original one that gives the mod its name (screenshot from the desktop app).*

## Features

Top box, `U0 · AGENTES`: an animated graph with two views, switched by a button.

- **Placa** (default): a motherboard. The main agent is the central CPU chip and shows its model. Seven peripheral chips stand for the kinds of tool use (Archivos, Skills, MCP, Plugins, Webhooks, Web, Agentes). Buses link them; a bus gets brighter the more it is used and carries animated light packets while calls run. Error LEDs show error counts. Subagents are smaller chips on an expansion bus: running ones are shown one by one with what they are doing, finished ones are grouped by type and model with ×N. A pulse expands from the CPU and speeds up with workload. A status strip shows the current call.
- **Radar**: the view the mod is named after. The main agent is the core in the centre with its model. Subagents sit on the inner ring, grouped by type and model. The seven kinds of tool use are stations on the outer ring: each spoke thickens with use, pulses fly to the stations that are working, a red badge counts errors, and a sweep turns around the core.

Meter strip (between the two boxes, always visible, even with the tabs box folded): context usage as a mini bar with `CTX 43% · 86k/200k` and, when the host reports them, the rate-limit windows (`5H 20%  7D 61%`). Accent colour normally, brighter from 80%, rose from 95%. A figure the host does not report is left out, never shown as zero.

Bottom box, four tabs with live badges (only the selected tab shows its name; the others show an icon and their badge so all four fit in 46 columns):

- **TAREAS**: segmented plan progress bar, N/M and %, and the full task list (✓ done, ▶ current, ○ pending) with elapsed time on the current task.
- **PROCESOS**: live feed of tool calls with kind, agent, model and duration. Filters: "solo errores" and by agent. Press a row for full detail, including the complete command or path and the error text. "ir a lo último" jumps to the newest call.
- **ARCHIVOS**: tree of files read, edited and created, with `+A −D` changed lines per file. Press an edited file to see its diff.
- **USAGE** (badge: context %): context bar and tokens, a rate limit bar per window with the time until it resets, tokens per agent (main first, then subagents; finished ones grouped by type and model) with an `in / out / cache` split and a bar relative to the biggest spender, and tokens per model. Main-loop tokens are summed from each model request; subagent tokens come from the host's per-agent ledger, so nothing is counted twice. Main-loop figures count from the moment the mod loads in a session.
- **Handoff alert** (USAGE tab, button `handoff at`): pick OFF, 100k, 150k, 200k, 300k or 500k tokens of context. Once context reaches it, the strip shows `⚑ HANDOFF` highlighted and one toast fires per crossing (re-armed when usage drops, e.g. after a compaction or `/clear`). Off by default; the choice is remembered.
- **Cost** is off by default (flat-rate plans do not need it). The `$ cost` button in the USAGE tab shows an estimate for the session and per agent; it is a client-side estimate, not billing. The choice is remembered.

Controls: fold either box, a button that cycles three height presets, scroll buttons. The palette is cold gray/blue, to match the Claude Code UI. The UI is available in English and Spanish: switch with the `EN`/`ES` button in the pane header (English by default; the choice is remembered).

## Install

```
/plugin marketplace add alucard643/claude-code-radar
/plugin install radar@claude-code-radar
```

Then restart Claude Code.

## Usage

Radar opens automatically at session start. Run `/radar` to reopen it.

## Requirements and limits

- Claude Code mods (function hooks) are an **early access API**. It may change between releases and break this mod.
- Developed and checked on Windows with the Claude desktop app. In the terminal, the graph falls back to text.
- The feed keeps the last 120 calls.
- No data leaves your machine. The mod makes no network calls: searching the hooks for `fetch`, `$.net`, `$.http` and `$.model` finds nothing.
- The UI is available in English and Spanish: switch with the `EN`/`ES` button in the pane header (English by default; the choice is remembered).

## Development

From the repo root:

```
claude plugin validate radar
claude plugin test radar
```

## Support

If Radar is useful to you, you can buy me a coffee. Thanks.

[![Support me on Ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/zeuscolmenares)

## License

[MIT](LICENSE)

---

<a id="español"></a>

# Radar (Español)

## Qué es

Radar es un panel lateral para Claude Code que muestra en vivo qué hace la sesión: qué agentes corren, el plan de tareas, cada llamada a herramientas y los archivos leídos, editados o creados. Es un mod de Claude Code (hooks de función) y se abre solo al iniciar una sesión.

![Radar, vista Placa: grafo de placa base de la sesión](docs/board.png)

*Vista Placa (vista previa renderizada).*

![Vista Radar: el agente principal en el centro, los subagentes en el anillo interior y los tipos de herramienta en el anillo exterior](docs/radar.png)

*Vista Radar, la original, que da nombre al mod (captura de la app de escritorio).*

## Características

Caja superior, `U0 · AGENTES`: un grafo animado con dos vistas, que se cambian con un botón.

- **Placa** (por defecto): una placa base. El agente principal es el chip central (CPU) y muestra su modelo. Siete chips periféricos representan los tipos de uso de herramientas (Archivos, Skills, MCP, Plugins, Webhooks, Web, Agentes). Los buses los unen; un bus se ilumina más cuanto más se usa y lleva paquetes de luz animados mientras corren las llamadas. Los LED de error muestran el número de errores. Los subagentes son chips más pequeños en un bus de expansión: los que corren se muestran uno a uno con lo que hacen, los terminados se agrupan por tipo y modelo con ×N. Un pulso se expande desde la CPU y se acelera con la carga de trabajo. Una franja de estado muestra la llamada actual.
- **Radar**: la vista que da nombre al mod. El agente principal es el núcleo del centro, con su modelo. Los subagentes van en el anillo interior, agrupados por tipo y modelo. Los siete tipos de uso de herramientas son estaciones en el anillo exterior: cada radio se engrosa con el uso, los pulsos vuelan hacia las estaciones que están trabajando, una insignia roja cuenta los errores y un barrido gira alrededor del núcleo.

Franja de medidores (entre las dos cajas, siempre visible, incluso con la caja de pestañas plegada): uso de contexto como mini barra con `CTX 43% · 86k/200k` y, cuando el host los informa, las ventanas de límite de uso (`5H 20%  7D 61%`). Color de acento normal, más claro desde el 80%, rosa desde el 95%. Una cifra que el host no informa se omite, nunca se muestra como cero.

Caja inferior, cuatro pestañas con contadores en vivo (solo la pestaña activa muestra su nombre; las demás muestran un icono y su contador para que quepan las cuatro en 46 columnas):

- **TAREAS**: barra de progreso del plan segmentada, N/M y %, y la lista completa de tareas (✓ hecha, ▶ actual, ○ pendiente) con el tiempo transcurrido de la actual.
- **PROCESOS**: feed en vivo de llamadas a herramientas con tipo, agente, modelo y duración. Filtros: "solo errores" y por agente. Pulsa una fila para ver el detalle completo, con el comando o ruta completos y el texto del error. "ir a lo último" salta a la llamada más reciente.
- **ARCHIVOS**: árbol de archivos leídos, editados y creados, con líneas cambiadas `+A −D` por archivo. Pulsa un archivo editado para ver su diff.
- **USO** (contador: % de contexto): barra de contexto y tokens, una barra por ventana de límite con el tiempo hasta que se reinicia, tokens por agente (primero el principal, luego los subagentes; los terminados agrupados por tipo y modelo) con desglose `ent / sal / caché` y una barra relativa al que más gasta, y tokens por modelo. Los tokens del agente principal se suman de cada petición al modelo; los de los subagentes salen del registro por agente del host, así que nada se cuenta dos veces. Las cifras del principal cuentan desde que el mod se carga en la sesión.
- **Alerta de relevo** (pestaña USO, botón `relevo en`): elige OFF, 100k, 150k, 200k, 300k o 500k tokens de contexto. Al alcanzarlo, la franja muestra `⚑ RELEVO` resaltado y salta un aviso por cada cruce (se rearma cuando el uso baja, p. ej. tras compactar o `/clear`). Desactivada por defecto; la elección se recuerda.
- **Coste** desactivado por defecto (los planes de tarifa fija no lo necesitan). El botón `$ coste` de la pestaña USO muestra una estimación de la sesión y por agente; es una estimación del cliente, no facturación. La elección se recuerda.

Controles: plegar cualquiera de las dos cajas, un botón que alterna tres alturas predefinidas, botones de scroll. La paleta es gris/azul frío, a juego con la interfaz de Claude Code. La interfaz está disponible en inglés y español: se cambia con el botón `EN`/`ES` de la cabecera del panel (inglés por defecto; la elección se recuerda).

## Instalación

```
/plugin marketplace add alucard643/claude-code-radar
/plugin install radar@claude-code-radar
```

Después reinicia Claude Code.

## Uso

Radar se abre solo al iniciar la sesión. Ejecuta `/radar` para reabrirlo.

## Requisitos y límites

- Los mods de Claude Code (hooks de función) son una **API de acceso anticipado**. Puede cambiar entre versiones y romper este mod.
- Desarrollado y comprobado en Windows con la app de escritorio de Claude. En la terminal, el grafo usa un texto alternativo.
- El feed guarda las últimas 120 llamadas.
- Ningún dato sale de tu máquina. El mod no hace llamadas de red: buscar `fetch`, `$.net`, `$.http` y `$.model` en los hooks no encuentra nada.
- La interfaz está disponible en inglés y español: se cambia con el botón `EN`/`ES` de la cabecera del panel (inglés por defecto; la elección se recuerda).

## Desarrollo

Desde la raíz del repo:

```
claude plugin validate radar
claude plugin test radar
```

## Apoyo

Si Radar te resulta útil, puedes invitarme un café. Gracias.

[![Apóyame en Ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/zeuscolmenares)

## Licencia

[MIT](LICENSE)
