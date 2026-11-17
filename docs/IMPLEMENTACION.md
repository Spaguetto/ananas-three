# Versión funcional local

## Evidencias con archivos

Los vínculos entre personas admiten texto y adjuntos al crearlos y al añadir nuevas pruebas. La migración `004.sql` vincula las citas con sus archivos originales; la exportación pasa a versión 4. La suite tiene 28 pruebas y la carga se verificó en un entorno aislado. Véanse [uso, almacenamiento y límites](EVIDENCIAS.md).

## Vista completa y conexiones recuperadas

La vista inicial **Toda la familia** incluye las 289 fichas, incluso las aisladas, y organiza cada rama conectada por separado. La búsqueda acerca una persona; el minimapa y **Ver todo el mapa** permiten volver a recorrer el conjunto. **Cerca de una persona** mantiene el alcance de 1–5 saltos y el límite de 100 nodos.

Se recuperaron 49 propuestas adicionales de parentesco a partir de referencias escritas en el CSV original, con fuente y registro, para un total local de 73 vínculos. Las 222 fichas que aún no tienen vínculos aparecen en el mapa. No se reconstruyeron líneas que el CSV no conserva. Investigación → Importaciones permite inspeccionar las propuestas y 15 notas de referencias ambiguas. La operación es idempotente y conserva revisiones posteriores. Se verificó la preservación de personas, campos, afirmaciones, fuentes y relaciones previas; hay una copia de SQLite anterior al cambio en `data/backups/`. La suite actual tiene 20 pruebas.

## Red de personas y contexto

La revisión más reciente incorpora nodos de unión, acontecimiento, lugar y grupo; varios matrimonios pueden compartir una persona sin duplicarla. La interfaz presenta círculos conectados, una vista radial y una disposición jerárquica. Cada nodo tiene ficha, evidencia y conexiones revisables. La exportación actual es versión 3 y la migración de esquema actual es `003.sql`. Véanse el [modelo, uso, pruebas y límites del grafo ampliado](GRAFO-CONTEXTO.md).

## Revisión de fichas y diseño

La segunda entrega incorpora el resto de candidatos identificables: **289 fichas** en el archivo local (26 existentes y 263 nuevas), **114 menciones por identificar**, 9 notas y 27 vacíos. Las 24 propuestas de relaciones se conservan sin fabricar conexiones a partir del orden del CSV. El directorio permite consultar fichas desconectadas y el inventario distingue el total de personas del vecindario visible en el grafo.

El importador v3 separa meses y lugares de los nombres, respeta límites de palabras con acentos y deja roles sin nombre, alternativas y posibles duplicados en revisión. Al actualizar clasificaciones solo toca registros aún no vinculados; no cambia IDs, nombres editados ni fuentes originales. Se guardó una copia consistente de SQLite antes de incorporar el lote completo en `data/backups/`.

`personFields`, creada por la migración `002.sql`, almacena campos ligados al UUID de cada persona. Cada campo tiene su propio UUID, nombre y sección libres, tipo, valor JSON validado, opciones propias, notas, procedencia opcional, fecha de observación y marca sensible. Admite texto, nota extensa, número, booleano con desconocido explícito, fecha de calendario, selección, lista y JSON estructurado. Los campos se editan con versión esperada, se archivan y se restauran; los cambios quedan en `audit`. El JSON de exportación pasa a versión 2 e incluye campos archivados y su historial. Las transcripciones previas siguen en `assertions` sin convertir ni perder datos.

La marca sensible pliega el contenido en la ficha. **No es cifrado, permiso de acceso ni exclusión de exportación.** La interfaz lo indica junto a la opción. El atajo Salud no aporta diagnósticos ni guarda valores automáticamente; sus opciones se pueden cambiar. Sigue siendo una aplicación local sin usuarios.

