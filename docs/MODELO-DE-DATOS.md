# Modelo propuesto y contrato de idempotencia

Estado: diseño objetivo. La primera implementación SQLite está en `apps/api/migrations/001.sql`; [IMPLEMENTACION.md](IMPLEMENTACION.md) distingue lo construido de las entidades y funciones posteriores. En esta versión las propiedades son textuales, las menciones conservan UUID asignados al primer ingreso y el acceso es de una sola familia local.

## Identidad, afirmación y evidencia

La identidad de una persona debe sobrevivir a correcciones de nombre, nuevas fechas, cambios de hipótesis y movimientos de carpetas. Cada persona recibe un UUID al crearse, independiente de su nombre. El ID de una mención importada es distinto del ID de la persona real.

| Entidad | Campos y responsabilidad |
| --- | --- |
| Family | UUID, nombre, configuración y ámbito de acceso |
| Person | UUID, familyId, nombre preferido como presentación, estado de vida desconocido/vivo/fallecido, versión, fechas de creación y archivo |
| PersonName | Persona, escritura original, alias/variante, clave normalizada para buscar y afirmación que la respalda |
| PropertyDefinition | Clave estable, etiqueta, tipo de valor, cardinalidad y visibilidad por defecto |
| Assertion | Persona, propiedad o evento, valor tipado, texto original, estado de revisión, autor, fechas y posible grupo de conflicto |
| Event / EventParticipant | Nacimiento, bautismo, matrimonio, defunción, residencia u otro; participantes con rol y fecha incierta |
| Relationship | UUID, extremos tipados, tipo, contexto/evento, vigencia y estado de revisión |
| RelationshipEvidence | Citas y afirmaciones que apoyan o contradicen una relación |
| Source / Citation | Documento, entrevista o enlace, localizador preciso, transcripción, fecha de consulta, procedencia común y acceso |
| Document / DocumentLink | Hash de contenido, MIME, tamaño, nombre original, ruta relativa y vínculos explícitos con personas/eventos/fuentes |
| ImportBatch / ImportRecord | Fuente, versión del analizador, registro original, posición, huella, clasificación y decisión de revisión |
| ExternalIdentity | Sistema externo, identificador externo y persona vinculada; no depende del nombre |
| AuditEntry / MergeOperation | Cambio, autor, versión previa y nueva, fusiones y referencias para revertir |
| ResearchTask | Pregunta pendiente, personas/fuentes relacionadas, estado y resolución |

Las relaciones de evidencia y los vínculos documentales tendrán claves foráneas verificables. La implementación evitará referencias genéricas sin integridad a un `entityId` cualquiera.

Campos comunes consultables e indexados tendrán tipos definidos. Las nuevas propiedades se agregarán mediante definiciones y valores validados. Un JSON podrá almacenar estructuras auxiliares, pero no reemplazará las relaciones ni las restricciones de identidad.

## Fechas y certeza

Una fecha admite `originalText`, precisión (día, mes, año o desconocida), calificador (exacta, aproximada, antes, después, intervalo), límites conocidos y estado de revisión. Un día/mes sin año se almacena sin año; no se convierte en una fecha completa inventada.

Estados de trabajo: `pending`, `supported`, `disputed`, `rejected`. Una marca original «NACIMIENTO CONFIRMADO» se conserva en `sourceReportedStatus`; la revisión del sistema comienza como pendiente. Confirmar una relación no confirma automáticamente todos los datos de sus participantes.

Varias afirmaciones pueden describir el mismo nacimiento con fechas distintas. Se conserva cada una y su cita. Elegir una como preferida para mostrar no elimina las otras. Las edades relativas sin fecha de observación se almacenan textualmente.

## Relaciones y recorridos

Tipos iniciales:

- Progenitor → hijo: naturaleza biológica, adoptiva, tutela u otra explícita. Rol padre/madre/progenitor cuando esté documentado; no deducir sexo ni rol por el nombre.
- Pareja: simétrica, con episodios y fechas opcionales. Coparentalidad no implica por sí misma una pareja o matrimonio.
- Padrino/madrina → ahijado: asociada a evento cuando se conozca; nunca convertida automáticamente a ascendencia biológica.
- Cercanía: amistad, cuidado, convivencia u otro vínculo social explícito.

Hermanos, abuelos y primos se calculan desde parentescos aceptados, evitando mantener copias contradictorias. Las consultas de cercanía social admiten ciclos; los ciclos en ascendencia parental se rechazan con una explicación. Ancestros compartidos y matrimonios entre parientes no se rechazan por tener múltiples caminos válidos.

La API devolverá ruta, tipos de relación y evidencia. Un camino social no se etiquetará como parentesco de sangre. Las hipótesis podrán verse al activar un filtro y permanecerán señaladas a lo largo del camino.

El grafo de dominio no depende de React Flow. Posiciones, zoom y nodos de unión auxiliares pertenecen a vistas guardadas. Dos representaciones visuales de un ancestro compartido remiten al mismo UUID.

## Importación idempotente

