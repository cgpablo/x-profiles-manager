package com.xprofilesmanager.app

import android.content.Intent
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.xprofilesmanager.app.browser.BrowserActivity
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
}
