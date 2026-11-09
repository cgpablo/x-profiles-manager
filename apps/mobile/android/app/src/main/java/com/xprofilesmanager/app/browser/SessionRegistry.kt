package com.xprofilesmanager.app.browser

import android.content.Context
import android.util.Log
import org.mozilla.geckoview.GeckoResult
import org.mozilla.geckoview.GeckoSession
import org.mozilla.geckoview.GeckoSessionSettings
import org.mozilla.geckoview.WebExtension
import java.util.concurrent.CopyOnWriteArrayList

/**
 * Las sesiones de navegador abiertas, una por perfil (`contextId` = `profileId`). Viven en el proceso de la app, no
 * en la pantalla: se puede cerrar la pantalla del navegador y seguir con los perfiles abiertos.
 * Todo se usa desde el hilo principal.
 */
object SessionRegistry {
    private const val TAG = "XBrowser"

    fun interface Listener {
        fun onChanged(profileIds: List<String>)
    }

    private val sessions = LinkedHashMap<String, ProfileSession>()
    private val listeners = CopyOnWriteArrayList<Listener>()

    fun addListener(listener: Listener) = listeners.add(listener)
    fun removeListener(listener: Listener) = listeners.remove(listener)

    fun get(profileId: String): ProfileSession? = sessions[profileId]
    fun all(): List<ProfileSession> = sessions.values.toList()
    fun ids(): List<String> = sessions.keys.toList()
    fun forGecko(gecko: GeckoSession): ProfileSession? = sessions.values.firstOrNull { it.gecko === gecko }

    /** Devuelve la sesión del perfil; si no existe, la crea y carga `url` (o la portada de X). */
    fun open(context: Context, profileId: String, name: String?, color: String?, url: String?): ProfileSession {
        sessions[profileId]?.let { existing ->
            update(profileId, name, color)
            if (!url.isNullOrEmpty() && existing.lastUrl.isEmpty()) existing.gecko.loadUri(url)
            return existing
        }
        val runtime = BrowserEngine.runtime(context)
        val gecko = GeckoSession(GeckoSessionSettings.Builder().contextId(profileId).build())
        val ps = ProfileSession(profileId, name ?: profileId, color, gecko)
        prepare(ps)
        gecko.open(runtime)
        gecko.loadUri(url?.takeIf { it.isNotEmpty() } ?: XUrls.HOME)
        sessions[profileId] = ps
        notifyChanged()
        return ps
    }

    fun update(profileId: String, name: String?, color: String?) {
        val ps = sessions[profileId] ?: return
        var changed = false
        if (!name.isNullOrEmpty() && name != ps.name) { ps.name = name; changed = true }
        if (color != null && color != ps.color) { ps.color = color; changed = true }
        if (changed) notifyChanged()
    }

    fun close(profileId: String): Boolean {
        val ps = sessions.remove(profileId) ?: return false
        ps.loginTask?.finish(false)
        // La pantalla debe soltar la sesión antes de cerrarla
        BrowserHost.activity?.detach(ps)
        ps.gecko.close()
        notifyChanged()
        return true
    }

    fun closeAll(): Int {
        val count = sessions.size
        sessions.keys.toList().forEach { close(it) }
        return count
    }

    /** La extensión interna ya está lista: se conecta a las sesiones que ya existían. */
    fun onHelperReady(helper: WebExtension) {
        sessions.values.forEach { it.gecko.webExtensionController.setMessageDelegate(helper, HelperMessages, "browser") }
    }

    private fun prepare(ps: ProfileSession) {
        val gecko = ps.gecko
        gecko.promptDelegate = PromptHandler.delegate
        gecko.navigationDelegate = object : GeckoSession.NavigationDelegate {
            override fun onLocationChange(
                session: GeckoSession,
                url: String?,
                perms: MutableList<GeckoSession.PermissionDelegate.ContentPermission>,
                hasUserGesture: Boolean
            ) {
                if (url == null) return
                ps.lastUrl = url
                XFlows.onLocationChange(ps)
            }

            override fun onCanGoBack(session: GeckoSession, canGoBack: Boolean) {
                ps.canGoBack = canGoBack
            }

            // Enlaces target=_blank y window.open: se abren en la misma sesión (no hay pestañas)
            override fun onNewSession(session: GeckoSession, uri: String): GeckoResult<GeckoSession>? {
                session.loadUri(uri)
                return GeckoResult.fromValue(null)
            }
        }
        gecko.contentDelegate = object : GeckoSession.ContentDelegate {
            override fun onCrash(session: GeckoSession) = recover(ps, "crash")
            override fun onKill(session: GeckoSession) = recover(ps, "kill")
        }
        BrowserEngine.helper?.let { gecko.webExtensionController.setMessageDelegate(it, HelperMessages, "browser") }
        ExtensionBridge.attach(gecko)
    }

    /** El proceso de contenido murió (p. ej. poca memoria): se reabre la sesión y se recarga la última página. */
    private fun recover(ps: ProfileSession, reason: String) {
        Log.w(TAG, "session ${ps.profileId} $reason, reopening")
        val url = ps.lastUrl.ifEmpty { XUrls.HOME }
        ps.gecko.close()
        ps.gecko.open(BrowserEngine.currentRuntime() ?: return)
        ps.gecko.loadUri(url)
        BrowserHost.activity?.reattach(ps)
    }

    private fun notifyChanged() {
        val ids = ids()
        listeners.forEach { it.onChanged(ids) }
    }
}
