package com.xprofilesmanager.app.browser

import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.view.MotionEvent
import android.view.View

/**
 * Toca la pantalla con eventos táctiles reales (los trata Gecko como entrada de confianza). Es el plan B cuando el
 * clic sintético del content script no activa un control de X.
 */
object Tapper {
    private val handler = Handler(Looper.getMainLooper())

    /** `x` e `y` en píxeles de la vista (px CSS de la página × `devicePixelRatio`). */
    fun tap(view: View, x: Float, y: Float) {
        val downTime = SystemClock.uptimeMillis()
        val down = MotionEvent.obtain(downTime, downTime, MotionEvent.ACTION_DOWN, x, y, 0)
        view.dispatchTouchEvent(down)
        down.recycle()
        handler.postDelayed({
            val upTime = SystemClock.uptimeMillis()
            val up = MotionEvent.obtain(downTime, upTime, MotionEvent.ACTION_UP, x, y, 0)
            view.dispatchTouchEvent(up)
            up.recycle()
        }, 70)
    }
}
