package com.xprofilesmanager.app.browser

import android.content.Context
import android.util.Log
import org.mozilla.geckoview.AllowOrDeny
import org.mozilla.geckoview.GeckoResult
import org.mozilla.geckoview.GeckoRuntime
import org.mozilla.geckoview.WebExtension
import org.mozilla.geckoview.WebExtensionController

/** El motor GeckoView: un único `GeckoRuntime` para toda la app, con las extensiones preparadas. */
object BrowserEngine {
    private const val TAG = "XBrowser"
    private const val HELPER_URI = "resource://android/assets/messaging/"
    private const val HELPER_ID = "xprofiles-helper@local"
    private const val CONTROL_PANEL_ID = "{5cce4ab5-3d47-41b9-af5e-8203eea05245}"
    private const val CONTROL_PANEL_XPI =
        "https://addons.mozilla.org/firefox/downloads/latest/control-panel-for-twitter/latest.xpi"

    private const val PREFS = "extension_updates"
    private const val KEY_LAST_CHECK = "last_check"
    private const val UPDATE_INTERVAL_MS = 12 * 60 * 60 * 1000L

    private var runtime: GeckoRuntime? = null
    private var appContext: Context? = null

    /**
     * GeckoView no actualiza las extensiones por su cuenta: hay que pedirlo. Se hace al arrancar el motor, como
     * mucho cada 12 h, o cuando el usuario lo pide (`force`). `onDone` recibe la versión resultante.
     */
    fun checkForUpdate(force: Boolean, onDone: ((String?) -> Unit)? = null) {
        val controller = runtime?.webExtensionController
        val ext = ExtensionBridge.extension
        val prefs = appContext?.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        if (controller == null || ext == null || prefs == null) { onDone?.invoke(null); return }
        val now = System.currentTimeMillis()
        if (!force && now - prefs.getLong(KEY_LAST_CHECK, 0) < UPDATE_INTERVAL_MS) { onDone?.invoke(null); return }
        prefs.edit().putLong(KEY_LAST_CHECK, now).apply()
        controller.update(ext).accept(
            { updated ->
                // Sin actualización disponible, Gecko devuelve null
                val target = updated ?: ext
                if (updated != null) ExtensionBridge.bind(updated)
                Log.i(TAG, "Control Panel update check: ${target.metaData.version}, updated=${updated != null}")
                onDone?.invoke(target.metaData.version)
            },
            { err -> Log.e(TAG, "Control Panel update failed", err); onDone?.invoke(null) }
        )
    }

    var helper: WebExtension? = null
        private set

    fun currentRuntime(): GeckoRuntime? = runtime

    /** Debe llamarse desde el hilo principal. */
    @Synchronized
    fun runtime(context: Context): GeckoRuntime {
        runtime?.let { return it }
        appContext = context.applicationContext
        val created = GeckoRuntime.create(context.applicationContext)
        runtime = created
        setUpExtensions(created.webExtensionController)
        return created
    }

    private fun setUpExtensions(controller: WebExtensionController) {
        // Las extensiones son globales a todos los perfiles: se aceptan sus permisos al instalarlas
        controller.promptDelegate = object : WebExtensionController.PromptDelegate {
            override fun onInstallPromptRequest(
                extension: WebExtension,
                permissions: Array<String>,
                origins: Array<String>,
                dataCollectionPermissions: Array<String>
            ): GeckoResult<WebExtension.PermissionPromptResponse>? {
                Log.i(TAG, "installing ${extension.metaData.name} perms=${permissions.toList()} origins=${origins.toList()}")
                return GeckoResult.fromValue(WebExtension.PermissionPromptResponse(true, false, false))
            }

            override fun onUpdatePrompt(
                extension: WebExtension,
                newPermissions: Array<String>,
                newOrigins: Array<String>,
                newDataCollectionPermissions: Array<String>
            ): GeckoResult<AllowOrDeny>? {
                Log.i(TAG, "updating ${extension.metaData.name} newPerms=${newPermissions.toList()} newOrigins=${newOrigins.toList()}")
                return GeckoResult.fromValue(AllowOrDeny.ALLOW)
            }
        }

        controller.ensureBuiltIn(HELPER_URI, HELPER_ID).accept(
            { ext ->
                if (ext != null) {
                    helper = ext
                    SessionRegistry.onHelperReady(ext)
                    Log.i(TAG, "helper ready")
                }
            },
            { err -> Log.e(TAG, "helper install failed", err) }
        )

        controller.list().accept(
            { list ->
                val installed = list?.firstOrNull { it.id == CONTROL_PANEL_ID }
                if (installed != null) {
                    ExtensionBridge.bind(installed)
                    checkForUpdate(force = false)
                } else {
                    Log.i(TAG, "installing Control Panel for Twitter")
                    controller.install(CONTROL_PANEL_XPI).accept(
                        { installedNow ->
                            // El objeto que devuelve install() llega sin la URL de opciones: se pide de nuevo a list()
                            controller.list().accept(
                                { all ->
                                    val ext = all?.firstOrNull { it.id == CONTROL_PANEL_ID } ?: installedNow
                                    ext?.let { ExtensionBridge.bind(it) }
                                },
                                { err -> Log.e(TAG, "extension list failed after install", err) }
                            )
                        },
                        { err -> Log.e(TAG, "Control Panel install failed", err) }
                    )
                }
            },
            { err -> Log.e(TAG, "extension list failed", err) }
        )
    }
}
