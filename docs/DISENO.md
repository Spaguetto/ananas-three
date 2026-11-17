# Dirección visual: un libro familiar vivo

Estado: propuesta histórica de la primera entrega. La revisión vigente, solicitada por el usuario para sustituir la apariencia de restaurante, está en [DISENO-REVISION.md](DISENO-REVISION.md). Nombre implementado: **Entre ramas**.

## Idea

Una mesa de consulta con un libro abierto. El árbol ocupa el folio principal y la ficha seleccionada se abre como una página de archivo al costado. La personalidad aparece en el papel, las letras y las ramas dibujadas con tinta; el trabajo diario conserva controles claros y legibles.

Referencias: el grabado genealógico suministrado para las ramas y cartelas, la leyenda de Miro para la incertidumbre, y [Inkulinati](https://www.escapistmagazine.com/inkulinati-is-a-serious-strategy-game-created-with-absurd-hilarious-medieval-art/) para el carácter de manuscrito e ilustración. Ilustraciones y ornamentos originales; no reutilizar arte del juego como identidad del producto.

## Paleta base

| Token | Color | Uso |
| --- | --- | --- |
| Papel | `#F1E5C9` | Fondo cálido del folio, textura de baja intensidad |
| Tinta | `#302A24` | Texto, iconos y vínculos confirmados |
| Pergamino oscuro | `#D8C49D` | Cantos, bordes y separación de hojas |
| Carmín | `#8D343D` | Acción principal, selección y sello de revisión |
| Oliva | `#556344` | Ornamentación y acentos de genealogía |
| Violeta | `#76659A` | Frontera de investigación |

Naranja semántico adicional `#A95C20` para relaciones supuestas. Colores claros para fondos; texto en tinta oscura. Los contrastes se comprobarán sobre el diseño real y los indicadores siempre tendrán texto o patrón, además de color.

## Código de relaciones

| Significado | Representación propuesta |
| --- | --- |
| Parentesco respaldado y revisado | Línea de tinta continua, etiqueta del vínculo y acceso a evidencia |
| Relación supuesta | Línea naranja discontinua y etiqueta «Por confirmar» |
| Padrino/madrina confirmado | Línea negra punteada con etiqueta y evento asociado |
| No se conoce ascendencia adicional | Círculo violeta y texto «Sin ascendencia registrada» |
| Padrino confirmado; parentesco adicional desconocido | Círculo claro con borde violeta, acompañado de una etiqueta explícita |
| Información contradictoria | Marca carmín «En conflicto»; abrir comparación de fuentes |

La leyenda original mezcla en un símbolo dos ideas («padrinos confirmados» y «no hay más relación»). Se conservará como referencia, pero la nueva interfaz distinguirá tipo de vínculo, estado de revisión y estado de la investigación. «Sin información» no significa «esa relación no existe».

No colorear hombres y mujeres como sustituto del estado de evidencia. Si más adelante se añaden colores de ramas familiares, usar acentos separados de los patrones de certeza.

## Tipografía y composición

- Títulos: propuesta de Cormorant Garamond o una serif de libro equivalente, alojada localmente y con licencia comprobada al incorporarla.
- Controles y cuerpo: Source Sans 3 o equivalente legible con todos los acentos del español, también local.
- Escritura ornamental solo en detalles breves, nunca en formularios, notas extensas o nombres del grafo.
- Cuerpo alineado a la izquierda; texto largo con anchura de lectura limitada. La cartela debe permitir nombres extensos sin recortes silenciosos.
- El grabado vegetal será el elemento distintivo. Evitar que marcos, sellos y texturas compitan por la atención.

## Pantallas

1. **Árbol:** búsqueda, persona central, generaciones, ancestros/descendientes, filtros de vínculos y controles de zoom.
2. **Persona:** resumen, parentescos, cronología, documentos, relatos y pendientes. Mostrar fuente y certeza junto a cada dato relevante.
3. **Archivo:** búsqueda de documentos, ficha de fuente, personas relacionadas y vista de original/transcripción.
4. **Investigación:** importaciones pendientes, posibles duplicados, contradicciones y preguntas abiertas.

```text
┌ Libro de la familia ─ Árbol · Personas · Archivo · Investigación ┐
│ Buscar persona…                          Agregar persona        │
├───────────────────────────────────────────┬─────────────────────┤
│ Ancestros / Descendientes   Generaciones 2 │ Ficha de la persona │
│                                           │ Nombre y variantes  │
│             [Progenitor]                  │ Fechas y certeza    │
│                  │                        │ Familia             │
│             [Persona] ── [Vínculo]         │ Fuentes             │
│                  │                        │ Agregar información │
│               [Hijo/a]                    │                     │
│ Leyenda   Zoom   Centrar                   │                     │
└───────────────────────────────────────────┴─────────────────────┘
```

En móvil, priorizar la ficha y la lista de familiares; el árbol se abre como explorador a pantalla completa. La metáfora de libro no obliga a usar dos páginas estrechas en una pantalla pequeña.

## Interacción del grafo

El primer encuadre muestra pocas generaciones. Se expanden ramas bajo demanda. Una vista general servirá como mapa, sin intentar mostrar de golpe todos los textos del tablero suministrado.

ELK dispondrá nodos por generaciones con adaptación a parejas, grupos de hijos, varios componentes y ancestros compartidos. Los nodos auxiliares de unión son recursos visuales; no inventan un matrimonio. Guardar posiciones manuales por vista y ofrecer «Reordenar» explícito.

Los vínculos sociales y de padrinazgo podrán ocultarse para leer la ascendencia. Crear una conexión abre un formulario para escoger tipo, evidencia y certeza antes de guardar. Ningún gesto accidental confirma un parentesco.

La ficha conserva contexto al navegar. Para empezar desde «yo», el usuario elegirá explícitamente su persona; no se inferirá de sus datos personales o del orden del CSV.

## Verificación visual

- Comprobar teclado, foco visible, contraste, zoom y lectura sin depender del color.
- Probar nombres largos, falta de fecha, fuentes contradictorias, fotos ausentes y ramas desconectadas.
- Ofrecer lista accesible alternativa al lienzo.
- Respetar movimiento reducido. Usar animación solo para explicar expansión o selección.
- Revisar escritorio y móvil con contenido real. Evitar nombres ficticios que oculten dificultades de longitud.