La interfaz ahora presenta hojas rasgadas sobre tela, pequeñas fichas con cinta y un expediente ampliable. Se retiró el lateral verde de la primera versión. `desk.css` importa los estilos funcionales existentes en una capa CSS de menor prioridad y define la nueva apariencia. La textura SVG y los bordes son originales, sin reutilizar la fotografía de referencia.

Pruebas: 13 casos automatizados de dominio y API; compilación de producción; revisión visual de escritorio y a 390 px. En el navegador se guardó un campo de fecha de nacimiento para Luis Alberto (registro 37, pendiente de cotejo), se archivó y se restauró manteniendo la identidad. Las pruebas de salud usan datos sintéticos exclusivamente en bases temporales.

## Base de la primera entrega

La instrucción del usuario aprobó SQLite, la estética propuesta y el comienzo de la implementación, con una interfaz utilizable. Se implementó la base de la etapa 1 y la primera experiencia visual de la etapa 2.

## Qué se puede probar

- Web en `http://127.0.0.1:5173` y API independiente en `http://127.0.0.1:3001/api`.
- Árbol interactivo con zoom, desplazamiento, selección de personas, cambio de referencia y filtros de alcance y certeza.
- Directorio con búsqueda sin distinción de mayúsculas o acentos y paginación.
- Creación y edición de personas con identidad permanente, notas y estado de vida.
- Nuevas propiedades tipadas con secciones propias; afirmaciones documentales con procedencia que conservan versiones de un dato.
- Creación de vínculos parentales, de pareja, padrinazgo y cercanía.
- Revisión de propuestas de relaciones y de fechas en conflicto.
- Consulta de las cinco fuentes originales, imágenes y transcripciones.
- Vista previa de CSV, incorporación de candidatos, identificación individual y vinculación a personas existentes.
- Exportación JSON de las entidades, evidencia, importaciones e historial. No incluye los bytes de documentos ni es todavía un respaldo restaurable desde la interfaz.

## Datos del primer arranque (histórico)

El primer arranque prepara 25 fichas y 24 propuestas de relaciones leídas de transcripciones explícitas del CSV original. El conjunto se acota al hash de ese archivo. Todas las identificaciones quedan pendientes de revisión. El resto de los 439 registros permanece en Investigación, con su texto íntegro.

La prueba manual de la primera entrega incorporó además la ficha del registro 37, Luis Alberto Cuervo Rodriguez, y su fecha de nacimiento transcrita como afirmación pendiente. La primera entrega tenía 26 personas; la revisión actual amplió el archivo a 289 fichas. No se agregaron personas ficticias a la base familiar para las pruebas.

La correspondencia entre nombres de una transcripción y fichas es una propuesta de investigación. No se afirma que esas identidades estén verificadas. El material visual de Miro no se convirtió automáticamente en aristas.

## SQLite y grafos

`people` guarda nodos con UUID; `relationships` guarda aristas con extremos, tipo, estado y contexto. Los índices cubren ambos extremos. Un recorrido del grafo devuelve el vecindario de una persona, limitado a 100 nodos y cinco pasos. Las consultas recursivas SQL detectan ciclos de ascendencia. Los ciclos sociales y ancestros compartidos son válidos.

React Flow y ELK representan el grafo independientemente de cómo se almacene. Cambiar la persistencia a PostgreSQL o incorporar una base especializada no exige cambiar los UUID ni las relaciones conceptuales.

La implementación inicial usa el controlador incorporado `node:sqlite` y SQL preparado, concentrados en `apps/api/src/store.ts`. Es un ajuste respecto a la propuesta de Drizzle: evita una dependencia nativa adicional en Windows y hace explícitas las transacciones. Drizzle no está instalado. En Node 22 este controlador muestra una advertencia experimental; Node 22.17 fue el runtime probado.

La migración inicial está en `apps/api/migrations/001.sql` y registra la versión del esquema. Una migración futura debe ser explícita, probada y preservar IDs y referencias; cambiar una variable no convierte SQLite a PostgreSQL.

