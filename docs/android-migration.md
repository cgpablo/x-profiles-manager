# Migración a Android — diseño

Objetivo: que la app funcione en **Windows, macOS y Android** (tablet, horizontal, instalación directa del APK, todo en local; la sincronización entre dispositivos se resuelve con exportar/importar backup).

- Rama de trabajo: `feature/android-migration`.
- Rama del spike (se conserva, **no borrar**): `feature/android-gecko-spike`. Contiene el proyecto Android de prueba en `mobile-spike/`, con todo lo validado (ver sección 2).

## 1. Decisión de arquitectura

**Capacitor + plugin nativo Kotlin con GeckoView**, manteniendo Electron en desktop. Se descartaron:

| Opción | Motivo del descarte |
|---|---|
| Tauri 2 | Obliga a reescribir en Rust todo el proceso principal (≈3900 líneas de Node), que en desktop ya funciona. Su WebView móvil no da aislamiento por perfil ni extensiones. |
| React Native / Kotlin nativo | Duplica la UI. |
| WebView de Android | El spike se hizo con GeckoView directamente, porque aporta extensiones y aislamiento por contexto. WebView solo sería un plan B. |

Todo en un único repositorio. No hacen falta más repos, y todo el tooling es gratuito (GitHub, Capacitor, Android Studio, GeckoView). No se usará GitHub Actions: los builds se generan en local.

## 2. Qué validó el spike (`feature/android-gecko-spike`)

Probado en una Samsung Galaxy Tab S12 Plus (arm64).

| Riesgo | Resultado |
|---|---|
| Login en X desde GeckoView (usuario y contraseña) | OK, sin bloqueos |
| Aislamiento y persistencia por perfil (`contextId`) | OK |
| Extensiones de AMO (Control Panel for Twitter), con opciones y popup | OK. Son **globales** al runtime y sus ajustes se comparten entre perfiles (es lo deseado) |
| Autologin (usuario → contraseña → Enter) | OK |
| Chat / PIN y estado de sesión (`isLoggedIn`, `isOnHomeUrl`) | OK |

Dónde está cada cosa en la rama del spike:

| Fichero | Qué contiene |
|---|---|
| `mobile-spike/app/src/main/java/com/example/myapplication/MainActivity.kt` | Runtime y sesiones Gecko, `PromptDelegate`, popup flotante, mensajería nativa, tecleo, PIN y estado |
| `mobile-spike/app/src/main/assets/messaging/` | Extensión interna `X Profiles Helper` (`manifest.json` + `content.js`) |
| `mobile-spike/app/build.gradle.kts`, `settings.gradle.kts`, `build.gradle.kts`, `gradle/libs.versions.toml` | Requisitos de build (abajo) |

### Lecciones técnicas

- **Build:** GeckoView 159 exige `compileSdk` 37.2 y Kotlin 2.4.20. El Kotlin integrado en AGP 9.5.1 es 2.2.0 y no lee las librerías de GeckoView, así que se fuerza `kotlin-gradle-plugin:2.4.20` en el `build.gradle.kts` raíz. Repositorio `https://maven.mozilla.org/maven2/`, artefacto `geckoview-arm64-v8a`, `abiFilters = arm64-v8a`. Fijar la versión de GeckoView; su API cambia entre versiones.
- **Aislamiento:** `GeckoSessionSettings.Builder().contextId(profileId)`. Las sesiones persisten entre arranques.
- **Desplegables, alertas y confirmaciones:** GeckoView no los dibuja. Hay que implementar `GeckoSession.PromptDelegate` (`onChoicePrompt`, `onAlertPrompt`, `onButtonPrompt`) en **cada** sesión, incluidas las de popups.
- **Popup de extensión:**
  - `WebExtension.Action.click()` falla con `nativeTab is null` si no hay pestaña activa. Hay que llamar a `webExtensionController.setTabActive(session, true)`.
  - Gecko envía dos `onBrowserAction`: la acción por defecto y otra por sesión con todos los campos a `null`. Hay que guardar solo la acción por defecto.
  - Gecko **no abre** la sesión devuelta por `onTogglePopup`: la abre la app (`popup.open(runtime)`).
  - El popup se muestra en un panel flotante con su propia `GeckoView`, sin sacar al usuario de X.