1. **Preservar:** guardar bytes originales y SHA-256; conservar nombre original, posición del registro y texto íntegro.
2. **Identificar lote:** clave única de familia, hash del archivo y perfil de importación. La versión del analizador se registra por separado; no crea nuevas personas por sí sola.
3. **Identificar menciones:** UUID determinista a partir del ID estable del lote y ordinal del registro. El ordinal se usa solamente dentro del archivo inmutable, nunca como identidad global de persona.
4. **Clasificar:** persona candidata, nota, leyenda, marcador, vacío o revisión. La primera fila es contenido; conservar las nueve columnas sin adivinar cabeceras inexistentes.
5. **Proponer:** extraer afirmaciones y relaciones únicamente donde el texto las indique, con localizador de cita. Dejar propuestas en revisión. No inferir aristas por vecindad entre registros ni por píxeles ilegibles.
6. **Resolver identidad:** relacionar mención con UUID persistente. Nombre parecido sugiere candidatos, no autoriza fusionar. Marcadores como «hijo» o «____» nunca colapsan globalmente a una persona.
7. **Aplicar:** transacción con restricciones únicas y mapa persistente `ImportRecord → Person/Assertion/Relationship`. Repetir el lote utiliza las decisiones anteriores, sin duplicar entidades ni descartar ediciones manuales.
8. **Revisar cambios:** si se modifica o reordena el CSV, su hash cambia. Sin IDs de origen fiables no se promete deduplicación automática entre versiones: generar una comparación y pedir resolución en la bandeja. Al reanalizar un mismo archivo con un extractor nuevo, conservar los mapas y presentar diferencias.

Clave lógica de relación: familia, tipo, extremos normalizados y contexto/episodio. Canonicalizar el orden solo en relaciones simétricas. El estado de revisión no forma parte de la identidad. Distintos documentos que apoyan la misma relación agregan evidencia a la relación existente.

Los originales de texto y CSV que representen el mismo tablero tendrán vínculo de procedencia para no contabilizarse como corroboraciones independientes. Las afirmaciones derivadas siempre indican qué versión y fragmento se usaron.

## Idempotencia de la API y concurrencia

- Creaciones, cargas y aplicación de lotes aceptan `Idempotency-Key`, acotada a usuario/familia y operación.
- Almacenar clave, hash del cuerpo, resultado y estado en la misma transacción que la mutación. Repetir clave y cuerpo devuelve el resultado original; reutilizarla con otro cuerpo responde `409`.
- Restricciones únicas son la garantía final frente a solicitudes concurrentes; no basta con consultar y después insertar.
- Actualizaciones usan versión esperada o `If-Match`. Ediciones simultáneas generan conflicto revisable, no sobrescritura silenciosa.
- Una falla en importación revierte el lote. Una carga documental usa estado temporal y publicación final verificable; no deja enlaces a archivos incompletos.
- Los hashes deduplican bytes, no personas ni veracidad. Fotografías diferentes de la misma acta pueden requerir vinculación manual de fuente común.

## API inicial propuesta

```text
GET    /health
GET    /v1/people?query=...&cursor=...
POST   /v1/people
GET    /v1/people/:id
PATCH  /v1/people/:id
GET    /v1/people/:id/graph?depth=2&types=parent&includePending=false
POST   /v1/relationships
POST   /v1/assertions
POST   /v1/imports/preview
GET    /v1/imports/:id/review
POST   /v1/imports/:id/apply
POST   /v1/documents                 fase 3
GET    /v1/documents/:id/content      fase 3
POST   /v1/people/merge              fase 4
GET    /v1/relationship-path?from=...&to=...
```

Todas las consultas se restringen a la familia autorizada. Fijar límites de tamaño, profundidad, tiempo y paginación. Antes de compartir acceso, proteger también las descargas y miniaturas, no solo las pantallas.

## Archivo y portabilidad

- Conservar originales inmutables; generar miniaturas/OCR en otra ruta.
- Validar tamaño y tipo real de archivo. Resolver rutas dentro de la raíz documental y rechazar traversal.
- No servir toda la carpeta de datos como directorio web público.
- Exportación JSON versionada con IDs, afirmaciones, relaciones, evidencia y manifiesto de archivos. CSV será una vista parcial.
- GEDCOM se evaluará como formato de intercambio posterior, declarando qué notas, vínculos sociales y estados no admite el mapeo elegido.
- Migrar a PostgreSQL exige migraciones, transformación de tipos y comparación de conteos, IDs y referencias. No se promete que cambiar una URL migre la base.
- Futuros vectores incluyen persona/documento, modelo, versión y hash del texto. Se regeneran; nunca son la identidad ni la autoridad de parentesco.

## Pruebas de aceptación críticas

1. Importar dos veces el mismo archivo no aumenta personas, relaciones ni afirmaciones, incluidos reintentos concurrentes.
2. Dos homónimos permanecen separados hasta una decisión expresa.
3. Dos fechas incompatibles se conservan como afirmaciones separadas con sus fuentes.
4. Rechazar relaciones a personas inexistentes y ciclos ancestrales; permitir ciclos sociales y ancestros compartidos.
5. Editar un nombre mantiene UUID, documentos y enlaces existentes.
6. Una excepción durante el lote no deja medio grafo importado.
7. Reordenar/corregir el archivo genera revisión de diferencias y no duplicación silenciosa.
8. Cambiar la raíz documental mantiene todos los documentos accesibles mediante sus claves relativas.
9. Restaurar respaldo recupera base y archivos con hashes correctos.
