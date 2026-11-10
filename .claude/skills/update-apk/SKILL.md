---
name: update-apk
description: Actualiza la app Android de x-profiles-manager ya instalada en la tablet con un APK de release nuevo, conservando sus datos, mediante scripts/update-apk.sh. Usar cuando el usuario pida actualizar, reinstalar, desplegar o probar en la tablet los últimos cambios de la app Android ("actualiza la apk", "pásalo a la tablet", "instala la nueva versión", "update apk").
---

# Actualizar la APK en la tablet

Ejecutar siempre el script del repo; no reconstruir los pasos a mano.

## Pasos

1. Comprobar que se está en la raíz del repo (`scripts/update-apk.sh` existe).
2. Si el usuario no ha pedido expresamente instalar ya, confirmar antes: el script instala en el dispositivo conectado y abre la app.
3. Ejecutar:
   - `npm run mobile:update` (regenera el APK, instala con `adb install -r` y abre la app), o
   - `scripts/update-apk.sh --skip-build` si solo hay que reinstalar el APK ya generado.
   - Opciones: `--serial <id>` con varios dispositivos, `--no-launch` para no abrir la app.
4. Leer el código de salida y la última línea impresa; informar al usuario en español.

## Códigos de salida

| Código | Qué hacer |
|---|---|
| 0 | Éxito. Decir versión instalada y que los datos se conservan. |
| 2 | No hay `adb`: pedir que instale platform-tools o defina `ADB=/ruta/adb`. |
| 3 | Sin dispositivo, no autorizado o varios: pedir enchufar la tablet, aceptar la depuración USB, o repetir con `--serial`. |
| 4 | Falta `apps/mobile/android/keystore.properties`: no se puede firmar. No crear un keystore nuevo sin avisar (cambiaría la firma). |
| 5 | Falló el build: mostrar las últimas líneas del error. |
| 6 | No existe el APK: repetir sin `--skip-build`. |
| 7 | Firma distinta a la instalada. **No desinstalar por cuenta propia**: desinstalar borra los datos de la app. Pedir antes un export desde Ajustes y confirmación explícita. |
| 8 | Versión inferior a la instalada: avisar; no forzar. |
| 9 | Otro fallo de instalación: mostrar la salida de `adb`. |

## Reglas

- Nunca usar `adb uninstall`, `pm clear` ni borrar datos de la tablet sin confirmación explícita.
- No mostrar ni copiar el contenido de `keystore.properties` ni del keystore (contraseñas); ambos están ignorados por git.
- Para distinguir versiones, sugerir `npm run bump` antes de actualizar si el usuario quiere un número de versión nuevo.
