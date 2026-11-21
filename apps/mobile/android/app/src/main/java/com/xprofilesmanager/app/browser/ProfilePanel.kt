package com.xprofilesmanager.app.browser

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.text.Editable
import android.text.InputType
import android.text.TextWatcher
import android.view.Gravity
import android.view.View
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import com.xprofilesmanager.app.NativeTheme

/**
 * Panel lateral del navegador: los mismos controles que la cabecera del gestor (favoritos, buscador, cerrar
 * abiertos y copiar la raya) más la lista de perfiles filtrada, para abrir o cambiar de perfil sin volver al gestor.
 */
class ProfilePanel(private val context: Context, private val onOpen: (String) -> Unit) {

    val view: LinearLayout
    private val list: LinearLayout
    private val favoritesChip: TextView
    private val copyButton: TextView
    private val countValue: TextView
    private var onlyFavorites = false
    private var showFolders = true
    private val expanded = mutableSetOf<String>()
    private lateinit var foldersTab: TextView
    private lateinit var profilesTab: TextView
    private var query = ""
    private var dashCount = 1
    private val dp = context.resources.displayMetrics.density

    private fun px(value: Int) = (value * dp).toInt()

    private val palette get() = NativeTheme.palette

    private fun pill(fill: Int, stroke: Int? = null) = GradientDrawable().apply {
        cornerRadius = 20 * dp
        setColor(fill)
        stroke?.let { setStroke((1 * dp).toInt(), it) }
    }

    private val buttons = mutableListOf<TextView>()
    private lateinit var searchField: EditText
    private lateinit var countLabel: TextView

    private fun button(label: String, width: Int? = null) = TextView(context).apply {
        text = label
        textSize = 14f
        gravity = Gravity.CENTER
        minHeight = px(44)
        minWidth = px(44)
        setPadding(px(14), 0, px(14), 0)
        width?.let { layoutParams = LinearLayout.LayoutParams(px(it), LinearLayout.LayoutParams.WRAP_CONTENT) }
        buttons.add(this)
    }

    /** Colores de los controles fijos del panel; se repite al cambiar el tema. */
    private fun restyle() {
        val c = palette
        view.setBackgroundColor(c.bg)
        buttons.forEach {
            it.setTextColor(c.text)
            it.background = pill(c.surface, c.border)
        }
        searchField.setHintTextColor(c.muted)
        searchField.setTextColor(c.text)
        searchField.background = pill(c.bar, c.border)
        countLabel.setTextColor(c.primary)
    }

    init {
        view = LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(px(12), px(12), px(12), px(12))
        }

        // Pestañas: Folders / Profiles
        val tabs = LinearLayout(context)
        foldersTab = button("Folders").apply { setOnClickListener { setMode(true) } }
        profilesTab = button("Profiles").apply { setOnClickListener { setMode(false) } }
        tabs.addView(foldersTab, LinearLayout.LayoutParams(0, -2, 1f).apply { marginEnd = px(8) })
        tabs.addView(profilesTab, LinearLayout.LayoutParams(0, -2, 1f))
        view.addView(tabs, LinearLayout.LayoutParams(-1, -2).apply { bottomMargin = px(8) })

        // Buscador y favoritos en la misma línea
        val searchRow = LinearLayout(context).apply { gravity = Gravity.CENTER_VERTICAL }
        val search = EditText(context).apply {
            hint = "Search profiles..."
            textSize = 15f
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS
            setSingleLine()
            minHeight = px(44)
            setPadding(px(16), 0, px(16), 0)
            addTextChangedListener(object : TextWatcher {
                override fun afterTextChanged(s: Editable?) {
                    query = s?.toString().orEmpty().trim()
                    render()
                }
                override fun beforeTextChanged(s: CharSequence?, st: Int, c: Int, a: Int) {}
                override fun onTextChanged(s: CharSequence?, st: Int, b: Int, c: Int) {}
            })
        }
        searchField = search
        searchRow.addView(search, LinearLayout.LayoutParams(0, -2, 1f).apply { marginEnd = px(8) })
        favoritesChip = button("★ Favorites").apply {
            setOnClickListener {
                onlyFavorites = !onlyFavorites
                render()
            }
        }
        searchRow.addView(favoritesChip)
        view.addView(searchRow, LinearLayout.LayoutParams(-1, -2).apply { bottomMargin = px(8) })

