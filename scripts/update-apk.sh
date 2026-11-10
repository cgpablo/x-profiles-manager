#!/usr/bin/env bash
# Actualiza la app Android instalada en la tablet con el APK de release (sin perder datos).
#
# Uso:  scripts/update-apk.sh [--skip-build] [--serial <id>] [--no-launch]
#   --skip-build   no regenera el APK: instala el que ya existe
#   --serial <id>  dispositivo concreto (obligatorio si hay más de uno conectado)
#   --no-launch    no abre la app al terminar
#
# Códigos de salida:
#   0 ok | 1 uso incorrecto | 2 adb no encontrado | 3 sin dispositivo / no autorizado / varios
#   4 falta keystore.properties | 5 falló el build | 6 no existe el APK
#   7 firma distinta a la instalada | 8 versión inferior a la instalada | 9 otro fallo de instalación
set -uo pipefail

PACKAGE="com.xprofilesmanager.app"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APK="$ROOT/apps/mobile/android/app/build/outputs/apk/release/app-release.apk"
KEYSTORE_PROPS="$ROOT/apps/mobile/android/keystore.properties"

SKIP_BUILD=0
LAUNCH=1
SERIAL=""
while [ $# -gt 0 ]; do
  case "$1" in
    --skip-build) SKIP_BUILD=1 ;;
    --no-launch) LAUNCH=0 ;;
    --serial) shift; SERIAL="${1:-}"; [ -n "$SERIAL" ] || { echo "Falta el valor de --serial"; exit 1; } ;;
    -h|--help) sed -n '2,13p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Opción desconocida: $1"; exit 1 ;;
  esac
  shift
done

step() { echo; echo "==> $*"; }
fail() { local code="$1"; shift; echo -e "ERROR: $*" >&2; exit "$code"; }

# --- adb ---
ADB="${ADB:-}"
if [ -z "$ADB" ]; then
  for candidate in "$(command -v adb 2>/dev/null)" \
                   "${ANDROID_HOME:-}/platform-tools/adb" \
                   "${ANDROID_SDK_ROOT:-}/platform-tools/adb" \
                   "$HOME/Library/Android/sdk/platform-tools/adb"; do
    if [ -n "$candidate" ] && [ -x "$candidate" ]; then ADB="$candidate"; break; fi
  done
fi
[ -x "$ADB" ] || fail 2 "No encuentro adb. Define ADB=/ruta/a/adb o instala las platform-tools del SDK de Android."

# --- dispositivo ---
step "Buscando la tablet"
DEVICES_RAW="$("$ADB" devices | tail -n +2 | tr -d '\r' | awk 'NF')"
READY="$(echo "$DEVICES_RAW" | awk '$2=="device"{print $1}')"
UNAUTH="$(echo "$DEVICES_RAW" | awk '$2=="unauthorized"{print $1}')"

if [ -n "$SERIAL" ]; then
  echo "$READY" | grep -qx "$SERIAL" || fail 3 "El dispositivo $SERIAL no está listo. Estado actual:\n$DEVICES_RAW"
else
  COUNT="$(echo "$READY" | awk 'NF' | wc -l | tr -d ' ')"
  if [ "$COUNT" = "0" ]; then
    [ -n "$UNAUTH" ] && fail 3 "La tablet ($UNAUTH) no está autorizada: acepta el aviso de depuración USB en la tablet."
    fail 3 "No hay ningún dispositivo conectado. Enchufa la tablet y activa la depuración USB."
  elif [ "$COUNT" != "1" ]; then
    fail 3 "Hay $COUNT dispositivos conectados; indica uno con --serial:\n$READY"
  fi
  SERIAL="$READY"
fi
A=("$ADB" -s "$SERIAL")
echo "Dispositivo: $SERIAL ($("${A[@]}" shell getprop ro.product.model | tr -d '\r'), Android $("${A[@]}" shell getprop ro.build.version.release | tr -d '\r'))"

# --- build ---
if [ "$SKIP_BUILD" = "0" ]; then
  [ -f "$KEYSTORE_PROPS" ] || fail 4 "Falta $KEYSTORE_PROPS (firma de release). Sin él no se puede firmar el APK."
  step "Generando el APK de release (npm run mobile:apk)"
  (cd "$ROOT" && npm run mobile:apk) || fail 5 "Falló el build."
fi
[ -f "$APK" ] || fail 6 "No existe $APK. Ejecuta sin --skip-build."

NEW_VERSION="$(node -p "require('$ROOT/apps/desktop/package.json').version")"
step "Instalando versión $NEW_VERSION ($(du -h "$APK" | cut -f1))"
OLD_VERSION="$("${A[@]}" shell dumpsys package "$PACKAGE" 2>/dev/null | tr -d '\r' | awk -F= '/versionName=/{print $2; exit}')"
echo "Instalada ahora: ${OLD_VERSION:-ninguna}"

# --- instalación (-r conserva los datos) ---
OUT="$("${A[@]}" install -r "$APK" 2>&1)"; STATUS=$?
echo "$OUT" | tail -n 3
if [ $STATUS -ne 0 ] || ! echo "$OUT" | grep -q "Success"; then
  if echo "$OUT" | grep -q "INSTALL_FAILED_UPDATE_INCOMPATIBLE"; then
    fail 7 "La app instalada está firmada con otra clave (¿es la versión debug?). Para sustituirla hay que desinstalarla, y se pierden sus datos: haz antes un export desde Ajustes, y luego 'adb -s $SERIAL uninstall $PACKAGE'."
  elif echo "$OUT" | grep -q "INSTALL_FAILED_VERSION_DOWNGRADE"; then
    fail 8 "El APK tiene una versión inferior a la instalada (${OLD_VERSION:-?})."
  fi
  fail 9 "Falló la instalación."
fi

# --- abrir ---
if [ "$LAUNCH" = "1" ]; then
  step "Abriendo la app"
  "${A[@]}" shell am start -n "$PACKAGE/.MainActivity" >/dev/null 2>&1 || echo "(no se pudo abrir automáticamente)"
fi

echo
echo "Listo: $PACKAGE actualizado a $NEW_VERSION en $SERIAL (datos conservados)."
