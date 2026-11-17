# Etapa 0: preparación y diagnóstico

Estado: **completada y verificada**.

Alcance autorizado: iniciar la etapa 0. Se aprovecharon los archivos y documentos ya preparados y se verificó su estado, sin duplicar la instalación ni el archivo de fuentes.

## Entregables

| Entregable | Estado y evidencia |
| --- | --- |
| Fuentes originales | Cinco archivos preservados en `data/originals/`; SHA-256 de las cinco copias coincide con el manifiesto |
| Inventario | `data/audit/source-manifest.json`, con nombre, tamaño, huella y ruta de cada archivo |
| Diagnóstico CSV | `data/audit/csv-audit.json`, con estructura, campos poblados, registros vacíos y etiquetas repetidas |
| Procedimiento reproducible | `scripts/audit_sources.py`; repetición sin nuevos archivos ni cambios comprobada durante la preparación inicial |
| Arquitectura y entregas | [PLAN.md](PLAN.md) |
| Identidades, relaciones y evidencia | [MODELO-DE-DATOS.md](MODELO-DE-DATOS.md) |
| Estética y código de colores | [DISENO.md](DISENO.md) |
| Skills locales | Cinco archivos `SKILL.md` presentes; fuentes y huellas registradas en `skills-lock.json` |
| Exclusiones de versionado | `.gitignore` preparado para datos familiares, secretos y archivos generados |

La verificación de cierre volvió a calcular las cinco huellas del archivo documental y comprobó la presencia de las cinco skills. No se reinstalaron paquetes.

## Conclusiones que guiarán la implementación

- El CSV contiene registros de distintas clases; todavía no existe un conteo validado de personas únicas.
- Los conectores del tablero no están representados como relaciones estructuradas en el CSV. Se extraerán propuestas de vínculos explícitos en las transcripciones y se revisarán los casos ambiguos.
- Las fechas incompatibles y los nombres repetidos se conservarán como asuntos de investigación. No se fusionaron identidades ni se corrigieron las fuentes.
- La identidad estable, el historial y la procedencia se implementarán antes de la importación definitiva.
- La estética de libro y las consultas de grafo podrán evolucionar sin cambiar los identificadores de personas ni las rutas lógicas de sus documentos.

## Decisiones propuestas para la siguiente etapa

| Decisión | Propuesta | Estado |
| --- | --- | --- |
| Arquitectura | React/TypeScript y API Fastify separada | Pendiente de aprobación |
| Datos iniciales | SQLite local y documentos en carpeta configurable | Pendiente de aprobación |
| Importación | Previsualización, revisión e incorporación transaccional idempotente | Pendiente de aprobación |
| Estética | Libro ilustrado con papel, tinta y ramas originales | Pendiente de aprobación |
| Alcance siguiente | Base funcional, importador y ficha mínima de revisión | Pendiente de aprobación |

El nombre definitivo del proyecto, la persona de referencia del usuario y el modelo de NAS pueden definirse más adelante. No son necesarios para iniciar la base funcional.

## Límite del resultado actual

Esta etapa entrega preparación y especificaciones. Todavía no hay servidor, interfaz ejecutable ni grafo consolidado. La idempotencia comprobada corresponde al archivado de los originales; la idempotencia de personas y relaciones requiere la implementación y las pruebas de la etapa 1.

Siguiente hito: aprobación del alcance de la etapa 1 descrito en [PLAN.md](PLAN.md).
