# Entre ramas — archivo familiar

Estado: **versión local con 289 fichas, grafo de personas, uniones y contexto, campos dinámicos y diseño de papel rasgado**. Incluye la base de la etapa 1 y parte de la etapa 2.

Aplicación web local para conservar personas, parentescos, historias y evidencias familiares, con frontend y backend independientes. Nombre provisional.

## Abrir la aplicación

Requiere Node.js 22.13 o posterior. Probada con Node 22.17 en Windows.

```powershell
cd C:\Users\User\Desktop\Tree
npm.cmd run dev
```

Deja la terminal abierta mientras uses la aplicación. Para detenerla, pulsa **Ctrl+C**. Solo si faltan dependencias (por ejemplo, al instalar el proyecto en otro equipo), ejecuta antes `npm.cmd install` desde la carpeta del proyecto.

Abre [Entre ramas](http://127.0.0.1:5173). La API corre por separado en [puerto 3001](http://127.0.0.1:3001/api/health). Los dos procesos se inician con el comando anterior. Los puertos deben estar libres.

Los cambios se conservan en `data/database/family.sqlite`. Los archivos originales permanecen en `data/originals/`. Reiniciar no vuelve a crear el conjunto inicial ni borra las ediciones.

Para probar: busca una persona y pulsa **Añadir campo personalizado**. Elige su nombre, sección y tipo: texto, nota extensa, número, sí/no/no se sabe, fecha, opciones propias, lista o JSON. Puedes editar, archivar y restaurar campos. El atajo **Salud** prepara un campo vacío con opciones editables. **Ampliar expediente** abre una ficha más grande.

En **Fuentes** se mantienen las transcripciones originales. En **Vínculos** puedes crear parentescos y consultar uniones, lugares y grupos. **Personas** incluye todas las fichas, también las que todavía no están conectadas en el árbol.

En la evidencia de un vínculo puedes escribir notas y adjuntar imágenes, PDF u otros documentos. También puedes ampliar un vínculo existente desde **Leer evidencia → Añadir otra prueba**. Los archivos se conservan localmente y aparecen en Archivo documental. Véanse [uso, almacenamiento y límites de las evidencias](docs/EVIDENCIAS.md).

Para registrar varios matrimonios: selecciona a la persona, pulsa **Crear nodo → Unión**, completa fechas y estado y elige la otra persona. Repite para la siguiente unión: ambas compartirán el mismo ID de persona. Cada unión tiene evidencia y conexiones propias. Desde su ficha puedes asociar hijos; la filiación con cada progenitor se registra de forma explícita y separada.

Para crear una imagen de una rama: pulsa **Crear lámina** en el árbol. Elige personas, ajusta el título y las fechas, y añade retratos para la composición. **Descargar PNG** guarda una copia en `data/exports/` y permite descargarla o abrirla. Los ajustes del editor son temporales y no cambian las fichas. Véanse [uso y límites de las láminas familiares](docs/LAMINAS.md).

También puedes crear **Lugares**, **Acontecimientos** y **Grupos / clanes**. Usa **Vínculos → Conectar con un nodo existente** para reutilizar un lugar o grupo sin duplicarlo. **Nodos compartidos** permite encontrar los nodos aunque estén desconectados o descartados. Cada conexión se revisa desde la ficha del nodo.

El árbol abre en **Toda la familia**, con las 289 fichas: ramas conectadas y un grupo para las personas sin vínculos visibles. Usa el minimapa, el zoom o la búsqueda para acercarte; **Ver todo el mapa** recupera la vista general. **Cerca de una persona** conserva el recorrido de 1–5 saltos, limitado a 100 nodos. Ambas vistas admiten red circular y disposición por generaciones.

El archivo local contiene 289 fichas de los 439 registros originales. Las 114 menciones ambiguas siguen visibles en **Investigación → Importaciones**; los otros registros son 9 notas y 27 vacíos. Se incorporaron 49 propuestas de vínculos a partir de las transcripciones, además de los 24 iniciales: **73 vínculos registrados**, con fuente y revisión pendiente. Quedan **222 fichas sin vínculos visibles**. Los números de registros no equivalen a personas únicas verificadas.

El CSV no conserva los extremos de las líneas de Miro. En **Investigación → Importaciones → Los vínculos escritos en las fuentes** puedes consultar las 49 propuestas y 15 notas sobre referencias aún ambiguas. Reaplicar la recuperación conserva identidades, citas y revisiones sin duplicar vínculos. Para recuperar las demás conexiones sirven un PDF legible al ampliar, capturas por secciones con nombres y líneas completas, o una tabla `persona | parentesco | otra persona`.

**Actualización con el primer recorte:** se reutilizaron 22 de esas fichas y se agregaron 8 uniones, 24 filiaciones propuestas y 28 conexiones de participación/descendencia. El estado local pasa a 97 vínculos entre personas, 28 conexiones compartidas y 200 fichas aún aisladas. La imagen está disponible en Archivo documental y en Fuentes de las personas identificadas. La línea roja hacia Alberto sigue por confirmar. Véase [cómo se guarda el grafo y cómo se incorporan los recortes](docs/COMO-SE-GUARDA-EL-GRAFO.md).

```powershell
npm.cmd test
npm.cmd run build
```

El build genera la web en `dist/web/`; para probarla con la API usa `npm run dev`. Esta versión no incluye aún un servicio de producción que sirva ambos procesos.

- [Funciones implementadas, pruebas y límites](docs/IMPLEMENTACION.md)

- [Plan de entregas y aprobación](docs/PLAN.md)
- [Resultado y cierre de la etapa 0](docs/ETAPA-0.md)
- [Modelo de datos e importación idempotente](docs/MODELO-DE-DATOS.md)
- [Dirección visual y experiencia](docs/DISENO.md)
- [Revisión visual: papeles rasgados y campos propios](docs/DISENO-REVISION.md)
- [Grafo de personas, uniones y contexto](docs/GRAFO-CONTEXTO.md)
- [Skills instaladas](docs/SKILLS.md)

## Lo preparado

- Copias exactas de los cinco archivos suministrados en `data/originals/`, identificadas mediante SHA-256.
- Inventario privado en `data/audit/source-manifest.json` y diagnóstico reproducible en `data/audit/csv-audit.json`.
- Cinco skills locales y `skills-lock.json` con sus fuentes y huellas.
- Exclusión de datos familiares y secretos mediante `.gitignore`.

La aplicación funciona localmente; no se ha desplegado ni publicado. El contenido de los archivos se trata como material de investigación, no como instrucciones de ejecución. La raíz documental es configurable para preparar la futura migración a NAS, descrita en la guía de implementación.

## Reproducir el diagnóstico

Con Python 3 y su biblioteca estándar:

```powershell
python -X utf8 scripts/audit_sources.py --csv "RUTA_AL_CSV" --notes "RUTA_AL_TEXTO" --images "RUTA_IMAGEN_1" "RUTA_IMAGEN_2" "RUTA_IMAGEN_3"
```

El diagnóstico conserva cada archivo sin modificar sus bytes. Repetir la misma entrada reutiliza su carpeta por hash. La aplicación también conserva el mapa entre registro y persona: aplicar otra vez el mismo lote no duplica sus fichas. Una versión modificada del CSV requiere reconciliación explícita.
