package com.xprofilesmanager.app.browser

import android.content.Context
import android.os.Handler
import android.os.Looper
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
        ps.tabs.toList().forEach { it.gecko?.close(); it.gecko = null }
        ps.tabs.clear()
        ps.activeTab = null
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
        sessions.values.forEach { ps -> ps.allGeckos().forEach { it.webExtensionController.setMessageDelegate(helper, HelperMessages, "browser") } }
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

            // target=_blank y window.open: van a una pestaña secundaria, para no sacar a la principal de su página
            override fun onNewSession(session: GeckoSession, uri: String): GeckoResult<GeckoSession>? {
                openTab(ps, uri, activate = true)
                return GeckoResult.fromValue(null)
            }
        }
        gecko.contentDelegate = object : GeckoSession.ContentDelegate {
            override fun onCrash(session: GeckoSession) = recover(ps, "crash")
            override fun onKill(session: GeckoSession) = recover(ps, "kill")
            override fun onContextMenu(
                session: GeckoSession,
                screenX: Int,
                screenY: Int,
                element: GeckoSession.ContentDelegate.ContextElement
            ) {
                element.linkUri?.let { BrowserHost.activity?.showLinkMenu(ps, it) }
            }
        }
        BrowserEngine.helper?.let { gecko.webExtensionController.setMessageDelegate(it, HelperMessages, "browser") }
        ExtensionBridge.attach(gecko)
    }

    // ---- Pestañas secundarias ----

    private const val MAX_TABS = 5
    private const val IDLE_MS = 10 * 60 * 1000L
    private const val SWEEP_MS = 60 * 1000L
    private val handler = Handler(Looper.getMainLooper())
    private var sweeping = false

    /** Abre una pestaña secundaria. Si ya hay `MAX_TABS`, cierra la menos reciente que no se esté mostrando. */
    fun openTab(ps: ProfileSession, url: String, activate: Boolean): Tab? {
        val runtime = BrowserEngine.currentRuntime() ?: return null
        if (ps.tabs.size >= MAX_TABS) {
            val oldest = ps.tabs.filter { it !== ps.activeTab }.minByOrNull { it.lastActive } ?: return null
            closeTab(ps, oldest)
        }
        val tab = Tab(null, url)
        ps.tabs.add(tab)
        startTabSession(ps, tab, runtime)
        if (activate) selectTab(ps, tab)
        scheduleSweep()
        BrowserHost.activity?.tabsChanged()
        return tab
    }

    /** Muestra la pestaña (null = la principal). Si estaba descargada, se vuelve a crear y carga su última URL. */
    fun selectTab(ps: ProfileSession, tab: Tab?) {
        val now = System.currentTimeMillis()
        ps.activeTab?.lastActive = now
        if (tab != null && tab.gecko == null) {
            val runtime = BrowserEngine.currentRuntime() ?: return
            startTabSession(ps, tab, runtime)
        }
        tab?.lastActive = now
        ps.activeTab = tab
        BrowserHost.activity?.showCurrent()
        BrowserHost.activity?.tabsChanged()
    }

    /** Los flujos automáticos (login, PIN, chat) van siempre en la principal. */
    fun focusMain(ps: ProfileSession) {
        if (ps.activeTab != null) selectTab(ps, null)
    }

    fun closeTab(ps: ProfileSession, tab: Tab) {
        if (!ps.tabs.remove(tab)) return
        if (ps.activeTab === tab) {
            ps.activeTab = null
            BrowserHost.activity?.showCurrent()
        }
        tab.gecko?.close()
        tab.gecko = null
        BrowserHost.activity?.tabsChanged()
    }

    private fun startTabSession(ps: ProfileSession, tab: Tab, runtime: org.mozilla.geckoview.GeckoRuntime) {
        val gecko = GeckoSession(GeckoSessionSettings.Builder().contextId(ps.profileId).build())
        tab.gecko = gecko
        gecko.promptDelegate = PromptHandler.delegate
        gecko.navigationDelegate = object : GeckoSession.NavigationDelegate {
            override fun onLocationChange(
                session: GeckoSession,
                url: String?,
                perms: MutableList<GeckoSession.PermissionDelegate.ContentPermission>,
                hasUserGesture: Boolean
            ) {
                if (url != null) tab.url = url
            }

            override fun onCanGoBack(session: GeckoSession, canGoBack: Boolean) {
                tab.canGoBack = canGoBack
            }

            override fun onNewSession(session: GeckoSession, uri: String): GeckoResult<GeckoSession>? {
                openTab(ps, uri, activate = true)
                return GeckoResult.fromValue(null)
            }
        }
        gecko.contentDelegate = object : GeckoSession.ContentDelegate {
            override fun onTitleChange(session: GeckoSession, title: String?) {
                tab.title = title.orEmpty()
                BrowserHost.activity?.tabsChanged()
            }

            override fun onContextMenu(
                session: GeckoSession,
                screenX: Int,
                screenY: Int,
                element: GeckoSession.ContentDelegate.ContextElement
            ) {
                element.linkUri?.let { BrowserHost.activity?.showLinkMenu(ps, it) }
            }

            override fun onCrash(session: GeckoSession) = recoverTab(ps, tab)
            override fun onKill(session: GeckoSession) = recoverTab(ps, tab)
        }
        BrowserEngine.helper?.let { gecko.webExtensionController.setMessageDelegate(it, HelperMessages, "browser") }
        ExtensionBridge.attach(gecko)
        gecko.open(runtime)
        gecko.loadUri(tab.url.ifEmpty { XUrls.HOME })
    }

    private fun recoverTab(ps: ProfileSession, tab: Tab) {
        val gecko = tab.gecko ?: return
        val runtime = BrowserEngine.currentRuntime() ?: return
        gecko.close()
        gecko.open(runtime)
        gecko.loadUri(tab.url.ifEmpty { XUrls.HOME })
        if (ps.activeTab === tab) BrowserHost.activity?.showCurrent(force = true)
    }

    private fun scheduleSweep() {
        if (sweeping) return
        sweeping = true
        handler.postDelayed({ sweep() }, SWEEP_MS)
    }

    /** Descarga las pestañas secundarias que llevan `IDLE_MS` sin mostrarse: se cierra su sesión y queda solo la URL. */
    private fun sweep() {
        val now = System.currentTimeMillis()
        var anyTabs = false
        for (ps in sessions.values) {
            for (tab in ps.tabs) {
                anyTabs = true
                val gecko = tab.gecko ?: continue
                if (BrowserHost.activity?.isDisplaying(gecko) == true) {
                    tab.lastActive = now
                } else if (now - tab.lastActive >= IDLE_MS) {
                    if (ps.activeTab === tab) ps.activeTab = null
                    gecko.close()
                    tab.gecko = null
                    tab.canGoBack = false
                    BrowserHost.activity?.tabsChanged()
                }
            }
        }
        if (anyTabs) handler.postDelayed({ sweep() }, SWEEP_MS) else sweeping = false
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