        // Cerrar abiertos + contador y copiar la raya
        val actions = LinearLayout(context).apply { gravity = Gravity.CENTER_VERTICAL }
        val closeAll = button("✕").apply {
            contentDescription = "Close actives"
            androidx.appcompat.widget.TooltipCompat.setTooltipText(this, "Close actives")
            setOnClickListener { SessionRegistry.closeAll() }
        }
        actions.addView(closeAll, LinearLayout.LayoutParams(-2, -2).apply { marginEnd = px(8) })

        val minus = button("−").apply { setOnClickListener { setCount(dashCount - 1) } }
        countValue = TextView(context).apply {
            textSize = 15f
            gravity = Gravity.CENTER
            minWidth = px(24)
        }
        countLabel = countValue
        val plus = button("+").apply { setOnClickListener { setCount(dashCount + 1) } }
        copyButton = button("—").apply { setOnClickListener { copyDash() } }
        listOf(minus, countValue, plus).forEach { actions.addView(it) }
        actions.addView(copyButton, LinearLayout.LayoutParams(0, -2, 1f).apply { marginStart = px(8) })
        view.addView(actions, LinearLayout.LayoutParams(-1, -2).apply { bottomMargin = px(8) })
        setCount(1)

        list = LinearLayout(context).apply { orientation = LinearLayout.VERTICAL }
        view.addView(ScrollView(context).apply { addView(list) }, LinearLayout.LayoutParams(-1, 0, 1f))
        render()
    }

    private fun setCount(value: Int) {
        dashCount = value.coerceIn(1, 6)
        countValue.text = dashCount.toString()
    }

    private fun copyDash() {
        val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
        clipboard.setPrimaryClip(ClipData.newPlainText("dash", "—".repeat(dashCount)))
        copyButton.text = "✓"
        copyButton.postDelayed({ copyButton.text = "—" }, 1200)
    }

    private fun setMode(folders: Boolean) {
        showFolders = folders
        render()
    }

    private fun matches(entry: ProfileDirectory.Entry): Boolean {
        val q = query.lowercase()
        return (!onlyFavorites || entry.starred) &&
            (q.isEmpty() || entry.name.lowercase().contains(q) || (entry.account ?: "").lowercase().contains(q))
    }

    private fun tabStyle(tab: TextView, selected: Boolean) {
        val c = palette
        tab.background = if (selected) pill(c.primary, c.primary) else pill(c.surface, c.border)
        tab.setTextColor(if (selected) Color.WHITE else c.muted)
    }

    /** Repinta la lista según la pestaña, el buscador y el filtro de favoritos. */
    fun render() {
        restyle()
        val c = palette
        favoritesChip.background = if (onlyFavorites) pill(c.favoriteFill, c.favoriteStroke) else pill(c.surface, c.border)
        tabStyle(foldersTab, showFolders)
        tabStyle(profilesTab, !showFolders)
        list.removeAllViews()
        val active = SessionRegistry.ids().toSet()
        val shown = ProfileDirectory.entries.filter { matches(it) }

        if (!showFolders) {
            if (shown.isEmpty()) addEmpty() else shown.forEach { addProfileRow(it, active, 0) }
            return
        }

        // Carpetas con sus perfiles; sin carpeta van en OTHERS, como en el gestor
        val filtering = query.isNotEmpty() || onlyFavorites
        val groups = buildList {
            add(Triple(OTHERS_ID, "OTHERS", null as String?))
            ProfileDirectory.folders.forEach { add(Triple(it.id, it.name, it.color)) }
        }
        var any = false
        for ((id, name, color) in groups) {
            val folderId = id.takeIf { it != OTHERS_ID }
            val all = ProfileDirectory.entries.filter { (it.folderId ?: "") == (folderId ?: "") }
            val inFolder = all.filter { matches(it) }
            if (filtering && inFolder.isEmpty()) continue
            if (!filtering && all.isEmpty() && id == OTHERS_ID) continue
            any = true
            // Al filtrar, las carpetas con resultados se muestran abiertas
            val open = filtering || id in expanded
            addFolderRow(id, name, color, inFolder.size, open)
            if (open) inFolder.forEach { addProfileRow(it, active, 1) }
        }
        if (!any) addEmpty()
    }

    private fun addEmpty() {
        list.addView(TextView(context).apply {
            text = "No profiles"
            setTextColor(palette.muted)
            setPadding(px(8), px(16), px(8), px(16))
        })
    }

    private fun addFolderRow(id: String, name: String, color: String?, count: Int, open: Boolean) {
        val row = LinearLayout(context).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            minimumHeight = px(48)
            setPadding(px(10), px(6), px(10), px(6))
            background = pill(palette.bar, palette.border)
            setOnClickListener {
                if (!expanded.add(id)) expanded.remove(id)
                render()
            }
        }
        row.addView(TextView(context).apply {
            text = if (open) "▾" else "▸"
            setTextColor(palette.muted)
            textSize = 16f
            gravity = Gravity.CENTER
        }, LinearLayout.LayoutParams(px(22), -2))
        row.addView(View(context).apply {
            background = GradientDrawable().apply {
                shape = GradientDrawable.OVAL
                setColor(runCatching { Color.parseColor(color) }.getOrDefault(palette.muted))
            }
        }, LinearLayout.LayoutParams(px(12), px(12)).apply { marginEnd = px(10) })
        row.addView(TextView(context).apply {
            text = name
            setTextColor(palette.text)
            textSize = 15f
            maxLines = 1
        }, LinearLayout.LayoutParams(0, -2, 1f))
        row.addView(TextView(context).apply {
            text = count.toString()
            setTextColor(palette.muted)
            textSize = 13f
        })
        list.addView(row, LinearLayout.LayoutParams(-1, -2).apply { bottomMargin = px(6) })
    }

    private fun addProfileRow(entry: ProfileDirectory.Entry, active: Set<String>, indent: Int) {
        val row = LinearLayout(context).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            minimumHeight = px(52)
            setPadding(px(10), px(6), px(10), px(6))
            background = pill(if (entry.id in active) palette.rowActive else palette.bar)
            setOnClickListener { onOpen(entry.id) }
        }
        val dot = View(context).apply {
            background = GradientDrawable().apply {
                shape = GradientDrawable.OVAL
                setColor(runCatching { Color.parseColor(entry.color) }.getOrDefault(Color.GRAY))
            }
        }
        row.addView(dot, LinearLayout.LayoutParams(px(14), px(14)).apply { marginEnd = px(10) })
        val texts = LinearLayout(context).apply { orientation = LinearLayout.VERTICAL }
        texts.addView(TextView(context).apply {
            text = (if (entry.starred) "★ " else "") + entry.name
            setTextColor(palette.text)
            textSize = 15f
            maxLines = 1
        })
        entry.account?.takeIf { it.isNotEmpty() }?.let {
            texts.addView(TextView(context).apply {
                text = "@" + it.removePrefix("@")
                setTextColor(palette.muted)
                textSize = 12f
                maxLines = 1
            })
        }
        row.addView(texts, LinearLayout.LayoutParams(0, -2, 1f))
        if (entry.id in active) {
            row.addView(TextView(context).apply {
                text = "●"
                setTextColor(palette.success)
            })
        }
        list.addView(row, LinearLayout.LayoutParams(-1, -2).apply {
            bottomMargin = px(6)
            marginStart = px(16 * indent)
        })
    }

    private companion object {
        const val OTHERS_ID = "__others__"
    }
}