- **Native messaging desde un content script:**
  - Permisos del manifest de la extensión interna: `nativeMessaging`, `nativeMessagingFromContent`, `geckoViewAddons`.
  - La extensión se instala con `ensureBuiltIn("resource://android/assets/messaging/", id)`.
  - El delegado se asigna **por sesión**: `session.webExtensionController.setMessageDelegate(ext, delegate, "browser")`. `MessageSender.session` identifica el perfil.
  - **La respuesta de `onMessage` debe ser un `String`** (JSON serializado), no un `JSONObject`: con `JSONObject` el puente falla con `Invalid event data for callback` y el content script se queda esperando.
- **Autologin:**
  - El content script solo detecta el paso (campo de usuario o de contraseña) y avisa a Kotlin. Kotlin teclea con eventos de teclado reales (`KeyCharacterMap` + `GeckoView.dispatchKeyEvent`), como hacía CDP. Las credenciales **no pasan por el JS de la página**.
  - X mete un campo de contraseña oculto en el DOM. Solo hay que considerar campos realmente visibles (tamaño, opacidad y `elementFromPoint`).
  - El login actual de X es un modal SPA en `/i/jf/onboarding/web?mode=login`, con `name="username_or_email"` y `name="password"`.
- **PIN:** se resuelve solo en Kotlin siguiendo `onLocationChange`: si la URL contiene `/i/chat/pin/recovery`, pulsa Tab y teclea los dígitos cada 0,5 s (igual que `runPinFlow` en `launcher.ts`).
- **Tamaño:** el APK de debug pesa ≈200 MB. En release, con solo arm64 y minificación, será bastante menos.

## 3. Hallazgos del código actual que condicionan el diseño

- El renderer solo usa `window.electronAPI` (143 usos en 18 ficheros), y es una API de alto nivel: `profiles`, `launcher`, `folders`, `settings`, `system`, `dialog`, `backup`, `icons`, `shell`, `passwords`, `mails`.
- Hay **lógica de negocio mezclada con la plataforma**. Ejemplo: `launcher:autoLogin` en `src/main/ipc.ts` busca el perfil, saca el usuario, descifra la contraseña, llama al launcher y persiste `xLoggedIn`. El launcher en sí solo recibe `(profileId, username, password)`.
- `StorageManager`, `passwordManager` y `mailManager` usan `fs`, `crypto`, `adm-zip` y `app.getPath` de Electron.
- **El backup es portable.** El zip contiene `data.json` (versión 2) e `images/`, sin datos del navegador. Las contraseñas se guardan como `iv_hex:data_hex` con AES-256-CBC, y la clave sale de `scrypt('x-profiles-manager-pw-v1', 'xpm-pw-salt-static', 32)`. Android puede leer backups de desktop si implementa el mismo formato.

## 4. Arquitectura propuesta

```
packages/core      TypeScript puro, sin Node ni Electron: tipos, servicios y puertos
packages/ui        el renderer actual (React)
apps/desktop       Electron: adaptadores Node + launcher Chromium/Gecko
apps/mobile        Capacitor: adaptadores móviles + plugin Kotlin (GeckoView)
```

### 4.1 `PlatformAPI`

Misma forma que el `ElectronAPI` actual, para tocar lo mínimo en los componentes. El renderer usa `getPlatformAPI()` en lugar de `window.electronAPI`. Además expone:

- `platform: 'darwin' | 'win32' | 'android'`
- `capabilities`: por ejemplo `focusWindow`, `browserPaths`, `windowLayout`, `openDirectory`, `perProfileExtensions`. La UI oculta lo que no aplica a la plataforma.

### 4.2 Servicios de `core` y puertos

Implementado en M2 en `src/core/` (sin importaciones de Node, Electron ni Capacitor). Los servicios (`SettingsService`, `ProfileService`, `FolderService`, `PasswordService`, `MailService`, `BackupService`) y el `Backend` dependen solo de estos **puertos** (`src/core/ports.ts`):

