package com.xprofilesmanager.app.browser

import android.content.Context
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.RectF
import android.util.AttributeSet
import android.view.View

/**
 * Barra del divisor del panel de perfiles, con un asa en el centro. Se ve siempre, también con el panel oculto, para
 * indicar que hay uno escondido a la derecha: arrastrarla hacia la izquierda lo abre y luego ajusta su ancho.
 */
class GripView @JvmOverloads constructor(context: Context, attrs: AttributeSet? = null) : View(context, attrs) {
    private val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = 0x66FFFFFF }
    private val rect = RectF()

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        val dp = resources.displayMetrics.density
        val w = 4 * dp
        val h = 48 * dp
        rect.set((width - w) / 2f, (height - h) / 2f, (width + w) / 2f, (height + h) / 2f)
        canvas.drawRoundRect(rect, w / 2f, w / 2f, paint)
    }
}