## Integridad implementada

- Claves foráneas, restricciones únicas y transacciones `BEGIN IMMEDIATE`.
- `Idempotency-Key` por operación: replay de respuesta y rechazo si cambia el cuerpo.
- Hash del archivo para reutilizar lotes y mapa persistente entre registro y persona. Los UUID de las menciones se asignan una vez y se conservan; no se recalculan a partir de nombres.
- Una segunda versión del CSV requiere reconciliación registro a registro cuando existe un lote aplicado. No se hace deduplicación automática entre archivos modificados.
- Homónimos y marcadores se mantienen en revisión. La clasificación automática es orientativa.
- Versiones esperadas en ediciones y revisiones para detectar cambios concurrentes.
- Nuevas citas de una relación se agregan a su evidencia, sin duplicar la relación ni cambiar silenciosamente su certeza.
- Historial de cambios con actor local. No es una firma de identidad autenticada.
- Fuentes conservadas como bytes originales, incluidas marcas BOM de CSV UTF-8. El cargador admite hasta 1 MB desde la web.
- API ligada a loopback, validación de origen y Host, consultas preparadas y descargas limitadas a rutas de la raíz documental.

## Archivo local

```text
data/database/family.sqlite        datos editables
data/originals/                    fuentes inalteradas
data/audit/source-manifest.json    inventario inicial
```

`DOCUMENT_ROOT` cambia la raíz documental. `DATABASE_PATH` cambia la ubicación de la base. Se leen del entorno del proceso; `.env.example` sirve de referencia y no se carga automáticamente. Para mover documentos se debe trasladar todo el contenido y mantener sus rutas relativas.

SQLite debe permanecer en almacenamiento local al proceso API, no como archivo compartido SMB/NFS abierto desde varios equipos. La futura NAS puede alojar documentos o ejecutar el servicio con su propio almacenamiento local. Autenticación, permisos y despliegue compartido siguen pendientes.

## Verificación

La suite `npm test` usa SQLite temporal o en memoria y cubre identidad, homónimos, búsqueda, ediciones concurrentes, relaciones, ciclos, evidencia múltiple, idempotencia, rollback, versiones de importación, preservación de bytes, reinicio y controles de origen. No modifica la base familiar.

La revisión manual del navegador comprobó búsqueda de Isidora, navegación de esa rama, vínculos de padrinazgo, incorporación del registro 37, guardado de una propiedad con procedencia y carga de las cinco fuentes. Se inspeccionaron el diseño de escritorio y móvil y el ancho del documento.

Las dependencias se actualizaron tras los avisos iniciales y la instalación reportó cero vulnerabilidades conocidas en ese momento. ELK se carga bajo demanda; su paquete sigue siendo grande y el build avisa del tamaño.

## Límites de esta entrega

- Una familia y un editor local; sin usuarios ni acceso remoto.
- Los campos propios ya son tipados. Las afirmaciones importadas conservan el texto, estado y evidencia originales. Hay nodos de acontecimientos con fechas de texto; siguen pendientes tipos especializados para fechas inciertas y orden cronológico normalizado.
- No hay todavía línea de tiempo, fusión/deshacer, borrado, OCR, subida general de fotos/PDF ni integración con FamilySearch.
- La red ya representa uniones compartidas. La disposición por generaciones sigue siendo aproximada para redes con contexto y ciclos sociales; no hay vistas guardadas ni un layout genealógico especializado para todos los casos de pedigrí.
- La aplicación lee todos los vínculos para construir el subgrafo local; será necesario optimizar consultas para volúmenes mucho mayores.
- La revisión visual por navegador fue manual; no se agregó una suite automática de pruebas de interfaz.

Estos límites no impiden crear y consultar personas y relaciones, revisar el CSV y conservar nuevos datos localmente. No se marca como terminado el alcance completo de las etapas 2 a 6.
