package com.xprofilesmanager.app.browser

import android.content.Intent
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.view.View
import android.widget.LinearLayout
import android.widget.PopupMenu
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

    var currentProfileId: String? = null
        private set
    private var popupSession: GeckoSession? = null
    private val handler = Handler(Looper.getMainLooper())
    private val registryListener = SessionRegistry.Listener { runOnUiThread { onSessionsChanged() } }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContentView(R.layout.activity_browser)
        // La app se dibuja bajo las barras del sistema: se reserva su espacio para que los toques lleguen a la app
        ViewCompat.setOnApplyWindowInsetsListener(findViewById(R.id.browserRoot)) { v, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout())
            v.setPadding(bars.left, bars.top, bars.right, bars.bottom)
            insets
        }

        geckoView = findViewById(R.id.geckoview)
        popupView = findViewById(R.id.popupView)
        popupOverlay = findViewById(R.id.popupOverlay)
        popupPanel = findViewById(R.id.popupPanel)
        popupTitle = findViewById(R.id.popupTitle)
        chips = findViewById(R.id.chips)

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

    private fun renderChips() {
        chips.removeAllViews()
        val dp = resources.displayMetrics.density
        for (ps in SessionRegistry.all()) {
            val selected = ps.profileId == currentProfileId
            val chip = TextView(this).apply {
                text = ps.name
                setTextColor(if (selected) Color.WHITE else Color.parseColor("#9CA3AF"))
                textSize = 15f
                gravity = Gravity.CENTER
                maxLines = 1
                setPadding((16 * dp).toInt(), 0, (16 * dp).toInt(), 0)
                minHeight = (40 * dp).toInt()
                background = GradientDrawable().apply {
                    cornerRadius = 20 * dp
                    setColor(if (selected) Color.parseColor("#1D4ED8") else Color.parseColor("#1F2937"))
                    ps.color?.let { runCatching { Color.parseColor(it) }.getOrNull() }
                        ?.let { setStroke((2 * dp).toInt(), it) }
                }
                setOnClickListener { show(ps.profileId) }
            }
            chips.addView(chip, LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply { marginEnd = (8 * dp).toInt() })
        }
    }

    private fun showMenu(anchor: View) {
        val menu = PopupMenu(this, anchor)
        menu.menu.add(0, 1, 0, "Ajustes de la extensión")
        menu.menu.add(0, 2, 1, "Panel rápido de la extensión")
        menu.menu.add(0, 3, 2, "Ir al inicio de X")
        menu.menu.add(0, 4, 3, "Cerrar este perfil")
        menu.setOnMenuItemClickListener { item ->
            when (item.itemId) {
                1 -> showOptionsPage()
                2 -> openExtensionPopup()
                3 -> currentSession()?.gecko?.loadUri("${XUrls.HOME}/home")
                4 -> currentProfileId?.let { SessionRegistry.close(it) }
            }
            true
        }
        menu.show()
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
        if (BrowserHost.activity === this) BrowserHost.activity = null
        super.onDestroy()
    }

    companion object {
        const val EXTRA_PROFILE_ID = "profileId"
    }
}
