package com.xprofilesmanager.app

import android.content.Intent
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import org.json.JSONArray
import org.json.JSONObject
import com.xprofilesmanager.app.browser.BrowserActivity
import com.xprofilesmanager.app.browser.KeyTyper
import com.xprofilesmanager.app.browser.PostTask
import com.xprofilesmanager.app.browser.SessionRegistry
import com.xprofilesmanager.app.browser.XFlows
import com.xprofilesmanager.app.browser.XUrls

/**
 * Puente entre el core (JS) y el navegador GeckoView. Es la implementación Android de `BrowserLauncher`.
 * Los métodos de Gecko deben ejecutarse en el hilo principal.
 */
@CapacitorPlugin(name = "ProfileBrowser")
class ProfileBrowserPlugin : Plugin() {

    private val listener = SessionRegistry.Listener { ids ->
        notifyListeners("sessionsChanged", JSObject().put("profileIds", JSArray(ids)))
    }

    override fun load() {
        SessionRegistry.addListener(listener)
    }

    override fun handleOnDestroy() {
        SessionRegistry.removeListener(listener)
    }

    /** Ejecuta en el hilo principal y convierte cualquier excepción en un rechazo de la llamada. */
    private fun onMain(call: PluginCall, block: () -> Unit) {
        activity.runOnUiThread {
            try {
                block()
            } catch (e: Exception) {
                call.reject(e.message ?: "Error en el navegador", e)
            }
        }
    }

    private fun profileId(call: PluginCall): String? {
        val id = call.getString("profileId")
        if (id.isNullOrEmpty()) call.reject("Falta 'profileId'")
        return id
    }

    /** Abre (o recupera) la sesión y guarda en memoria las credenciales del perfil, si las hay. */
    private fun openSession(call: PluginCall, id: String, url: String?): com.xprofilesmanager.app.browser.ProfileSession {
        val ps = SessionRegistry.open(context, id, call.getString("name"), call.getString("color"), url)
        ps.username = call.getString("username")
        ps.password = call.getString("password")
        ps.chatPin = call.getString("pin")
        return ps
    }

