package com.xprofilesmanager.app.browser

import android.content.Intent
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.widget.LinearLayout
import androidx.appcompat.widget.PopupMenu
import android.widget.TextView
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.activity.enableEdgeToEdge
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import com.xprofilesmanager.app.NativeTheme
import com.xprofilesmanager.app.R
import org.mozilla.geckoview.GeckoResult
import org.mozilla.geckoview.GeckoSession
import org.mozilla.geckoview.GeckoView

/**
 * Pantalla del navegador: la sesión de Gecko del perfil activo a pantalla completa, una barra con los perfiles
 * abiertos para cambiar entre ellos, y el panel flotante de las extensiones. Las sesiones no son de esta pantalla
 * (viven en [SessionRegistry]): cerrarla con "Gestor" no cierra los perfiles.
 */
class BrowserActivity : AppCompatActivity() {

    lateinit var geckoView: GeckoView
        private set
    private lateinit var popupView: GeckoView
    private lateinit var popupOverlay: View
    private lateinit var popupPanel: View
    private lateinit var popupTitle: TextView
    private lateinit var chips: LinearLayout
    private lateinit var tabsBar: View
    private lateinit var tabsRow: LinearLayout
    private lateinit var tabsScroll: android.widget.HorizontalScrollView
    private var resumed = false
    private lateinit var panelHost: android.widget.FrameLayout
    private lateinit var divider: View
    private lateinit var panel: ProfilePanel
    private var panelWidthPx = 0
    private val palette get() = NativeTheme.palette
    private val themeListener = NativeTheme.Listener { runOnUiThread { applyTheme() } }
    private val directoryListener = ProfileDirectory.Listener { runOnUiThread { panel.render() } }

