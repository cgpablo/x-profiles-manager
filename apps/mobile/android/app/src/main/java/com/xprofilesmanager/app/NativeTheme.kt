package com.xprofilesmanager.app

import android.content.Context
import androidx.core.graphics.ColorUtils
import java.util.concurrent.CopyOnWriteArrayList

/**
 * Tema de la app para las pantallas nativas (el navegador GeckoView). El gestor (web) lo elige y lo envía ya
 * resuelto (`light`, `dark` o `dim`); aquí se guarda para que el navegador lo tenga también al arrancar en frío.
 * Las paletas son las mismas que las de `packages/ui/src/theme.css`.
 */
object NativeTheme {
    class Palette(
        val light: Boolean,
        val bg: Int,
        val bar: Int,
        val surface: Int,
        val border: Int,
        val text: Int,
        val muted: Int,
        val primary: Int,
        val success: Int,
        val favoriteFill: Int,
        val favoriteStroke: Int
    ) {
        /** Fila de un perfil abierto: el color de acento muy suave sobre la barra. */
        val rowActive: Int get() = ColorUtils.compositeColors(ColorUtils.setAlphaComponent(primary, 46), bar)
    }

    private val DIM = Palette(
        light = false, bg = 0xFF15202B.toInt(), bar = 0xFF1E2732.toInt(), surface = 0xFF28323D.toInt(),
        border = 0xFF38444D.toInt(), text = 0xFFF7F9F9.toInt(), muted = 0xFF8B98A5.toInt(),
        primary = 0xFF3B82F6.toInt(), success = 0xFF22C55E.toInt(),
        favoriteFill = 0xFF78350F.toInt(), favoriteStroke = 0xFFF59E0B.toInt()
    )
    private val DARK = Palette(
        light = false, bg = 0xFF000000.toInt(), bar = 0xFF111111.toInt(), surface = 0xFF1F1F1F.toInt(),
        border = 0xFF2E2E2E.toInt(), text = 0xFFF5F5F5.toInt(), muted = 0xFFA3A3A3.toInt(),
        primary = 0xFF3B82F6.toInt(), success = 0xFF22C55E.toInt(),
        favoriteFill = 0xFF78350F.toInt(), favoriteStroke = 0xFFF59E0B.toInt()
    )
    private val LIGHT = Palette(
        light = true, bg = 0xFFF3F4F6.toInt(), bar = 0xFFFFFFFF.toInt(), surface = 0xFFE5E7EB.toInt(),
        border = 0xFFD1D5DB.toInt(), text = 0xFF111827.toInt(), muted = 0xFF4B5563.toInt(),
        primary = 0xFF2563EB.toInt(), success = 0xFF16A34A.toInt(),
        favoriteFill = 0xFFFEF3C7.toInt(), favoriteStroke = 0xFFF59E0B.toInt()
    )

    private const val PREFS = "native_theme"
    private const val KEY = "theme"

    fun interface Listener {
        fun onChanged()
    }

    private val listeners = CopyOnWriteArrayList<Listener>()
    fun addListener(l: Listener) = listeners.add(l)
    fun removeListener(l: Listener) = listeners.remove(l)

    @Volatile
    var palette: Palette = DIM
        private set

    private var loaded = false

    private fun paletteFor(name: String?) = when (name) {
        "light" -> LIGHT
        "dark" -> DARK
        else -> DIM
    }

    /** Carga el último tema guardado (una sola vez por proceso). */
    fun load(context: Context) {
        if (loaded) return
        loaded = true
        palette = paletteFor(context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY, null))
    }

    fun set(context: Context, name: String) {
        loaded = true
        context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(KEY, name).apply()
        val next = paletteFor(name)
        if (next === palette) return
        palette = next
        listeners.forEach { it.onChanged() }
    }
}
