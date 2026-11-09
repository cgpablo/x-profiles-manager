package com.xprofilesmanager.app.browser

import org.mozilla.geckoview.GeckoView

/** La pantalla de navegador que está viva ahora mismo (si hay), de la que dependen diálogos, teclado y popups. */
object BrowserHost {
    @Volatile
    var activity: BrowserActivity? = null

    /** La vista de Gecko solo si esa sesión se está mostrando en primer plano: es donde se puede escribir. */
    fun viewShowing(session: ProfileSession): GeckoView? =
        activity?.takeIf { it.isShowing(session.profileId) }?.geckoView
}
