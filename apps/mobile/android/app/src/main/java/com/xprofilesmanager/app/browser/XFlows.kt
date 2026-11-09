package com.xprofilesmanager.app.browser

import android.util.Log
import android.view.KeyEvent

/** Flujos de X: autologin, abrir el chat y rellenar el PIN. Equivalen a `autoLogin`, `openChat` y `fillPinRecovery` de desktop. */
object XFlows {
    private const val TAG = "XBrowser"
    private const val LOGIN_TIMEOUT_MS = 90_000L
    private const val PIN_TIMEOUT_MS = 30_000L

    /** Va a la pantalla de login y deja la tarea pendiente; `onDone` recibe si se llegó a escribir la contraseña. */
    fun startLogin(ps: ProfileSession, username: String, password: String, onDone: (Boolean) -> Unit) {
        ps.loginTask?.finish(false)
        val task = LoginTask(username, password, onDone)
        ps.loginTask = task
        KeyTyper.later(LOGIN_TIMEOUT_MS) {
            if (ps.loginTask === task) {
                ps.loginTask = null
                task.finish(false)
            }
        }
        ps.gecko.loadUri(XUrls.LOGIN_FLOW)
    }

    /**
     * Abre el chat. Con PIN, si X redirige a la recuperación, lo teclea (Tab y los dígitos cada 0,5 s).
     * Sin PIN, solo abre el chat.
     */
    fun openChat(ps: ProfileSession, pin: String?, navigate: Boolean = true) {
        val value = pin?.takeIf { it.isNotEmpty() }
        ps.pin = value
        if (value != null) {
            KeyTyper.later(PIN_TIMEOUT_MS) { if (ps.pin == value) ps.pin = null }
        }
        if (ps.lastUrl.contains(XUrls.PIN_RECOVERY_PATH)) {
            typePinIfNeeded(ps)
        } else if (navigate) {
            ps.gecko.loadUri(XUrls.CHAT)
        }
    }

    fun onLocationChange(ps: ProfileSession) {
        if (ps.pin != null && ps.lastUrl.contains(XUrls.PIN_RECOVERY_PATH)) typePinIfNeeded(ps)
    }

    private fun typePinIfNeeded(ps: ProfileSession) {
        val pin = ps.pin ?: return
        ps.pin = null
        KeyTyper.later(1000) {
            val view = BrowserHost.viewShowing(ps) ?: return@later
            KeyTyper.press(view, KeyEvent.KEYCODE_TAB)
            KeyTyper.later(500) { KeyTyper.type(view, pin, 500) { Log.i(TAG, "PIN typed for ${ps.profileId}") } }
        }
    }
}
