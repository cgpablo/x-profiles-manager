package com.xprofilesmanager.app.browser

import android.util.Log
import android.view.KeyEvent
import org.json.JSONObject
import org.mozilla.geckoview.GeckoResult
import org.mozilla.geckoview.WebExtension

/**
 * Mensajes de la extensión interna "X Profiles Helper" (su content script avisa del paso del login en el que está
 * la página). Kotlin teclea usuario y contraseña con teclado real, así que nunca pasan por el JS de la página.
 *
 * Importante: la respuesta de `onMessage` debe ser un String (JSON serializado), no un JSONObject: con un
 * JSONObject el puente de GeckoView falla con "Invalid event data for callback".
 */
object HelperMessages : WebExtension.MessageDelegate {
    private const val TAG = "XBrowser"

    override fun onMessage(nativeApp: String, message: Any, sender: WebExtension.MessageSender): GeckoResult<Any>? {
        val msg = message as? JSONObject ?: return null
        val gecko = sender.session ?: return null
        val ps = SessionRegistry.forGecko(gecko)
            // Pestaña secundaria: los flujos automáticos solo existen en la principal
            ?: return reply(JSONObject().put("task", "none").put("userDone", false).put("ok", false))
        val task = ps.loginTask
        return when (msg.optString("type")) {
            "hello" -> {
                val post = ps.postTask
                if (post != null) {
                    // Post Helper: la página recibe qué publicar (modo, textos, imágenes) y lo hace ella
                    reply(JSONObject().put("task", "post").put("payload", post.payload))
                } else {
                    reply(
                        JSONObject()
                            .put("task", if (task != null) "login" else "none")
                            .put("userDone", task?.userDone ?: false)
                    )
                }
            }
            "tap" -> {
                // Plan B del clic: toque real en las coordenadas (px CSS) que indica la página
                val view = BrowserHost.viewShowing(ps)
                if (view == null) {
                    reply(JSONObject().put("ok", false))
                } else {
                    val dpr = msg.optDouble("dpr", 1.0).toFloat()
                    Tapper.tap(view, msg.optDouble("x").toFloat() * dpr, msg.optDouble("y").toFloat() * dpr)
                    reply(JSONObject().put("ok", true))
                }
            }
            "postDone" -> {
                val post = ps.postTask
                ps.postTask = null
                val ok = msg.optBoolean("ok")
                val reason = msg.optString("reason").takeIf { it.isNotEmpty() }
                Log.i(TAG, "post ${if (ok) "done" else "failed: $reason"}")
                post?.finish(ok, reason)
                reply(JSONObject().put("ok", true))
            }
            "typeUsername" -> typeStep(ps, task?.username) { task?.userDone = true }
            "typePassword" -> typeStep(ps, task?.password) {
                ps.loginTask = null
                task?.finish(true)
            }
            "log" -> {
                Log.i(TAG, "helper: ${msg.optString("text")}")
                reply(JSONObject().put("ok", true))
            }
            else -> reply(JSONObject().put("ok", false))
        }
    }

    private fun reply(json: JSONObject): GeckoResult<Any> = GeckoResult.fromValue(json.toString() as Any)

    /** Teclea el texto y pulsa Enter, pero solo si ese perfil se está mostrando (es donde Gecko recibe las teclas). */
    private fun typeStep(ps: ProfileSession, text: String?, after: () -> Unit): GeckoResult<Any> {
        val view = BrowserHost.viewShowing(ps)
        if (text == null || view == null) return reply(JSONObject().put("ok", false))
        val result = GeckoResult<Any>()
        KeyTyper.type(view, text, 120) {
            KeyTyper.press(view, KeyEvent.KEYCODE_ENTER)
            after()
            result.complete(JSONObject().put("ok", true).toString() as Any)
        }
        return result
    }
}
