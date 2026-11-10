package com.xprofilesmanager.app.browser

import android.app.AlertDialog
import org.mozilla.geckoview.GeckoResult
import org.mozilla.geckoview.GeckoSession
import org.mozilla.geckoview.GeckoSession.PromptDelegate
import org.mozilla.geckoview.GeckoSession.PromptDelegate.ChoicePrompt
import org.mozilla.geckoview.GeckoSession.PromptDelegate.PromptResponse

/**
 * GeckoView no dibuja desplegables, alertas ni confirmaciones: los tiene que mostrar la app.
 * Se usa en todas las sesiones, incluidas las de los popups de extensiones.
 */
object PromptHandler {
    val delegate = object : PromptDelegate {
        override fun onChoicePrompt(session: GeckoSession, prompt: ChoicePrompt): GeckoResult<PromptResponse>? {
            val activity = BrowserHost.activity ?: return GeckoResult.fromValue(prompt.dismiss())
            val result = GeckoResult<PromptResponse>()
            val flat = mutableListOf<ChoicePrompt.Choice>()
            fun collect(items: Array<ChoicePrompt.Choice>?) {
                items?.forEach { c ->
                    if (c.separator) return@forEach
                    if (c.items != null && c.items!!.isNotEmpty()) collect(c.items) else flat.add(c)
                }
            }
            collect(prompt.choices)
            val labels = flat.map { it.label ?: "" }.toTypedArray()
            val builder = AlertDialog.Builder(activity)
            prompt.message?.takeIf { it.isNotEmpty() }?.let { builder.setTitle(it) }
            if (prompt.type == ChoicePrompt.Type.MULTIPLE) {
                val checked = BooleanArray(flat.size) { flat[it].selected }
                builder.setMultiChoiceItems(labels, checked) { _, i, on -> checked[i] = on }
                builder.setPositiveButton(android.R.string.ok) { _, _ ->
                    result.complete(prompt.confirm(flat.filterIndexed { i, _ -> checked[i] }.toTypedArray()))
                }
                builder.setNegativeButton(android.R.string.cancel) { _, _ -> result.complete(prompt.dismiss()) }
            } else {
                builder.setItems(labels) { _, i -> result.complete(prompt.confirm(flat[i])) }
            }
            builder.setOnCancelListener { if (!prompt.isComplete) result.complete(prompt.dismiss()) }
            builder.show()
            return result
        }

        override fun onAlertPrompt(session: GeckoSession, prompt: PromptDelegate.AlertPrompt): GeckoResult<PromptResponse>? {
            val activity = BrowserHost.activity ?: return GeckoResult.fromValue(prompt.dismiss())
            val result = GeckoResult<PromptResponse>()
            AlertDialog.Builder(activity)
                .setMessage(prompt.message)
                .setPositiveButton(android.R.string.ok) { _, _ -> result.complete(prompt.dismiss()) }
                .setOnCancelListener { result.complete(prompt.dismiss()) }
                .show()
            return result
        }

        override fun onButtonPrompt(session: GeckoSession, prompt: PromptDelegate.ButtonPrompt): GeckoResult<PromptResponse>? {
            val activity = BrowserHost.activity ?: return GeckoResult.fromValue(prompt.dismiss())
            val result = GeckoResult<PromptResponse>()
            AlertDialog.Builder(activity)
                .setMessage(prompt.message)
                .setPositiveButton(android.R.string.ok) { _, _ ->
                    result.complete(prompt.confirm(PromptDelegate.ButtonPrompt.Type.POSITIVE))
                }
                .setNegativeButton(android.R.string.cancel) { _, _ ->
                    result.complete(prompt.confirm(PromptDelegate.ButtonPrompt.Type.NEGATIVE))
                }
                .setOnCancelListener { result.complete(prompt.dismiss()) }
                .show()
            return result
        }
    }
}
