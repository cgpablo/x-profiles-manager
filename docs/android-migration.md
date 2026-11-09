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
| M4 | `apps/mobile` con Capacitor, adaptadores móviles y un launcher simulado. | La UI arranca en la tablet, se importa un backup de desktop y las contraseñas se descifran | Medio |
| M5 | Plugin Kotlin real: lanzar y cambiar de perfil, autologin, PIN, `isLoggedIn`, extensiones, prompts. | Los 4 checkpoints del spike dentro de la app real | Medio-grande |
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

### Primer paso de M4 (riesgo)

Antes de escribir código, comprobar que **Capacitor es compatible con AGP 9, Kotlin 2.4.20 y `compileSdk` 37.2**, que son los requisitos de GeckoView. Si no lo es, hay que ajustar versiones o plantear el plugin como módulo separado.

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
