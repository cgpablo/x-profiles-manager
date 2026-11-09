package com.xprofilesmanager.app

import android.app.Activity
import android.content.Intent
import android.net.Uri
import androidx.activity.result.ActivityResult
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.ActivityCallback
import com.getcapacitor.annotation.CapacitorPlugin

/**
 * Guarda un fichero ya existente (por ejemplo, un backup en la caché de la app) donde el usuario elija,
 * con el cuadro "Guardar como…" del sistema (Storage Access Framework): Descargas, almacenamiento
 * interno, Drive, etc. No necesita permisos de almacenamiento.
 */
@CapacitorPlugin(name = "FileSaver")
class FileSaverPlugin : Plugin() {

    @PluginMethod
    fun save(call: PluginCall) {
        if (call.getString("uri").isNullOrEmpty()) {
            call.reject("Falta el parámetro 'uri'")
            return
        }
        val intent = Intent(Intent.ACTION_CREATE_DOCUMENT).apply {
            addCategory(Intent.CATEGORY_OPENABLE)
            type = call.getString("mimeType") ?: "application/octet-stream"
            putExtra(Intent.EXTRA_TITLE, call.getString("fileName") ?: "file")
        }
        startActivityForResult(call, intent, "saveResult")
    }

    @ActivityCallback
    private fun saveResult(call: PluginCall?, result: ActivityResult) {
        if (call == null) return
        val target = result.data?.data
        if (result.resultCode != Activity.RESULT_OK || target == null) {
            call.resolve(JSObject().put("saved", false))
            return
        }
        val source = Uri.parse(call.getString("uri"))
        // La copia puede ser grande: fuera del hilo principal
        Thread {
            try {
                val resolver = context.contentResolver
                resolver.openInputStream(source).use { input ->
                    resolver.openOutputStream(target, "wt").use { output ->
                        checkNotNull(input) { "No se puede leer el origen" }
                        checkNotNull(output) { "No se puede escribir en el destino" }
                        input.copyTo(output)
                    }
                }
                call.resolve(JSObject().put("saved", true).put("uri", target.toString()))
            } catch (e: Exception) {
                call.reject("No se pudo guardar el fichero: ${e.message}", e)
            }
        }.start()
    }
}
