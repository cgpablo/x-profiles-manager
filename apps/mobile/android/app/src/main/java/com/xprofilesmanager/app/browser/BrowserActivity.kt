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
    private lateinit var panelHost: android.widget.FrameLayout
    private lateinit var divider: View
    private lateinit var panel: ProfilePanel
    private var panelWidthPx = 0
    private val directoryListener = ProfileDirectory.Listener { runOnUiThread { panel.render() } }

    var currentProfileId: String? = null
        private set
    private var popupSession: GeckoSession? = null
    private val handler = Handler(Looper.getMainLooper())
    private val registryListener = SessionRegistry.Listener { runOnUiThread { onSessionsChanged() } }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
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
        panelHost = findViewById(R.id.panelHost)
        divider = findViewById(R.id.divider)
        panel = ProfilePanel(this) { openProfile(it) }
        panelHost.addView(panel.view, android.widget.FrameLayout.LayoutParams(-1, -1))
        findViewById<View>(R.id.btnPanel).setOnClickListener { setPanelOpen(panelHost.visibility != View.VISIBLE) }
        setUpDivider()
        ProfileDirectory.addListener(directoryListener)

        popupOverlay.setOnClickListener { closePopup() }
        findViewById<View>(R.id.btnClosePopup).setOnClickListener { closePopup() }
        findViewById<View>(R.id.btnManager).setOnClickListener { finish() }
        findViewById<View>(R.id.btnReload).setOnClickListener { currentSession()?.gecko?.reload() }
        findViewById<View>(R.id.btnMenu).setOnClickListener { showMenu(it) }

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                val session = currentSession()
                when {
                    popupOverlay.visibility == View.VISIBLE -> closePopup()
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
            requested != null && SessionRegistry.get(requested) != null -> show(requested)
            currentProfileId == null -> onSessionsChanged()
        }
    }

    fun isShowing(profileId: String): Boolean = currentProfileId == profileId && !isFinishing

    private fun currentSession(): ProfileSession? = currentProfileId?.let { SessionRegistry.get(it) }

    private fun show(profileId: String) {
        val ps = SessionRegistry.get(profileId) ?: return
        if (currentProfileId != profileId) {
            geckoView.releaseSession()
            geckoView.setSession(ps.gecko)
        }
        currentProfileId = profileId
        // Las acciones de las extensiones necesitan saber cuál es la pestaña activa
        BrowserEngine.currentRuntime()?.webExtensionController?.let { controller ->
            SessionRegistry.all().forEach { controller.setTabActive(it.gecko, it === ps) }
        }
        renderChips()
    }

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
        if (currentProfileId == ps.profileId) {
            geckoView.releaseSession()
            geckoView.setSession(ps.gecko)
        }
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
            val fill = if (selected) (profileColor ?: Color.parseColor("#1D4ED8")) else Color.parseColor("#1F2937")
            // Texto oscuro sobre colores claros para que se lea
            val textColor = when {
                !selected -> Color.parseColor("#9CA3AF")
                androidx.core.graphics.ColorUtils.calculateLuminance(fill) > 0.5 -> Color.parseColor("#111827")
                else -> Color.WHITE
            }
            val chip = LinearLayout(this).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.CENTER_VERTICAL
                background = GradientDrawable().apply {
                    cornerRadius = 20 * dp
                    setColor(fill)
                    profileColor?.let { setStroke((2 * dp).toInt(), it) }
                }
            }
            val label = TextView(this).apply {
                text = ps.name
                setTextColor(textColor)
                textSize = 15f
                gravity = Gravity.CENTER
                maxLines = 1
                minHeight = (40 * dp).toInt()
                setPadding((16 * dp).toInt(), 0, (4 * dp).toInt(), 0)
                setOnClickListener { show(ps.profileId) }
            }
            val close = android.widget.ImageView(this).apply {
                setImageResource(R.drawable.ic_close)
                setColorFilter(textColor)
                contentDescription = "Cerrar perfil"
                setPadding((8 * dp).toInt(), (8 * dp).toInt(), (10 * dp).toInt(), (8 * dp).toInt())
                setOnClickListener { SessionRegistry.close(ps.profileId) }
            }
            chip.addView(label)
            chip.addView(close, LinearLayout.LayoutParams((36 * dp).toInt(), (40 * dp).toInt()))
            chips.addView(chip, LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply { marginEnd = (8 * dp).toInt() })
        }
    }

    private fun showMenu(anchor: View) {
        val menu = PopupMenu(this, anchor)
        menu.menu.add(0, 1, 0, "Iniciar sesión automático").setIcon(R.drawable.ic_login)
        if (!currentSession()?.chatPin.isNullOrEmpty()) {
            menu.menu.add(0, 3, 1, "Chat / PIN").setIcon(R.drawable.ic_chat)
        }
        menu.menu.add(0, 2, 2, "Ajustes de la extensión").setIcon(R.drawable.ic_tune)
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
        if (!ExtensionBridge.clickAction(session.gecko)) {
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
        showPopup(options, "Ajustes de la extensión")
    }

    private fun showPopup(session: GeckoSession, title: String) {
        closePopup()
        popupSession = session
        popupTitle.text = title
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
