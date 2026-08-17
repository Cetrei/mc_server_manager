# Estándar de comentarios y clean code (obligatorio, todo el repo)

El código debe ser legible por sí mismo: nombres claros, funciones chicas, estructura que refleje la lógica. Los comentarios son la excepción, no el hábito por defecto.

* Un comentario existe para aclarar algo **no obvio de la lógica en el punto donde está** (un caso límite raro, una unidad no evidente, un porqué de un algoritmo que no se lee del código mismo). Nunca para narrar qué hace el código cuando el código ya lo dice, ni para listar la estructura de un archivo, ni como resumen a modo de docstring de "qué es este archivo y por qué existe".
* Las decisiones de diseño, alternativas descartadas, justificaciones de arquitectura y contexto de por qué se hizo algo van en `docs/specs/` o en el issue de GitHub correspondiente — nunca como comentario de cabecera en el código, ni como un `README.md` suelto dentro de la carpeta de implementación. Si hace falta justificar una decisión, el lugar es el spec o el issue. Ver `docs/standards/docs-location.md` para el detalle de esta regla aplicada a documentación en general.
* Antes de agregar un comentario, preguntar: ¿esto lo puedo resolver con un mejor nombre de función/variable en vez de explicarlo? Si sí, no hace falta el comentario.
* Un agente o dev que abre un archivo para revisión no debería encontrar comentarios que sobre-expliquen decisiones ya evidentes por el nombre de la función/archivo, ni bloques de comentario que dupliquen lo que ya dice `tests/README.md`, un spec, o el propio issue.
