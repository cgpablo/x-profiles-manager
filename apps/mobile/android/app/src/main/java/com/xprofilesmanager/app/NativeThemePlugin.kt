package com.xprofilesmanager.app

import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

/** Recibe el tema ya resuelto del gestor (light | dark | dim) para las barras del sistema y el navegador nativo. */
@CapacitorPlugin(name = "NativeTheme")
class NativeThemePlugin : Plugin() {
    @PluginMethod
    fun setTheme(call: PluginCall) {
        val theme = call.getString("theme") ?: "dim"
        NativeTheme.set(context, theme)
        MainActivity.lightBars = NativeTheme.palette.light
        (activity as? MainActivity)?.let { main -> main.runOnUiThread { main.useLightSystemBarIcons() } }
        call.resolve()
    }
}