| Puerto | Qué abstrae | Desktop (`src/main/adapters/`) | Android (M4) |
|---|---|---|---|
| `DocumentStore` | JSON de perfiles, carpetas, ajustes, contraseñas y correos. **Síncrono** | `fs`, mismas rutas que antes | caché en memoria + escritura diferida (Capacitor Filesystem) |
| `AssetStore` | Imágenes e iconos, lectura de ficheros por ruta. Asíncrono | `fs` | Capacitor Filesystem |
| `ProfileDataPort` | Directorio de datos del navegador por perfil | `fs` | no-op (`dataDirFor` devuelve `''`) |
| `ArchiveCodec` | Zip del backup, con `Uint8Array` | `adm-zip` | `fflate` |
| `SecretCipher` | Cifrado de contraseñas, mismo formato `iv:data` | `crypto` (scrypt + AES-256-CBC) | `@noble/hashes` + `@noble/ciphers` (ambos síncronos) |
| `BrowserLauncher` | Lanzador del navegador | `desktopLauncher.ts` sobre `launcher.ts` | plugin Kotlin GeckoView |
| `CoreDeps` | `defaultSettings()`, `newId()`, `now()` | ajustes con detección de Chrome/Gecko | ajustes de Android |

**Decisión: el almacén de documentos es síncrono.** `launcher.ts` consulta ajustes y perfiles desde funciones síncronas (`getBrowserEngine()`, `getBrowserPath()`...). Convertirlo a `async` obligaba a tocar 1675 líneas con Win32 y CDP, que es el mayor riesgo del proyecto. Android carga los JSON en memoria al arrancar (son pequeños) y escribe en segundo plano. Lo que es inherentemente asíncrono (imágenes, zip, navegador) sí lo es en los puertos.

**Decisión: el backup trabaja con bytes.** `BackupService` recibe y devuelve `Uint8Array`. Leer y escribir el fichero y los diálogos quedan en el borde de cada plataforma (`ipc.ts` en desktop, el plugin en Android).

**`Backend`** (`src/core/backend.ts`) tiene la misma forma que `PlatformAPI` sin diálogos ni rutas, y contiene la orquestación que estaba mezclada en `ipc.ts` (autologin, PIN, persistencia de `xLoggedIn`, cierre de todos los perfiles...). Convenciones: los errores visibles son `UserFacingError`, las operaciones booleanas devuelven `false` si no hicieron nada y las búsquedas devuelven `null` si no existe. En desktop, `ipc.ts` solo registra canales y traduce esas convenciones al formato de respuesta de siempre.

### 4.3 Plugin Android `ProfileBrowser`

Contrato igual al de `BrowserLauncher`: `launch`, `close`, `closeAll`, `focusWindow`, `getActive`, `isActive`, `autoLogin`, `isLoggedIn`, `isOnHomeUrl`, `fillPinRecovery`, `openChat`.

Internamente, partiendo del código del spike:

- `GeckoRuntime` único, creado en la clase `Application`.
- `SessionRegistry`: `profileId → GeckoSession` con `contextId = profileId`, última URL y tareas pendientes.
- `BrowserActivity`: `GeckoView`, selector de perfil y botón para volver al gestor.
- Extensión interna `X Profiles Helper` y Control Panel for Twitter incluidas en los assets.
- `PromptDelegate` y popup flotante de extensiones.
- Credenciales y PIN solo en memoria, pasados en cada llamada.

### 4.4 Diferencias de datos

- `dataDir` y `directoryPath` se ignoran en móvil. La identidad del perfil en Gecko es su `id`.
- `imagePath` pasa a ser una ruta en el almacenamiento de la app.
- Ajustes sin sentido en Android: rutas de Chrome/Edge/Gecko, `profilesDir`, `windowLayout`, `autoLaunchOnStartup`, `focusMethodWindows`.
- `installedExtensions` y `extensionsConfig` por perfil: en Android las extensiones son globales.

## 5. Hitos

Cada hito deja desktop funcionando.

