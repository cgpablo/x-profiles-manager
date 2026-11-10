package com.xprofilesmanager.app.browser

import android.util.Log
import org.mozilla.geckoview.GeckoResult
import org.mozilla.geckoview.GeckoSession
import org.mozilla.geckoview.WebExtension

/**
 * Conecta una extensión de AMO (Control Panel for Twitter) con la pantalla del navegador: su popup y su página de
 * opciones se muestran como un panel flotante sobre X, sin sacar al usuario de la página.
 *
 * Lecciones del spike:
 * - La acción del botón necesita una pestaña activa (`setTabActive`) o `click()` falla con "nativeTab is null".
 * - Gecko envía dos acciones: la por defecto y una por sesión con todo a null; hay que guardar la por defecto.
 * - Gecko no abre la sesión que devolvemos para el popup: la abre la app.
 */
object ExtensionBridge {
    private const val TAG = "XBrowser"

    var extension: WebExtension? = null
        private set
    private var defaultAction: WebExtension.Action? = null
    private val sessionActions = mutableMapOf<GeckoSession, WebExtension.Action>()

    private val actionDelegate = object : WebExtension.ActionDelegate {
        override fun onBrowserAction(extension: WebExtension, session: GeckoSession?, action: WebExtension.Action) {
            if (session == null) defaultAction = action else sessionActions[session] = action
        }

        override fun onTogglePopup(extension: WebExtension, action: WebExtension.Action): GeckoResult<GeckoSession>? =
            BrowserHost.activity?.newPopupSession()

        override fun onOpenPopup(extension: WebExtension, action: WebExtension.Action): GeckoResult<GeckoSession>? =
            BrowserHost.activity?.newPopupSession()
    }

    fun bind(ext: WebExtension) {
        extension = ext
        ext.setActionDelegate(actionDelegate)
        ext.tabDelegate = object : WebExtension.TabDelegate {
            override fun onOpenOptionsPage(extension: WebExtension) {
                BrowserHost.activity?.runOnUiThread { BrowserHost.activity?.showOptionsPage() }
            }
        }
        SessionRegistry.all().forEach { it.gecko.webExtensionController.setActionDelegate(ext, actionDelegate) }
        Log.i(TAG, "extension ready: ${ext.metaData.name} id=${ext.id} options=${ext.metaData.optionsPageUrl} enabled=${ext.metaData.enabled}")
    }

    fun attach(gecko: GeckoSession) {
        extension?.let { gecko.webExtensionController.setActionDelegate(it, actionDelegate) }
    }

    fun optionsUrl(): String? = extension?.metaData?.optionsPageUrl?.takeIf { it.isNotEmpty() }

    /** Equivale a pulsar el icono de la extensión en la barra del navegador. */
    fun clickAction(gecko: GeckoSession): Boolean {
        val base = defaultAction ?: return false
        (sessionActions[gecko]?.withDefault(base) ?: base).click()
        return true
    }
}
