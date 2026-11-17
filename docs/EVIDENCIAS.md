# Texto y archivos como evidencia de un vínculo

En **Vincular a una persona**, la sección Evidencia admite una nota, uno o varios archivos, o ambos. Puedes elegir archivos, arrastrarlos al campo o pegar una imagen desde el portapapeles. Los archivos pendientes muestran su nombre, tamaño y una miniatura cuando son imágenes. Se pueden quitar antes de guardar. Los límites son 10 archivos por entrega, 10 MB por archivo y 25 MB en total.

Para ampliar un vínculo existente, abre **Leer evidencia** y utiliza **Añadir otra prueba**. La carga agrega fuentes sin reemplazar las notas anteriores ni cambiar el estado o la versión de revisión de la relación. Las imágenes se pueden ampliar y todos los adjuntos se pueden descargar. Los originales aparecen también en Archivo documental.

## Almacenamiento y respaldo

- SQLite conserva las notas en `relationshipEvidence` y la migración `004.sql` agrega `relationshipEvidenceFiles`, que asocia una nota con uno o más registros de `sources` y conserva el nombre presentado para cada adjunto.
- Los nuevos archivos se guardan sin transformar en `data/originals/<sha256>/original`, o en la raíz configurada mediante `DOCUMENT_ROOT`. El nombre del archivo nunca determina una ruta del sistema.
- Un contenido idéntico reutiliza su fuente y su copia física. La misma prueba puede citarse desde diferentes notas o relaciones.
- Las solicitudes son idempotentes. Las referencias SQLite se guardan en una transacción; los archivos físicos no forman parte de esa transacción y un fallo de disco o de confirmación puede dejar una copia por hash sin referencia, reutilizable al reintentar.
- El JSON exportado tiene versión 4 e incluye `evidenceFiles`. Para un respaldo completo, conserva también la base SQLite y toda la carpeta documental: el JSON no contiene los bytes de los archivos.
- Se guardó una copia consistente de la base antes de aplicar la migración.

## API

`POST /api/relationships` admite `evidence` y `files: [{name, base64}]`. `POST /api/relationships/:id/evidence` agrega notas y archivos al vínculo existente. Ambas rutas requieren `Idempotency-Key` y aceptan una nota de al menos tres caracteres o al menos un archivo.

`GET /api/relationships/:id/evidence` devuelve las notas con su colección `files`. `GET /api/sources/:id/content` permite consultar el original; `?download=1` solicita una descarga. El servidor identifica los formatos de imagen y PDF por su firma y sirve otros formatos como descarga. No convierte los archivos ni extrae automáticamente su contenido.

La aplicación continúa siendo local, sin cuentas ni permisos por persona. Esta entrega cubre vínculos directos entre personas; los formularios de nodos compartidos y afirmaciones conservan sus campos de evidencia textual.

## Verificación

Se verifican persistencia y reapertura, conservación exacta de bytes, deduplicación, reintentos, notas sin archivos, archivos sin notas, conservación de estados revisados, límites de tamaño, rechazo de codificaciones inválidas, prevención de ciclos y descargas de formatos no previsualizables. La prueba visual de carga usa un servidor y datos sintéticos separados del archivo familiar.