| # | Hito | Qué se verifica | Tamaño |
|---|---|---|---|
| M1 ✅ | Definir `PlatformAPI`. El renderer usa `getPlatformAPI()`. El preload de Electron la implementa. | Desktop idéntico | Pequeño |
| M2 ✅ | Extraer servicios a puertos dentro del repo actual. `ipc.ts` pasa a ser un adaptador fino. | Paridad con el código anterior (ver abajo) | Medio |
| M3 ✅ | Pasar a npm workspaces: `packages/core`, `packages/ui`, `apps/desktop`. | `npm run dist` genera el `.dmg` y la app empaquetada funciona. **Falta probar el `.exe` en Windows** | Pequeño-medio |
| M4 ✅ | `apps/mobile` con Capacitor, adaptadores móviles y un launcher simulado. | La UI arranca, se importa un backup de desktop y las contraseñas se descifran. **Probado en emulador Android 17 (arm64); falta repetirlo en la tablet física** | Medio |
| M5 ✅ | Plugin Kotlin real: lanzar y cambiar de perfil, autologin, PIN, `isLoggedIn`, extensiones, prompts. | Los 4 checkpoints del spike dentro de la app real. **Probado en emulador; falta la tablet y una cuenta real (login, Chat/PIN)** | Medio-grande |
| M6 | Pulido para tablet, `capabilities` y empaquetado del APK. | Uso diario | Pequeño |

### Cómo se verificó M2

Test de paridad entre el código anterior (commit `a977d82`) y el nuevo, ejecutando las mismas operaciones en carpetas de datos separadas y comparando los ficheros resultantes (ids y fechas normalizados): CRUD de perfiles, carpetas, contraseñas y correos, iconos, renombrado de directorios, errores, `clearAllData`, backups completos, parciales y sin Character Hub, y una matriz de 18 restauraciones (cada zip en las dos implementaciones, con `targetFolderId` sin definir, `null` y un id). Incluye cifrado cruzado: cada implementación descifra las contraseñas creadas por la otra. 146 comprobaciones, 0 diferencias, y el test detecta fallos introducidos a propósito. Además, prueba extremo a extremo en la app real por IPC con una carpeta de datos temporal, comprobando los mensajes de error uno a uno.

### Notas de M3 (estructura y empaquetado)

- `@xpm/core` se compila a `packages/core/dist` (CommonJS + `.d.ts`) y desktop lo consume como dependencia de workspace. En el core, `"types": []` y `lib: ["ES2020","DOM"]` hacen que el compilador rechace cualquier uso de APIs de Node.
- La UI importa los tipos con `import type ... from '@xpm/core'`, así que Vite nunca necesita el runtime del core. El preload también usa `import type`, porque corre en un contexto restringido.
- **El `name` de `apps/desktop/package.json` debe seguir siendo `x-profiles-manager`**, sin `productName` en el nivel superior: de él sale la carpeta de datos del usuario (`~/Library/Application Support/x-profiles-manager`). Cambiarlo haría que la app "perdiera" los datos.
- **`electron-builder` en un workspace:** hay que fijar la versión exacta de `electron` (`33.4.11`) en `apps/desktop`, porque no encuentra `node_modules/electron` al estar hoisteado. Y hay que poner `"npmRebuild": false`: sin eso intenta reinstalar las dependencias de producción y **poda el `node_modules` de la raíz** (probado, se pierde `electron`, `electron-builder`...). `koffi` trae binarios precompilados, así que no necesita recompilarse.
- El paquete pasa de 25 MB a 3,3 MB: `react`, `react-dom` y `reicon-react` ya no se incluyen en `node_modules` del paquete porque Vite los mete en el bundle del renderer. Son dependencias de `@xpm/ui`, no de la app de escritorio.
- `npm run type-check` funciona de nuevo. El `moduleResolution: bundler` que lo rompía con TypeScript 4.9 pasó a `node`, sin subir versiones.
- La versión de la app vive en `apps/desktop/package.json` (la usa `electron-builder`); `scripts/bump-version.js` la actualiza junto con la de `Settings.tsx`.

### Notas de M4 (Android con Capacitor)

**Resultado del chequeo de compatibilidad (el riesgo que teníamos anotado).** Capacitor 8.6 + GeckoView 159 + Kotlin 2.4.20 **sí conviven**, con estos ajustes sobre la plantilla que genera `cap add android` (en `apps/mobile/android/`):

