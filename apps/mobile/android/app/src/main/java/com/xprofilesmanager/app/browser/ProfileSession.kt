package com.xprofilesmanager.app.browser

import org.mozilla.geckoview.GeckoSession

/** Login automático en curso: usuario y contraseña viven solo en memoria. */
class LoginTask(
    val username: String,
    val password: String,
    val onDone: (Boolean) -> Unit
) {
    var userDone = false
    private var finished = false

    /** Termina una sola vez (éxito, tiempo agotado o sustitución por otra tarea). */
    fun finish(success: Boolean) {
        if (finished) return
        finished = true
        onDone(success)
    }
}

/** Una sesión de navegador de un perfil. `contextId` = `profileId`, así cada perfil tiene sus cookies y su almacenamiento. */
class ProfileSession(
    val profileId: String,
    var name: String,
    var color: String?,
    val gecko: GeckoSession
) {
    val startTime: Long = System.currentTimeMillis()
    var lastUrl: String = ""
    var canGoBack: Boolean = false
    var loginTask: LoginTask? = null
    var pin: String? = null
}
