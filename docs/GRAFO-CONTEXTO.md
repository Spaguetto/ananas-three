# Personas, uniones y contexto

La referencia manuscrita plantea una red: una persona tiene una identidad permanente, atributos propios y conexiones con otras personas y elementos compartidos. La implementación local conserva SQLite y separa esa estructura del dibujo.

## Modelo implementado

La migración `003.sql` crea `graphNodes`, `graphConnections` y `graphCitations`. El registro de nodos reutiliza exactamente los UUID de `people`, con claves foráneas y sincronización de nombre/estado mediante triggers. Los demás nodos tienen UUID propios: unión, acontecimiento, lugar o grupo. No se transforman automáticamente parentescos ni parejas previas en matrimonios.

| Conexión | Origen | Destino |
|---|---|---|
| Participa como pareja | Persona | Unión |
| Descendencia asociada | Persona | Unión |
| Participación | Persona | Acontecimiento |
| Origen, residencia, descanso | Persona | Lugar |
| Pertenencia | Persona | Grupo / clan |
| Ocurrió en | Unión o acontecimiento | Lugar |

Los vínculos de filiación, pareja, padrinazgo y cercanía siguen en `relationships`; el servicio de red recorre ambos conjuntos de aristas. Un hijo asociado a una unión no implica automáticamente filiación con todos sus participantes. Una persona no puede tener simultáneamente roles activos de pareja y descendiente en la misma unión. Se permiten varios matrimonios entre las mismas personas, cada uno con identidad y fechas propias.

Los nodos compartidos incluyen nombre, descripción, fecha, fecha final, procedencia y estado de revisión. Las uniones agregan tipo libre y estado: sin determinar, vigente, separación, divorcio, viudez o finalizada. Las fechas admiten texto aproximado; aún no tienen interpretación cronológica normalizada. Los campos tipados por persona permanecen en `personFields`, incluyendo campos privados de salud, sin introducir sus valores en el grafo.

## Integridad y API

- Crear un nodo con sus conexiones es una sola transacción. Si una conexión falla, no queda un nodo parcial.
- Todas las escrituras exigen `Idempotency-Key`. Repetir la misma solicitud devuelve la respuesta original; cambiar su cuerpo con la misma clave devuelve conflicto.
- Una conexión es única por origen, destino y tipo. Una nueva cita se incorpora sin duplicar la arista ni cambiar su estado silenciosamente.
- Las ediciones de nodos y estados de conexiones requieren la versión actual. El historial queda en `audit`.
- Descartar oculta el nodo o conexión de los recorridos normales. Se puede restaurar desde Nodos compartidos / Editar nodo o desde las conexiones descartadas de su ficha. Seleccionar un nodo descartado explícitamente permite inspeccionarlo.
- `/api/network/:id` acepta un nodo de cualquier tipo, alcance de 1–5 saltos, filtro de propuestas y de contexto. Devuelve como máximo 100 nodos, sin duplicar identidades ni recorrer indefinidamente los ciclos.
- `/api/network` devuelve todas las identidades no descartadas y sus conexiones visibles, sin el límite del vecindario. Incluye conteos de componentes y personas aisladas; los filtros de certeza y contexto se aplican a las aristas.
- `/api/entities`, `/api/entities/:id`, `/api/connections` y `/api/people/:id/contexts` cubren las nuevas operaciones. La exportación JSON versión 3 incluye nodos compartidos, conexiones, citas y auditoría además del contenido previo.

## Interfaz

Las personas son círculos con iniciales; los nodos compartidos usan icono y color según tipo. Las líneas indican tipo de conexión y certeza. La vista de red usa una distribución radial con relajación; la vista por generaciones usa ELK. Esta última es una distribución jerárquica aproximada cuando se mezclan relaciones sociales y lugares, no un cálculo de generaciones biológicas. El alcance siempre cuenta aristas, incluyendo los nodos de unión.

Desde una persona se puede crear una nueva unión, lugar, acontecimiento o grupo y conectarlo inmediatamente. Los nodos existentes se reutilizan desde Vínculos. La ficha de cada nodo muestra sus participantes, evidencia y revisión de conexiones. Nodos compartidos permite recuperar elementos aislados y descartados.

**Toda la familia** es ahora la vista inicial. Cada componente conectado se distribuye por separado y las identidades aisladas se ordenan en un grupo rotulado. El minimapa permite recorrer el conjunto; buscar una persona acerca su ficha sin excluir las demás. **Cerca de una persona** activa el recorrido por saltos. La selección de estos alcances es independiente de la disposición radial o por generaciones.

## Recuperación de relaciones escritas

El CSV conserva nombres y transcripciones, pero no los extremos de las líneas de Miro. La recuperación está acotada al hash del CSV original y a una correspondencia explícita entre registros. Se incorporaron **49 propuestas adicionales**, siempre pendientes y con la transcripción y el registro como evidencia. No se dedujeron conexiones por la proximidad de filas. Quince notas de revisión reúnen nombres incompletos, homónimos y referencias contradictorias que no se enlazaron automáticamente.

La vista previa está en `GET /api/imports/:id/relationships`; la aplicación transaccional e idempotente está en `POST /api/imports/:id/relationships/apply`. Repetirla no duplica relaciones ni citas y conserva revisiones posteriores, incluidos descartes. En la interfaz se encuentra en Investigación → Importaciones.

El archivo real conserva **289 personas y 73 vínculos**. Hay seis ramas conectadas con 67 personas en total y **222 fichas sin vínculos visibles**. Las fichas, campos personales, afirmaciones, fuentes y 24 relaciones anteriores se compararon antes y después: permanecen intactos. Se guardó una copia consistente en `data/backups/` y los resultados privados en `data/audit/relationship-recovery-result.json`.

## Verificación y límites

Los 20 casos automatizados pasan, y la compilación de producción termina correctamente (mantiene el aviso de tamaño del paquete ELK). La base real pasó `quick_check`, sin errores de claves foráneas: 289 personas y sus 289 nodos de identidad, 73 parentescos, cinco fuentes y el campo personal previo. La vista completa se verifica con las 289 identidades, filtros, búsqueda y cambio de alcance. Las pruebas nuevas cubren la recuperación repetida, conservación de revisiones y distribución de todos los componentes sin perder identidades.

En la entrega anterior se revisaron escritorio y móvil a 390 px, sin desbordamiento horizontal ni errores de consola. En el navegador se creó una segunda unión, se asoció un descendiente y se editaron el estado y la fecha final en la base ficticia.

La suite cubre dos uniones de la misma identidad, lugares compartidos, ciclos no genealógicos, ausencia de filiación implícita, validación de roles, rollback, repetición de peticiones, evidencia, versiones, descarte/restauración y límite de recorrido. Las pruebas del navegador usan una API con SQLite en memoria y personas ficticias separadas del archivo familiar. No se inventaron matrimonios ni lugares para las 289 fichas importadas.

No incluye todavía carga general de fotografías, adjuntos a uniones, línea de tiempo, mapas geográficos, OCR ni integración con FamilySearch. Se pueden escribir fechas, relatos, campos de salud y procedencia, pero no adjuntar una historia clínica como archivo en esta entrega. El acceso sigue siendo local y sin usuarios; la marca de contenido sensible solo controla su presentación. Los documentos y el despliegue NAS conservan el alcance pendiente del plan.