| Ajuste | Valor | Por qué |
|---|---|---|
| Android Gradle Plugin | `9.5.1` (la plantilla trae 8.13.0) | GeckoView arrastra `androidx.core 1.19.1`, que exige AGP ≥ 9.1 |
| Gradle | `9.6.0` | lo exige AGP 9.5 |
| `compileSdk` (módulo `app`) | `37` con `minorApiLevel = 2` | GeckoView 159 exige 37.2. Solo el módulo `app` lo necesita, los plugins de Capacitor siguen con 36 |
| `minSdk` | `26` (la plantilla trae 24) | mínimo de GeckoView |
| Kotlin | `kotlin-gradle-plugin:2.4.20` en el `classpath` del `build.gradle` raíz | el Kotlin integrado de AGP (2.2) no lee las librerías de GeckoView. Comprobado compilando Kotlin contra clases de GeckoView |
| Repositorio | `https://maven.mozilla.org/maven2/` limitado al grupo `org.mozilla.geckoview` | origen de GeckoView |
| ABI | `abiFilters 'arm64-v8a'` + `geckoview-arm64-v8a` | tablet y emulador son arm64 |
| ProGuard | `proguard-android-optimize.txt` | AGP 9 ya no admite `proguard-android.txt` |

Los módulos de Capacitor (`capacitor-android`, `filesystem`, `share`, `cordova-android-plugins`) compilan sin cambios con AGP 9.5.1. El APK de debug pesa ≈190 MB, como el del spike.

