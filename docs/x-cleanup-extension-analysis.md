# Análisis: limpieza de cuenta de X (borrar posts/replies/retweets, seguidos y seguidores)

Estado: **solo análisis, sin implementar.** Pendiente de decidir.

## Qué se quiere
Para la cuenta conectada en ese momento: borrar posts, replies y retweets; dejar de seguir a cuentas (following) y eliminar seguidores (followers).

## Dos vías técnicas
1. **Automatizar la interfaz de X** (content script): recorrer el perfil y pulsar ⋯ → Eliminar → Confirmar; "Deshacer repost" para retweets; recorrer `/following` y `/followers` (Dejar de seguir / Eliminar seguidor). Sencillo y sin claves, pero lento y frágil si X cambia el DOM.
2. **API interna de X** (las llamadas que hace la web, con la cookie de sesión del perfil). Mucho más rápido, pero depende de identificadores de consulta que X cambia a menudo. (Sin verificar: está descrito de memoria.)

## Dónde encaja
Una sola **WebExtension** (mismo código para Chrome y Firefox) con content script y un panel de control: borrar posts / replies / retweets, dejar de seguir, eliminar seguidores, con "ir más lento" y "parar".
- Android: empaquetada como extensión interna, igual que "X Profiles Helper" (`assets/messaging`).
- Escritorio: el navegador la carga al lanzar el perfil.

## Riesgos
- El borrado o los unfollows en masa van contra las reglas de automatización de X: límites, bloqueos temporales o suspensión.
- Borrar es irreversible: hace falta modo "contar sin borrar" y confirmación antes de cada tanda.
- X limita las acciones por hora: pausas aleatorias y tope por sesión.
- Alternativa más segura para posts propios: pedir el archivo de datos a X y usarlo para saber qué borrar, en vez de desplazarse por el perfil.

## Recomendación
Empezar con automatización de interfaz, por tandas pequeñas (≈50), con pausas largas y siempre con "contar y revisar antes de borrar". Probar primero con una cuenta de prueba. Dejar la API interna para después, solo si hace falta velocidad.

## Pregunta abierta
Prototipo de borrado de posts y replies sobre una cuenta de prueba, o decidir antes vía y alcance de funciones.