    private fun showBrowser(profileId: String) {
        val intent = Intent(activity, BrowserActivity::class.java)
            .putExtra(BrowserActivity.EXTRA_PROFILE_ID, profileId)
            .addFlags(Intent.FLAG_ACTIVITY_REORDER_TO_FRONT or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        activity.startActivity(intent)
    }

    /** El gestor entrega perfiles y carpetas para el panel lateral del navegador. */
    @PluginMethod
    fun syncProfiles(call: PluginCall) {
        val array = call.getArray("profiles") ?: JSArray()
        val list = (0 until array.length()).mapNotNull { i ->
            val o = array.optJSONObject(i) ?: return@mapNotNull null
            com.xprofilesmanager.app.browser.ProfileDirectory.Entry(
                o.getString("id"),
                o.optString("name"),
                o.optString("color").takeIf { it.isNotEmpty() },
                o.optBoolean("starred"),
                o.optString("account").takeIf { it.isNotEmpty() },
                o.optString("folderId").takeIf { it.isNotEmpty() },
                o.optString("username").takeIf { it.isNotEmpty() },
                o.optString("password").takeIf { it.isNotEmpty() },
                o.optString("pin").takeIf { it.isNotEmpty() }
            )
        }
        val folderArray = call.getArray("folders") ?: JSArray()
        val folders = (0 until folderArray.length()).mapNotNull { i ->
            val o = folderArray.optJSONObject(i) ?: return@mapNotNull null
            com.xprofilesmanager.app.browser.ProfileDirectory.Folder(
                o.getString("id"),
                o.optString("name"),
                o.optString("color").takeIf { it.isNotEmpty() }
            )
        }
        activity.runOnUiThread { com.xprofilesmanager.app.browser.ProfileDirectory.set(list, folders) }
        call.resolve()
    }

    @PluginMethod
    fun launch(call: PluginCall) = onMain(call) {
        val id = profileId(call) ?: return@onMain
        val ps = openSession(call, id, call.getString("url"))
        showBrowser(id)
        call.resolve(JSObject().put("startTime", ps.startTime))
    }

    @PluginMethod
    fun focus(call: PluginCall) = onMain(call) {
        val id = profileId(call) ?: return@onMain
        val exists = SessionRegistry.get(id) != null
        if (exists) showBrowser(id)
        call.resolve(JSObject().put("focused", exists))
    }

    @PluginMethod
    fun close(call: PluginCall) = onMain(call) {
        val id = profileId(call) ?: return@onMain
        call.resolve(JSObject().put("closed", SessionRegistry.close(id)))
    }

    @PluginMethod
    fun closeAll(call: PluginCall) = onMain(call) {
        call.resolve(JSObject().put("count", SessionRegistry.closeAll()))
    }

    @PluginMethod
    fun getActive(call: PluginCall) = onMain(call) {
        call.resolve(JSObject().put("profileIds", JSArray(SessionRegistry.ids())))
    }

    /** Mantiene al día el nombre y el color que se muestran en la barra de perfiles. */
    @PluginMethod
    fun updateProfile(call: PluginCall) = onMain(call) {
        val id = profileId(call) ?: return@onMain
        SessionRegistry.update(id, call.getString("name"), call.getString("color"))
        call.resolve()
    }

    @PluginMethod
    fun isLoggedIn(call: PluginCall) = onMain(call) {
        val id = profileId(call) ?: return@onMain
        val url = SessionRegistry.get(id)?.lastUrl.orEmpty()
        call.resolve(JSObject().put("value", XUrls.isLoggedIn(url)))
    }

    @PluginMethod
    fun isOnHomeUrl(call: PluginCall) = onMain(call) {
        val id = profileId(call) ?: return@onMain
        val url = SessionRegistry.get(id)?.lastUrl.orEmpty()
        call.resolve(JSObject().put("value", XUrls.isHomeLike(url)))
    }

    /** Abre el chat del perfil (y lo lanza si no estaba abierto). */
    @PluginMethod
    fun openChat(call: PluginCall) = onMain(call) {
        val id = profileId(call) ?: return@onMain
        val existed = SessionRegistry.get(id) != null
        val ps = openSession(call, id, XUrls.CHAT)
        if (existed) XFlows.openChat(ps, null)
        showBrowser(id)
        call.resolve(JSObject().put("value", true))
    }

    /** Abre una URL en el perfil (y lo lanza si no estaba abierto). */
    @PluginMethod
    fun openUrl(call: PluginCall) = onMain(call) {
        val id = profileId(call) ?: return@onMain
        val url = call.getString("url")
        if (url.isNullOrEmpty()) {
            call.reject("Falta 'url'")
            return@onMain
        }
        val existed = SessionRegistry.get(id) != null
        val ps = openSession(call, id, url)
        if (existed) {
            SessionRegistry.focusMain(ps)
            ps.gecko.loadUri(url)
        }
        showBrowser(id)
        call.resolve(JSObject().put("value", true))
    }

    /**
     * Post Helper: abre `url`, deja la publicación pendiente y responde cuando el content script termina (o falla).
     * El content script escribe el texto, pulsa los controles de X y adjunta las imágenes; nunca publica.
     */
    private fun startPost(call: PluginCall, id: String, url: String, payload: JSONObject) {
        val existed = SessionRegistry.get(id) != null
        val ps = openSession(call, id, url)
        ps.postTask?.finish(false, "Replaced by another post")
        val task = PostTask(payload) { ok, reason ->
            if (ok) call.resolve(JSObject().put("value", true))
            else call.reject(reason ?: "Could not complete the post")
        }
        ps.postTask = task
        if (existed) {
            SessionRegistry.focusMain(ps)
            ps.gecko.loadUri(url)
        }
        KeyTyper.later(POST_TIMEOUT_MS) {
            if (ps.postTask === task) {
                ps.postTask = null
                task.finish(false, "Timed out waiting for X (is the profile logged in?)")
            }
        }
        showBrowser(id)
    }

    /** Hilo: rellena el compositor con un post por texto (las imágenes van al primero). */
    @PluginMethod
    fun openThread(call: PluginCall) = onMain(call) {
        val id = profileId(call) ?: return@onMain
        val texts = call.getArray("texts")
        if (texts == null || texts.length() == 0) {
            call.reject("Falta 'texts'")
            return@onMain
        }
        val payload = JSONObject()
            .put("mode", "thread")
            .put("texts", texts)
            .put("images", call.getArray("images") ?: JSONArray())
        startPost(call, id, XUrls.COMPOSE, payload)
    }

    /** Cita: abre el tweet, pulsa repostear > Quote y escribe el texto. */
    @PluginMethod
    fun openQuote(call: PluginCall) = postOnTweet(call, "quote")

    /** Respuesta: abre el tweet y escribe la respuesta en su cuadro. */
    @PluginMethod
    fun openReply(call: PluginCall) = postOnTweet(call, "reply")

    private fun postOnTweet(call: PluginCall, mode: String) = onMain(call) {
        val id = profileId(call) ?: return@onMain
        val tweetId = call.getString("tweetId")
        val text = call.getString("text")
        if (tweetId.isNullOrEmpty() || text.isNullOrBlank()) {
            call.reject("Faltan 'tweetId' o 'text'")
            return@onMain
        }
        val payload = JSONObject()
            .put("mode", mode)
            .put("tweetId", tweetId)
            .put("texts", JSONArray().put(text))
            .put("images", call.getArray("images") ?: JSONArray())
        startPost(call, id, XUrls.status(tweetId), payload)
    }

    /** Abre el chat y, si hay PIN, lo teclea al llegar a la recuperación. Sin PIN solo abre el chat. */
    @PluginMethod
    fun fillPinRecovery(call: PluginCall) = onMain(call) {
        val id = profileId(call) ?: return@onMain
        val existed = SessionRegistry.get(id) != null
        val ps = openSession(call, id, XUrls.CHAT)
        // Si la sesión es nueva ya carga el chat al abrirse: solo hay que dejar el PIN pendiente
        XFlows.openChat(ps, call.getString("pin"), navigate = existed)
        showBrowser(id)
        call.resolve(JSObject().put("value", true))
    }

    /** Inicia sesión en X. Responde cuando se ha escrito la contraseña (true) o se agota el tiempo (false). */
    @PluginMethod
    fun autoLogin(call: PluginCall) = onMain(call) {
        val id = profileId(call) ?: return@onMain
        val username = call.getString("username").orEmpty()
        val password = call.getString("password").orEmpty()
        if (username.isEmpty() || password.isEmpty()) {
            call.reject("Faltan usuario o contraseña")
            return@onMain
        }
        val ps = openSession(call, id, XUrls.HOME)
        showBrowser(id)
        XFlows.startLogin(ps, username, password) { success ->
            call.resolve(JSObject().put("value", success))
        }
    }

    private companion object {
        const val POST_TIMEOUT_MS = 240_000L
    }
}
