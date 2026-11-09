package com.xprofilesmanager.app.browser

import android.os.Handler
import android.os.Looper
import android.view.KeyCharacterMap
import android.view.KeyEvent
import android.view.View

/**
 * Escribe con eventos de teclado reales de Android (los trata Gecko como entrada de confianza, igual que
 * hacía CDP en desktop). Las credenciales no pasan nunca por el JavaScript de la página.
 */
object KeyTyper {
    private val handler = Handler(Looper.getMainLooper())

    fun type(view: View, text: String, delayMs: Long, done: () -> Unit) {
        view.requestFocus()
        val map = KeyCharacterMap.load(KeyCharacterMap.VIRTUAL_KEYBOARD)
        var i = 0
        fun step() {
            if (i >= text.length) {
                done()
                return
            }
            map.getEvents(charArrayOf(text[i]))?.forEach { view.dispatchKeyEvent(it) }
            i++
            handler.postDelayed({ step() }, delayMs)
        }
        step()
    }

    fun press(view: View, keyCode: Int) {
        view.requestFocus()
        view.dispatchKeyEvent(KeyEvent(KeyEvent.ACTION_DOWN, keyCode))
        view.dispatchKeyEvent(KeyEvent(KeyEvent.ACTION_UP, keyCode))
    }

    fun later(delayMs: Long, action: () -> Unit) {
        handler.postDelayed(action, delayMs)
    }
}
