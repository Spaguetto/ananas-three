# Láminas familiares

Desde Árbol familiar, selecciona una persona y pulsa **Crear lámina**. La selección inicial es su componente conectado completo, sin el límite de saltos del visor. Puedes escoger otra persona de partida, usar la vista actual o marcar nombres individualmente. El límite de esta versión es 80 personas por lámina; no se recorta silenciosamente una selección mayor.

El editor genera una composición por generaciones sobre papel, con iniciales o retratos ovalados, nombres, fechas y conexiones. Conserva una sola identidad por persona y un nodo por unión. Una línea directa de filiación solo se omite del dibujo cuando ya está representada mediante esa misma unión y las certezas de las tres conexiones/nodos coinciden; no se modifican los datos del grafo.

## Fechas y retratos

- Se sugieren únicamente campos y afirmaciones que identifican explícitamente nacimiento o defunción. No se infiere la fecha de nacimiento a partir de cualquier número del registro original.
- Las fechas pendientes conservan `?`. Cuando existen versiones contradictorias se muestra `por revisar`, sin elegir una silenciosamente.
- Los campos sensibles y las propiedades ajenas a nacimiento/defunción no se incorporan automáticamente al editor. El texto del registro original puede consultarse como ayuda y no se dibuja en la lámina.
- Puedes escribir las fechas que aparecerán y elegir un retrato JPG, PNG o WebP desde el equipo. La imagen se reduce en el navegador antes de componerla.
- Los retratos y los ajustes de texto son temporales para esta lámina: no se guardan como datos personales ni como borrador editable. Al cerrar el editor se descartan. La persistencia de retratos en fichas y de borradores de composición sigue pendiente.

## Exportación

**Descargar PNG** genera el archivo en el navegador, guarda una copia inmutable en `data/exports/<sha256>.png` y ofrece su descarga y el enlace **Abrir PNG**. No se envía a servicios externos. El documento exportado sí conserva los retratos y textos incluidos, aunque luego se cierre el borrador.

La resolución se adapta al grupo: hasta 8192 píxeles por lado y 24 megapíxeles en total. La lámina puede consultarse encajada o al 50/100 % para comprobar nombres. No contiene datos de salud, notas generales ni identificadores internos. Los vínculos pendientes y en conflicto mantienen diferencias de trazo/color y una leyenda. Los anillos representan uniones; la asociación de descendencia no acredita filiación por sí sola.

La API separa la lectura de los datos de impresión (`POST /api/plates/people`) del guardado idempotente (`POST /api/plates/export`) y la consulta/descarga del PNG (`GET /api/plates/files/:hash`). El backend comprueba formato, tamaño, dimensiones y rutas; los archivos se identifican por contenido y la exportación queda en auditoría. Repetir una solicitud con la misma clave no duplica la operación. Un fallo de base de datos después de escribir el archivo puede dejar un PNG huérfano por hash, pero no modifica ni corrompe las fichas.

La galería del archivo oculta temporalmente la referencia decorativa **El árbol como libro ilustrado**, identificada por su hash. El original permanece en disco. El árbol Miro, la leyenda y los recortes que respaldan relaciones siguen disponibles.

## Verificación

La suite actual contiene 24 pruebas. Las nuevas cubren datos permitidos en la lámina, fechas contradictorias, una identidad con varias uniones, subconjuntos de personas, diferencias de certeza y guardado/descarga idempotente del PNG. Se revisa también el resultado visual y el flujo de retrato en el navegador. El dibujo es una composición determinista de los datos; no se usa generación de imágenes que pueda alterar nombres o relaciones.
