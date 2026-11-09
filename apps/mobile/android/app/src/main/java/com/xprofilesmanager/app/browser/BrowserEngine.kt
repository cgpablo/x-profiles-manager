package com.xprofilesmanager.app.browser

import android.content.Context
import android.util.Log
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

    private var runtime: GeckoRuntime? = null

    var helper: WebExtension? = null
        private set

    fun currentRuntime(): GeckoRuntime? = runtime

    /** Debe llamarse desde el hilo principal. */
    @Synchronized
    fun runtime(context: Context): GeckoRuntime {
        runtime?.let { return it }
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
