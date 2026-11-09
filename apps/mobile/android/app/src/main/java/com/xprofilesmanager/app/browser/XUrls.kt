package com.xprofilesmanager.app.browser

/** Rutas de X y reglas para saber en qué estado está una sesión (mismas listas que `launcher.ts` de desktop). */
object XUrls {
    const val HOME = "https://x.com"
    const val LOGIN_FLOW = "https://x.com/i/flow/login"
    const val CHAT = "https://x.com/i/chat"
    const val PIN_RECOVERY_PATH = "/i/chat/pin/recovery"

    private val LOGGED_IN_PATHS = listOf("/home", "/notifications", "/messages", "/i/bookmarks", "/i/premium", "/compose/")
    private val HOME_LIKE_PATHS = listOf("/home", "/notifications", "/i/history", "/i/chat")

    private fun isX(url: String) = url.contains("x.com") || url.contains("twitter.com")

    fun isLoggedIn(url: String) = isX(url) && LOGGED_IN_PATHS.any { url.contains(it) }

    fun isHomeLike(url: String) = isX(url) && HOME_LIKE_PATHS.any { url.contains(it) }
}
