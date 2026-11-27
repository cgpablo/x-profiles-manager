package com.xprofilesmanager.app.browser

import android.content.Context
import android.view.MotionEvent
import android.view.ViewConfiguration
import android.widget.FrameLayout
import kotlin.math.abs

/**
 * Contenedor que detecta un gesto horizontal largo hacia `direction` (+1 derecha, -1 izquierda) y lo toma para sí:
 * los hijos reciben CANCEL y se llama a `onSwipe`. Los gestos verticales (scroll de la lista) pasan de largo.
 */
class SwipeLayout(
    context: Context,
    private val direction: Int,
    private val onSwipe: () -> Unit
) : FrameLayout(context) {
    private val slop = ViewConfiguration.get(context).scaledTouchSlop
    private val threshold = 56 * resources.displayMetrics.density
    private var startX = 0f
    private var startY = 0f
    private var tracking = false

    override fun onInterceptTouchEvent(ev: MotionEvent): Boolean {
        when (ev.actionMasked) {
            MotionEvent.ACTION_DOWN -> {
                startX = ev.x
                startY = ev.y
                tracking = true
            }
            MotionEvent.ACTION_MOVE -> if (tracking) {
                val dx = (ev.x - startX) * direction
                val dy = abs(ev.y - startY)
                if (dx > threshold && dx > dy * 2) {
                    tracking = false
                    onSwipe()
                    return true
                }
                // Si ya va claramente en vertical, es un scroll: se deja de vigilar
                if (dy > slop * 3 && dy > abs(ev.x - startX)) tracking = false
            }
            MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> tracking = false
        }
        return false
    }

    // Tras interceptar, el resto del gesto se consume aquí
    override fun onTouchEvent(event: MotionEvent): Boolean = true
}