    var currentProfileId: String? = null
        private set
    private var popupSession: GeckoSession? = null
    private val handler = Handler(Looper.getMainLooper())
    private val registryListener = SessionRegistry.Listener { runOnUiThread { onSessionsChanged() } }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        NativeTheme.load(this)
        enableEdgeToEdge(
            statusBarStyle = androidx.activity.SystemBarStyle.dark(Color.TRANSPARENT),
            navigationBarStyle = androidx.activity.SystemBarStyle.dark(Color.TRANSPARENT)
        )
        setContentView(R.layout.activity_browser)
        // La app se dibuja bajo las barras del sistema: se reserva su espacio para que los toques lleguen a la app
        ViewCompat.setOnApplyWindowInsetsListener(findViewById(R.id.browserRoot)) { v, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout())
            // Con el teclado (y su fila de sugerencias) abierto, el navegador se encoge para que no tape los campos
            val ime = insets.getInsets(WindowInsetsCompat.Type.ime())
            v.setPadding(bars.left, bars.top, bars.right, maxOf(bars.bottom, ime.bottom))
            insets
        }

        geckoView = findViewById(R.id.geckoview)
        popupView = findViewById(R.id.popupView)
        popupOverlay = findViewById(R.id.popupOverlay)
        popupPanel = findViewById(R.id.popupPanel)
        popupTitle = findViewById(R.id.popupTitle)
        chips = findViewById(R.id.chips)
        tabsBar = findViewById(R.id.tabsBar)
        tabsRow = findViewById(R.id.tabsRow)
        tabsScroll = findViewById(R.id.tabsScroll)
        installRightClick()
        panelHost = findViewById(R.id.panelHost)
        divider = findViewById(R.id.divider)
        panel = ProfilePanel(this) { openProfile(it) }
        panelHost.addView(panel.view, android.widget.FrameLayout.LayoutParams(-1, -1))
        findViewById<View>(R.id.btnPanel).setOnClickListener { setPanelOpen(panelHost.visibility != View.VISIBLE) }
        setUpDivider()
        ProfileDirectory.addListener(directoryListener)
        NativeTheme.addListener(themeListener)
        applyTheme()

        popupOverlay.setOnClickListener { closePopup() }
        findViewById<View>(R.id.btnClosePopup).setOnClickListener { closePopup() }
        findViewById<View>(R.id.btnUpdateExt).setOnClickListener { updateExtension() }
        findViewById<View>(R.id.btnManager).setOnClickListener { finish() }
        findViewById<View>(R.id.btnReload).setOnClickListener { currentSession()?.displayed?.reload() }
        findViewById<View>(R.id.btnMenu).setOnClickListener { showMenu(it) }

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                val session = currentSession()
                val tab = session?.activeTab
                when {
                    popupOverlay.visibility == View.VISIBLE -> closePopup()
                    session != null && tab != null ->
                        if (tab.canGoBack) tab.gecko?.goBack() else SessionRegistry.closeTab(session, tab)
                    session != null && session.canGoBack -> session.gecko.goBack()
                    else -> finish()
                }
            }
        })

        BrowserHost.activity = this
        if (savedWidth() > 0 && getSharedPreferences(PREFS, MODE_PRIVATE).getBoolean(KEY_OPEN, false)) setPanelOpen(true)
        SessionRegistry.addListener(registryListener)
        handleIntent(intent)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleIntent(intent)
    }

    private fun handleIntent(intent: Intent) {
        val requested = intent.getStringExtra(EXTRA_PROFILE_ID)
        when {
            requested != null && SessionRegistry.get(requested) != null -> {
                // Desde el gestor se quiere ver la página principal del perfil
                SessionRegistry.get(requested)?.let { SessionRegistry.focusMain(it) }
                show(requested)
            }
            currentProfileId == null -> onSessionsChanged()
        }
    }

    fun isShowing(profileId: String): Boolean = currentProfileId == profileId && !isFinishing

    /** Si esa sesión de Gecko es la que se ve ahora mismo en pantalla (con la pantalla en primer plano). */
    fun isDisplaying(gecko: GeckoSession): Boolean = resumed && geckoView.session === gecko

    private fun currentSession(): ProfileSession? = currentProfileId?.let { SessionRegistry.get(it) }

    private fun show(profileId: String) {
        val ps = SessionRegistry.get(profileId) ?: return
        currentProfileId = profileId
        showCurrent()
    }

    /** Pone en la vista la sesión que toca del perfil actual (la principal o la pestaña activa). */
    fun showCurrent(force: Boolean = false) {
        val ps = currentSession() ?: return
        val target = ps.displayed
        if (force || geckoView.session !== target) {
            geckoView.releaseSession()
            geckoView.setSession(target)
        }
        // Las acciones de las extensiones necesitan saber cuál es la pestaña activa
        BrowserEngine.currentRuntime()?.webExtensionController?.let { controller ->
            SessionRegistry.all().forEach { p -> p.allGeckos().forEach { controller.setTabActive(it, it === target) } }
        }
        renderChips()
        renderTabs()
    }

    fun tabsChanged() = runOnUiThread { renderTabs() }

    /** El registro cambió (se abrió o cerró un perfil): se refresca la barra y, si el activo ya no existe, se cambia. */
    private fun onSessionsChanged() {
        panel.render()
        val ids = SessionRegistry.ids()
        if (ids.isEmpty()) {
            finish()
            return
        }
        val current = currentProfileId
        if (current == null || current !in ids) {
            currentProfileId = null
            show(ids.first())
        } else {
            renderChips()
        }
    }

    /** Se llama justo antes de cerrar una sesión: hay que soltarla de la vista antes. */
    fun detach(ps: ProfileSession) {
        if (currentProfileId == ps.profileId) {
            geckoView.releaseSession()
            currentProfileId = null
        }
    }

    /** La sesión se reabrió tras un fallo del proceso de contenido: se vuelve a poner en la vista. */
    fun reattach(ps: ProfileSession) {
        if (currentProfileId == ps.profileId) showCurrent(force = true)
    }

    // ---- Pestañas secundarias ----

    /**
     * La barra de pestañas está siempre presente (con altura fija) para que la vista de X no cambie de tamaño
     * al pasar de un perfil con pestañas a otro sin ellas. El `+` queda fuera del scroll, siempre a mano.
     */
    private fun renderTabs() {
        val ps = currentSession()
        tabsRow.removeAllViews()
        if (ps == null) return
        val c = palette
        val dp = resources.displayMetrics.density
        var selectedView: View? = null

        fun addTab(label: String, selected: Boolean, dimmed: Boolean, onClick: () -> Unit, onClose: (() -> Unit)?) {
            val row = LinearLayout(this).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.CENTER_VERTICAL
                minimumWidth = (92 * dp).toInt()
                background = GradientDrawable().apply {
                    val r = 10 * dp
                    cornerRadii = floatArrayOf(r, r, r, r, 0f, 0f, 0f, 0f)
                    setColor(if (selected) c.surface else Color.TRANSPARENT)
                }
                setOnClickListener { onClick() }
            }
            row.addView(TextView(this).apply {
                text = label
                setTextColor(if (selected) c.text else c.muted)
                setTypeface(typeface, if (selected) android.graphics.Typeface.BOLD else android.graphics.Typeface.NORMAL)
                textSize = 13f
                maxLines = 1
                ellipsize = android.text.TextUtils.TruncateAt.END
                maxWidth = (170 * dp).toInt()
                setPadding((14 * dp).toInt(), 0, (if (onClose == null) 14 else 4) * dp.toInt(), 0)
            }, LinearLayout.LayoutParams(-2, -2))
            if (onClose != null) {
                row.addView(android.widget.ImageView(this).apply {
                    setImageResource(R.drawable.ic_close)
                    setColorFilter(c.muted)
                    contentDescription = "Cerrar pestaña"
                    setPadding((7 * dp).toInt(), (7 * dp).toInt(), (7 * dp).toInt(), (7 * dp).toInt())
                    setOnClickListener { onClose() }
                }, LinearLayout.LayoutParams((28 * dp).toInt(), (28 * dp).toInt()).apply { marginEnd = (6 * dp).toInt() })
            }
            // Raya de acento bajo la pestaña seleccionada
            val tab = LinearLayout(this).apply {
                orientation = LinearLayout.VERTICAL
                alpha = if (dimmed) 0.55f else 1f
            }
            tab.addView(row, LinearLayout.LayoutParams(-2, 0, 1f))
            tab.addView(View(this).apply { setBackgroundColor(if (selected) c.primary else Color.TRANSPARENT) },
                LinearLayout.LayoutParams(-1, (2 * dp).toInt()))
            tabsRow.addView(tab, LinearLayout.LayoutParams(-2, -1).apply { marginEnd = (3 * dp).toInt() })
            if (selected) selectedView = tab
        }

        addTab("Principal", ps.activeTab == null, false, { SessionRegistry.selectTab(ps, null) }, null)
        for (tab in ps.tabs.toList()) {
            val title = tab.title.ifEmpty { runCatching { android.net.Uri.parse(tab.url).host }.getOrNull() ?: "Pestaña" }
            addTab(title, ps.activeTab === tab, tab.gecko == null, { SessionRegistry.selectTab(ps, tab) }, { SessionRegistry.closeTab(ps, tab) })
        }
        // El + va justo después de la última pestaña
        tabsRow.addView(TextView(this).apply {
            text = "+"
            setTextColor(c.primary)
            textSize = 20f
            gravity = Gravity.CENTER
            contentDescription = "Nueva pestaña"
            setOnClickListener { SessionRegistry.openTab(ps, XUrls.HOME, activate = true) }
        }, LinearLayout.LayoutParams((36 * dp).toInt(), -1))
        // La pestaña activa siempre a la vista
        selectedView?.let { v -> tabsScroll.post { tabsScroll.smoothScrollTo(maxOf(0, v.left - (24 * dp).toInt()), 0) } }
    }

    /** Menú de un enlace (pulsación larga o clic derecho): una tarjeta con el estilo de la app. */
    fun showLinkMenu(ps: ProfileSession, uri: String) {
        runOnUiThread {
            val c = palette
            val dp = resources.displayMetrics.density
            val dialog = android.app.Dialog(this)
            dialog.requestWindowFeature(android.view.Window.FEATURE_NO_TITLE)

            fun pill(fill: Int, stroke: Int?, radius: Float = 12f) = GradientDrawable().apply {
                cornerRadius = radius * dp
                setColor(fill)
                stroke?.let { setStroke((1 * dp).toInt(), it) }
            }

            val card = LinearLayout(this).apply {
                orientation = LinearLayout.VERTICAL
                setPadding((20 * dp).toInt(), (18 * dp).toInt(), (20 * dp).toInt(), (20 * dp).toInt())
                background = pill(c.bar, c.border, 18f)
            }
            card.addView(TextView(this).apply {
                text = "ENLACE"
                setTextColor(c.muted)
                textSize = 11f
                letterSpacing = 0.08f
                setTypeface(typeface, android.graphics.Typeface.BOLD)
            })
            card.addView(TextView(this).apply {
                text = uri
                setTextColor(c.text)
                textSize = 13f
                maxLines = 3
                ellipsize = android.text.TextUtils.TruncateAt.MIDDLE
                setPadding((12 * dp).toInt(), (10 * dp).toInt(), (12 * dp).toInt(), (10 * dp).toInt())
                background = pill(c.bg, c.border, 10f)
            }, LinearLayout.LayoutParams(-1, -2).apply { topMargin = (8 * dp).toInt(); bottomMargin = (14 * dp).toInt() })

            // Tres acciones en fila: un círculo con icono y su etiqueta debajo
            val actions = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
            fun action(icon: Int, label: String, primary: Boolean, onClick: () -> Unit) {
                val cell = LinearLayout(this).apply {
                    orientation = LinearLayout.VERTICAL
                    gravity = Gravity.CENTER_HORIZONTAL
                    setOnClickListener { dialog.dismiss(); onClick() }
                }
                cell.addView(android.widget.ImageView(this).apply {
                    setImageResource(icon)
                    setColorFilter(if (primary) Color.WHITE else c.text)
                    contentDescription = label
                    setPadding((15 * dp).toInt(), (15 * dp).toInt(), (15 * dp).toInt(), (15 * dp).toInt())
                    background = GradientDrawable().apply {
                        shape = GradientDrawable.OVAL
                        setColor(if (primary) c.primary else c.surface)
                        if (!primary) setStroke((1 * dp).toInt(), c.border)
                    }
                }, LinearLayout.LayoutParams((54 * dp).toInt(), (54 * dp).toInt()))
                cell.addView(TextView(this).apply {
                    text = label
                    setTextColor(c.muted)
                    textSize = 12f
                    gravity = Gravity.CENTER
                    maxLines = 2
                }, LinearLayout.LayoutParams(-2, -2).apply { topMargin = (6 * dp).toInt() })
                actions.addView(cell, LinearLayout.LayoutParams(0, -2, 1f))
            }
            action(R.drawable.ic_open_new, "Pestaña nueva", primary = true) {
                SessionRegistry.openTab(ps, uri, activate = false)
                Toast.makeText(this, "Abierto en una pestaña nueva", Toast.LENGTH_SHORT).show()
            }
            action(R.drawable.ic_arrow_forward, "Abrir aquí", primary = false) { ps.displayed.loadUri(uri) }
            action(R.drawable.ic_copy, "Copiar", primary = false) {
                val clipboard = getSystemService(CLIPBOARD_SERVICE) as android.content.ClipboardManager
                clipboard.setPrimaryClip(android.content.ClipData.newPlainText("enlace", uri))
                Toast.makeText(this, "Enlace copiado", Toast.LENGTH_SHORT).show()
            }
            card.addView(actions, LinearLayout.LayoutParams(-1, -2))

            dialog.setContentView(card)
            dialog.show()
            dialog.window?.apply {
                setBackgroundDrawable(android.graphics.drawable.ColorDrawable(Color.TRANSPARENT))
                setLayout(minOf((340 * dp).toInt(), resources.displayMetrics.widthPixels - (48 * dp).toInt()), android.view.WindowManager.LayoutParams.WRAP_CONTENT)
            }
        }
    }

    // ---- Clic derecho (ratón o touchpad) ----

    private var rightClickGesture = false
    private var synthesizingTouch = false

    /**
     * Android toma el botón secundario del ratón como "Atrás" y Gecko no lo trata como una pulsación larga. Se
     * consume el clic derecho y se reproduce una pulsación larga táctil en ese punto, así abre el mismo menú.
     */
    private fun installRightClick() {
        geckoView.setOnTouchListener { _, event ->
            if (synthesizingTouch) return@setOnTouchListener false
            val isMouse = event.getToolType(0) == MotionEvent.TOOL_TYPE_MOUSE
            when {
                isMouse && event.actionMasked == MotionEvent.ACTION_DOWN &&
                    (event.buttonState and MotionEvent.BUTTON_SECONDARY) != 0 -> {
                    rightClickGesture = true
                    longPressAt(event.x, event.y)
                    true
                }
                rightClickGesture -> {
                    if (event.actionMasked == MotionEvent.ACTION_UP || event.actionMasked == MotionEvent.ACTION_CANCEL) {
                        rightClickGesture = false
                    }
                    true
                }
                else -> false
            }
        }
    }

    private fun longPressAt(x: Float, y: Float) {
        val downTime = android.os.SystemClock.uptimeMillis()
        fun send(action: Int, eventTime: Long) {
            val event = MotionEvent.obtain(downTime, eventTime, action, x, y, 0)
            event.source = android.view.InputDevice.SOURCE_TOUCHSCREEN
            synthesizingTouch = true
            try {
                geckoView.dispatchTouchEvent(event)
            } finally {
                synthesizingTouch = false
                event.recycle()
            }
        }
        send(MotionEvent.ACTION_DOWN, downTime)
        // Se cancela (no se suelta) tras el tiempo de pulsación larga, para que no cuente como un clic
        handler.postDelayed({
            send(MotionEvent.ACTION_CANCEL, android.os.SystemClock.uptimeMillis())
        }, android.view.ViewConfiguration.getLongPressTimeout() + 300L)
    }

    override fun onResume() {
        super.onResume()
        resumed = true
    }

    override fun onPause() {
        resumed = false
        super.onPause()
    }

    // ---- Tema ----

    /** Contexto con el tema claro u oscuro elegido, para menús y diálogos. */
    fun themedContext(): android.content.Context = androidx.appcompat.view.ContextThemeWrapper(
        this,
        if (palette.light) androidx.appcompat.R.style.ThemeOverlay_AppCompat_Light
        else androidx.appcompat.R.style.ThemeOverlay_AppCompat_Dark
    )

    /** Pinta la pantalla con la paleta del tema elegido en el gestor. */
    private fun applyTheme() {
        val c = palette
        findViewById<View>(R.id.browserRoot).setBackgroundColor(c.bg)
        findViewById<View>(R.id.topBar).setBackgroundColor(c.bar)
        findViewById<TextView>(R.id.btnManager).apply {
            setTextColor(c.text)
            background = GradientDrawable().apply {
                cornerRadius = 14 * resources.displayMetrics.density
                setColor(c.surface)
                setStroke((1 * resources.displayMetrics.density).toInt(), c.border)
            }
        }
        listOf(R.id.btnReload, R.id.btnMenu).forEach { findViewById<TextView>(it).setTextColor(c.text) }
        findViewById<android.widget.ImageView>(R.id.btnPanel).setColorFilter(c.text)
        tabsBar.setBackgroundColor(c.bg)
        findViewById<View>(R.id.tabsDivider).setBackgroundColor(c.border)
        divider.setBackgroundColor(c.bar)
        findViewById<View>(R.id.popupHeader).setBackgroundColor(c.surface)
        popupTitle.setTextColor(c.text)
        findViewById<TextView>(R.id.btnClosePopup).setTextColor(c.primary)
        findViewById<TextView>(R.id.btnUpdateExt).setTextColor(c.primary)
        // Iconos de las barras del sistema legibles sobre el fondo
        androidx.core.view.WindowCompat.getInsetsController(window, window.decorView).apply {
            isAppearanceLightStatusBars = c.light
            isAppearanceLightNavigationBars = c.light
        }
        panel.render()
        renderChips()
        renderTabs()
    }

    // ---- Panel lateral de perfiles (ancho ajustable arrastrando el divisor) ----

    private fun savedWidth(): Int =
        getSharedPreferences(PREFS, MODE_PRIVATE).getInt(KEY_WIDTH, (360 * resources.displayMetrics.density).toInt())

    private fun setPanelOpen(open: Boolean) {
        if (open) panelWidthPx = savedWidth().coerceIn(minPanel(), maxPanel())
        panelHost.visibility = if (open) View.VISIBLE else View.GONE
        divider.visibility = if (open) View.VISIBLE else View.GONE
        if (open) {
            panelHost.layoutParams = panelHost.layoutParams.apply { width = panelWidthPx }
            panel.render()
        }
        getSharedPreferences(PREFS, MODE_PRIVATE).edit().putBoolean(KEY_OPEN, open).apply()
    }

    private fun minPanel() = (220 * resources.displayMetrics.density).toInt()
    private fun maxPanel() = (resources.displayMetrics.widthPixels * 0.7f).toInt()

    private fun setUpDivider() {
        divider.setOnTouchListener { v, event ->
            val container = v.parent as View
            when (event.actionMasked) {
                MotionEvent.ACTION_DOWN -> { v.parent.requestDisallowInterceptTouchEvent(true); true }
                MotionEvent.ACTION_MOVE -> {
                    val loc = IntArray(2)
                    container.getLocationOnScreen(loc)
                    val right = loc[0] + container.width
                    val raw = right - event.rawX - v.width / 2f
                    panelWidthPx = raw.toInt().coerceIn(minPanel() / 2, maxPanel())
                    panelHost.layoutParams = panelHost.layoutParams.apply { width = panelWidthPx }
                    true
                }
                MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                    if (panelWidthPx < minPanel()) {
                        setPanelOpen(false)
                    } else {
                        getSharedPreferences(PREFS, MODE_PRIVATE).edit().putInt(KEY_WIDTH, panelWidthPx).apply()
                    }
                    true
                }
                else -> false
            }
        }
    }

    /** Abre un perfil desde el panel: cambia a él si ya está abierto; si no, lo abre aquí mismo. */
    private fun openProfile(profileId: String) {
        val entry = ProfileDirectory.entries.firstOrNull { it.id == profileId }
        SessionRegistry.open(this, profileId, entry?.name, entry?.color, null)
        show(profileId)
    }

    private fun renderChips() {
        chips.removeAllViews()
        val dp = resources.displayMetrics.density
        for (ps in SessionRegistry.all()) {
            val selected = ps.profileId == currentProfileId
            val profileColor = ps.color?.let { runCatching { Color.parseColor(it) }.getOrNull() }
            val fill = if (selected) (profileColor ?: palette.primary) else palette.surface
            // Texto oscuro sobre colores claros para que se lea
            val textColor = when {
                !selected -> palette.muted
                androidx.core.graphics.ColorUtils.calculateLuminance(fill) > 0.5 -> Color.parseColor("#111827")
                else -> Color.WHITE
            }
            val chip = LinearLayout(this).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.CENTER_VERTICAL
                background = GradientDrawable().apply {
                    cornerRadius = 14 * dp
                    setColor(fill)
                    profileColor?.let { setStroke((1.5f * dp).toInt(), it) }
                }
            }
            val label = TextView(this).apply {
                text = ps.name
                setTextColor(textColor)
                textSize = 12f
                gravity = Gravity.CENTER
                maxLines = 1
                minHeight = (28 * dp).toInt()
                setPadding((11 * dp).toInt(), 0, (2 * dp).toInt(), 0)
                setOnClickListener { show(ps.profileId) }
            }
            val close = android.widget.ImageView(this).apply {
                setImageResource(R.drawable.ic_close)
                setColorFilter(textColor)
                contentDescription = "Cerrar perfil"
                setPadding((6 * dp).toInt(), (7 * dp).toInt(), (8 * dp).toInt(), (7 * dp).toInt())
                setOnClickListener { SessionRegistry.close(ps.profileId) }
            }
            chip.addView(label)
            chip.addView(close, LinearLayout.LayoutParams((26 * dp).toInt(), (28 * dp).toInt()))
            chips.addView(chip, LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply { marginEnd = (6 * dp).toInt() })
        }
    }

    private fun showMenu(anchor: View) {
        val menu = PopupMenu(themedContext(), anchor)
        menu.menu.add(0, 1, 0, "Iniciar sesión automático").setIcon(R.drawable.ic_login)
        if (!currentSession()?.chatPin.isNullOrEmpty()) {
            menu.menu.add(0, 3, 1, "Chat / PIN").setIcon(R.drawable.ic_chat)
        }
        menu.menu.add(0, 2, 2, "Ajustes de la extensión").setIcon(R.drawable.ic_tune)
        for (i in 0 until menu.menu.size()) menu.menu.getItem(i).icon?.mutate()?.setTint(palette.text)
        menu.setForceShowIcon(true)
        menu.setOnMenuItemClickListener { item ->
            when (item.itemId) {
                1 -> requestAutoLogin()
                2 -> showOptionsPage()
                3 -> currentSession()?.let { XFlows.openChat(it, it.chatPin) }
            }
            true
        }
        menu.show()
    }

    private fun requestAutoLogin() {
        val ps = currentSession() ?: return
        val user = ps.username
        val pass = ps.password
        if (user.isNullOrEmpty() || pass.isNullOrEmpty()) {
            Toast.makeText(this, "Este perfil no tiene usuario y contraseña vinculados", Toast.LENGTH_LONG).show()
            return
        }
        XFlows.startLogin(ps, user, pass) { }
    }

    // ---- Panel flotante de las extensiones ----

    private fun openExtensionPopup() {
        if (popupOverlay.visibility == View.VISIBLE) {
            closePopup()
            return
        }
        val session = currentSession() ?: return
        if (!ExtensionBridge.clickAction(session.displayed)) {
            Toast.makeText(this, "La extensión no está disponible todavía", Toast.LENGTH_SHORT).show()
        }
    }

    /** La extensión pide un popup: se devuelve una sesión ya abierta y se muestra en el panel flotante. */
    fun newPopupSession(): GeckoResult<GeckoSession> {
        val popup = GeckoSession()
        popup.promptDelegate = PromptHandler.delegate
        BrowserEngine.currentRuntime()?.let { popup.open(it) }
        // Gecko no abre esta sesión por su cuenta; y se muestra cuando ya está abierta
        handler.postDelayed({ showPopup(popup, "Extensión") }, 400)
        return GeckoResult.fromValue(popup)
    }

    /** Abre la página de opciones de la extensión en el panel flotante. */
    fun showOptionsPage() {
        val url = ExtensionBridge.optionsUrl()
        val runtime = BrowserEngine.currentRuntime()
        if (url == null || runtime == null) {
            Toast.makeText(this, "La extensión no está disponible todavía", Toast.LENGTH_SHORT).show()
            return
        }
        val options = GeckoSession()
        options.promptDelegate = PromptHandler.delegate
        options.open(runtime)
        options.loadUri(url)
        showPopup(options, optionsTitle(), showUpdate = true)
    }

    private fun optionsTitle(): String {
        val version = ExtensionBridge.extension?.metaData?.version
        return if (version.isNullOrEmpty()) "Ajustes de la extensión" else "Ajustes de la extensión · v$version"
    }

    /** Busca una versión nueva de la extensión desde el propio panel de sus ajustes. */
    private fun updateExtension() {
        val button = findViewById<TextView>(R.id.btnUpdateExt)
        val before = ExtensionBridge.extension?.metaData?.version
        button.isEnabled = false
        button.text = "Buscando…"
        BrowserEngine.checkForUpdate(force = true) { version ->
            runOnUiThread {
                button.isEnabled = true
                button.text = "Actualizar"
                val message = when {
                    version == null -> "No se pudo comprobar la actualización"
                    version != before -> "Extensión actualizada a la versión $version"
                    else -> "Ya tienes la última versión ($version)"
                }
                Toast.makeText(this, message, Toast.LENGTH_LONG).show()
                if (version != null && version != before && popupSession != null) {
                    popupTitle.text = optionsTitle()
                    popupSession?.reload()
                }
            }
        }
    }

    private fun showPopup(session: GeckoSession, title: String, showUpdate: Boolean = false) {
        closePopup()
        popupSession = session
        popupTitle.text = title
        findViewById<View>(R.id.btnUpdateExt).visibility = if (showUpdate) View.VISIBLE else View.GONE
        // El panel mide hasta 440x640 dp, pero nunca más que la pantalla (en un móvil estrecho no cabría)
        val dp = resources.displayMetrics.density
        popupPanel.layoutParams = popupPanel.layoutParams.apply {
            width = minOf((440 * dp).toInt(), resources.displayMetrics.widthPixels - (24 * dp).toInt())
            height = minOf((640 * dp).toInt(), resources.displayMetrics.heightPixels - (140 * dp).toInt())
        }
        popupView.setSession(session)
        popupOverlay.visibility = View.VISIBLE
    }

    private fun closePopup() {
        if (popupOverlay.visibility != View.VISIBLE && popupSession == null) return
        popupOverlay.visibility = View.GONE
        popupView.releaseSession()
        popupSession?.close()
        popupSession = null
    }

    override fun onDestroy() {
        closePopup()
        geckoView.releaseSession()
        SessionRegistry.removeListener(registryListener)
        ProfileDirectory.removeListener(directoryListener)
        NativeTheme.removeListener(themeListener)
        if (BrowserHost.activity === this) BrowserHost.activity = null
        super.onDestroy()
    }

    companion object {
        const val EXTRA_PROFILE_ID = "profileId"
        private const val PREFS = "browser_panel"
        private const val KEY_WIDTH = "width"
        private const val KEY_OPEN = "open"
    }
}
