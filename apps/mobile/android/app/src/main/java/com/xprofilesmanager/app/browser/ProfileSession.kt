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

/** Pestaña secundaria de un perfil. Comparte cookies con la principal (mismo `contextId`). `gecko` es null si está descargada. */
class Tab(var gecko: GeckoSession?, var url: String) {
    var title: String = ""
    var canGoBack: Boolean = false
    var lastActive: Long = System.currentTimeMillis()
}

/** Una sesión de navegador de un perfil. `contextId` = `profileId`, así cada perfil tiene sus cookies y su almacenamiento. */
class ProfileSession(
    val profileId: String,
    var name: String,
    var color: String?,
    val gecko: GeckoSession
) {
    val startTime: Long = System.currentTimeMillis()

    /** Pestañas secundarias. La principal es `gecko`: en ella van los flujos automáticos y no se descarga nunca. */
    val tabs = mutableListOf<Tab>()

    /** Pestaña secundaria que se está mostrando; null = la principal. */
    var activeTab: Tab? = null

    /** La sesión de Gecko que se debe mostrar ahora. */
    val displayed: GeckoSession get() = activeTab?.gecko ?: gecko

    fun allGeckos(): List<GeckoSession> = listOf(gecko) + tabs.mapNotNull { it.gecko }

    var lastUrl: String = ""
    var canGoBack: Boolean = false
    var loginTask: LoginTask? = null
    var pin: String? = null

    /** Para el autologin desde el menú del navegador (el gestor está en pausa y no puede dárselas entonces). Solo en memoria. */
    var username: String? = null
        get() = directoryEntry()?.username ?: field
    var password: String? = null
        get() = directoryEntry()?.password ?: field
    var chatPin: String? = null
        get() = directoryEntry()?.pin ?: field

    private fun directoryEntry() = ProfileDirectory.entries.firstOrNull { it.id == profileId }
}