**Cómo construir y probar:**
```bash
npm run mobile:sync                       # compila core + UI móvil y sincroniza con el proyecto Android
cd apps/mobile/android && ./gradlew assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

**Estructura de `apps/mobile`:** `src/boot.ts` prepara el core con los adaptadores de `src/platform/` (documentos, iconos, zip, cifrado, directorios de datos, ajustes, ficheros y `PlatformAPI`), expone `window.platformAPI` y solo entonces monta la UI (`@xpm/ui/main`). El lanzador es provisional (`UnavailableLauncher`) hasta M5.

**Decisiones y hallazgos:**
- **El core se publica en dos formatos:** CommonJS (`main`, para Electron) y ESM (`module`, para Vite). Con solo CJS, Rollup no ve los exports nombrados de un `export *`.
- **Versiones fijadas:** `@noble/hashes` y `@noble/ciphers` en major 1, porque la 2 es solo ESM con `exports` y TypeScript 4.9 no resuelve sus tipos.
- **Compatibilidad entre plataformas:** un perfil creado en Android tiene `dataDir` vacío. Al restaurarlo en desktop, `BackupService` le asigna el directorio de esta plataforma (si no, el lanzador usaría una ruta vacía). Los perfiles de desktop importados en Android conservan su `dataDir` sin efecto.
- **Mensajes de error iguales que en desktop:** `PlatformAPI` móvil aplica las mismas reglas que el `ipc.ts` (mensajes planos para `Profile not found`, `Unknown error from main process`...).
- **Acceso al registro de npm:** desde la sesión del asistente el registro corporativo devolvía 403, así que los paquetes nuevos (`@capacitor/*`, `fflate`, `@noble/*`) los instaló el usuario.
- **Exportar backup = plugin propio `FileSaver`** (`FileSaverPlugin.kt`), no `@capacitor/share`. La hoja de compartir solo ofrece aplicaciones y no permite "guardar en la tablet". `FileSaver` abre el cuadro *Guardar como…* del sistema (Storage Access Framework, `ACTION_CREATE_DOCUMENT`) y copia el zip allí, sin permisos de almacenamiento. Es el primer plugin Kotlin propio: se registra en `MainActivity` antes de `super.onCreate`, y M5 sigue el mismo patrón. Cancelar devuelve `Export canceled`, como desktop. Probado en emulador: el zip guardado es válido y desktop descifra sus contraseñas.
- **Gradle con el JDK de Android Studio (25):** los módulos de Capacitor 8 piden Java 21. `settings.gradle` incluye el plugin Foojay para que Gradle descargue el JDK 21 si falta.
- **UI bajo las barras del sistema (edge-to-edge).** Android dibuja la app debajo de la barra de estado y de la de gestos, y en esas franjas el toque lo recibe el sistema. Capacitor ya expone los márgenes (`--safe-area-inset-*` / `env(safe-area-inset-*)`), pero la UI no los usaba. `apps/mobile/src/safe-area.css` los aplica a `#root`; en desktop valen 0.
- **Táctil:** `apps/mobile/src/touch.css`, solo con `@media (pointer: coarse)`: zonas de pulsación ≥ 44 px (la auditoría pasó de 32 controles pequeños a 0), `touch-action: manipulation` (sin retardo por doble toque) y filas de casilla pulsables enteras. La auditoría (qué elemento recibe el toque en el centro de cada control) no encontró capas que tapen controles. Se hizo en un WebView con viewport de tablet; falta validarlo con el dedo en la tablet real.
- **Importar un backup "recortado" (`invalid zip data`).** No es un fallo del export: un backup completo exportado por la app se reimporta bien. Reproducido en emulador: si se copia con `adb push` un fichero con **el mismo nombre** que otro ya existente, el selector de Android sigue usando el tamaño antiguo guardado en su índice (MediaStore) y entrega el fichero recortado a ese tamaño. Con otro nombre, el mismo fichero se importa bien. La app ahora explica el error en vez de mostrar el mensaje técnico.
- Pendiente de pulir (M6): la UI es la de escritorio, sin adaptar a táctil; `Settings` muestra campos que no aplican en Android (rutas de navegador); las escrituras del almacén no son atómicas (se escribe directamente sobre el fichero).

**Cómo se verificó M4:**
- **Paridad en Node** de los adaptadores móviles reales (con `Filesystem` simulado sobre disco) frente a desktop: 126 comprobaciones, 0 diferencias. Incluye zips de `fflate` restaurados por `adm-zip` y al revés, y cifrado cruzado `@noble` ↔ `crypto`. Se verificó que el test detecta fallos introducidos a propósito. Ignora solo lo que difiere por diseño (ajustes por defecto, `dataDir`, carpetas de datos).
- **En el WebView real de Android** (emulador, controlado por el puerto de depuración): restaurar un backup de desktop (2 perfiles, 1 carpeta, 2 contraseñas, 1 correo), omitir duplicados en una segunda restauración, descifrar las contraseñas, leer una imagen como data URL, crear un perfil y una contraseña con caracteres no ASCII, y comprobar que todo persiste tras cerrar y reabrir la app.

### Notas de M5 (el navegador GeckoView)

**Arquitectura.** La UI sigue en el WebView de Capacitor (el gestor). El navegador está en una `BrowserActivity` aparte, con una barra con los perfiles abiertos (chips con el color del perfil), "‹ Gestor", recargar y un menú. Las sesiones **no son de la pantalla**: viven en `SessionRegistry` (un `GeckoSession` por perfil, `contextId = profileId`), así que "Gestor" o Atrás no cierran los perfiles; solo cerrar el perfil, desde el menú o desde el gestor, lo cierra. Un único `GeckoRuntime`.

Código en `apps/mobile/android/app/src/main/java/com/xprofilesmanager/app/`:

| Fichero | Papel |
|---|---|
| `ProfileBrowserPlugin.kt` | Plugin Capacitor: `launch`, `focus`, `close`, `closeAll`, `getActive`, `updateProfile`, `isLoggedIn`, `isOnHomeUrl`, `openChat`, `fillPinRecovery`, `autoLogin` y el evento `sessionsChanged` |
| `browser/BrowserEngine.kt` | `GeckoRuntime` único; prepara la extensión interna y **instala Control Panel for Twitter** desde AMO la primera vez (necesita red) |
| `browser/SessionRegistry.kt`, `ProfileSession.kt` | Sesiones por perfil, estado (URL, "puede ir atrás", login pendiente, PIN), recuperación si el proceso de contenido muere, enlaces `target=_blank` en la misma sesión |
| `browser/BrowserActivity.kt` + `res/layout/activity_browser.xml` | Pantalla del navegador, barra de perfiles, panel flotante de la extensión (popup y ajustes), respeta las barras del sistema |
| `browser/XFlows.kt`, `XUrls.kt` | Autologin, Chat/PIN y las reglas de `isLoggedIn`/`isHomeLike` (las mismas listas que `launcher.ts`) |
| `browser/HelperMessages.kt`, `KeyTyper.kt` | Mensajería con la extensión interna y tecleo con eventos de teclado reales |
| `browser/ExtensionBridge.kt`, `PromptHandler.kt` | Acciones/popup de la extensión; desplegables, alertas y confirmaciones |
| `assets/messaging/` | Extensión interna "X Profiles Helper" (portada del spike, sin trazas de depuración) |

Lado TypeScript: `src/platform/profileBrowser.ts` (el plugin) y `androidLauncher.ts`, que implementa `BrowserLauncher` y sustituye al lanzador provisional de M4.

**Decisiones y hallazgos:**
- **`isActive`/`getActive` son síncronos en el contrato `BrowserLauncher`, pero el plugin es asíncrono.** `AndroidLauncher` mantiene una caché de perfiles abiertos, actualizada por `sessionsChanged` y refrescada al volver al gestor (`visibilitychange`): mientras el navegador está delante, el WebView del gestor está en pausa.
- **Validación como en desktop:** lanzar un perfil que no existe devuelve `Failed to launch profile` (la comprobación consulta la base de datos, no una caché, que se quedaría vieja tras restaurar un backup).
- **El objeto que devuelve `install()` llega sin la URL de opciones** de la extensión; hay que volver a pedirla a `list()` tras instalar.
- **Las llamadas que acaban dentro del navegador** (como `autoLogin`) se resuelven cuando termina el flujo, pero el WebView del gestor está pausado entonces: la respuesta llega al volver a "Gestor".
- Escribir usuario, contraseña y PIN solo funciona con la sesión **a la vista** (Gecko recibe las teclas en la `GeckoView` visible). Si cambias de perfil a mitad del login, el paso falla y el flujo caduca (90 s).

**Cómo se verificó (emulador Android 17 arm64, por la API real de la app):** el gestor lanza un perfil y aparece la `BrowserActivity` con X cargado; Atrás vuelve al gestor sin cerrar el perfil; un segundo perfil añade su chip; el cambio entre perfiles; la extensión se instala sola con su URL de opciones; el panel de ajustes y el popup se abren sobre X sin sacarte de la página; **autologin completo** con credenciales falsas (usuario → contraseña → envío, y X responde "contraseña incorrecta"), con la API devolviendo `true`; `openChat`, `fillPinRecovery` y `focusWindow` devuelven `true`; `close` deja los activos en 0; un perfil inexistente se rechaza; cero cierres inesperados.

**Sin verificar todavía:** el flujo con una **cuenta real** (el login completo hasta entrar, y Chat/PIN en la página real de recuperación; el tecleo de PIN es el mismo código validado en el spike) y todo en la **tablet física**.

## 6. Adaptación de la UI a tablet

- La Tab S12 Plus en horizontal cabe en el layout actual, así que no hace falta un diseño nuevo.
- Tooltips por hover → pulsación larga.
- Menús contextuales por clic derecho → pulsación larga.
- Drag & drop de reordenar: probar en táctil; si falla, usar una librería basada en pointer.
- Diálogos de fichero → selector de Android.
- Teléfono: fuera de alcance de momento.

## 7. Riesgos

- **Compatibilidad de versiones** de Capacitor, AGP, Kotlin y `compileSdk` (ver M4).
- **GeckoView cambia de API entre versiones**: fijar la versión y subirla a propósito.
- **Los selectores de X cambian**: mantenerlos en un único fichero (`content.js`), como ahora en `launcher.ts`.
- **Clave de cifrado estática** de las contraseñas: es ofuscación, no seguridad real. Se mantiene para conservar la compatibilidad del backup; en Android se podría añadir después una capa con Keystore.
- **Tamaño del APK**: solo `arm64-v8a` y minificación en release.
- **Captchas o verificaciones** de X en el login automático: quedan como paso manual, igual que en desktop.
