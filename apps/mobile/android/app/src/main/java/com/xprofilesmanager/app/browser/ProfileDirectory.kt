package com.xprofilesmanager.app.browser

/** Perfiles y carpetas (lo mínimo para mostrarlos) que el gestor entrega para el panel lateral del navegador. */
object ProfileDirectory {
    class Entry(
        val id: String,
        val name: String,
        val color: String?,
        val starred: Boolean,
        val account: String?,
        val folderId: String?
    )

    class Folder(val id: String, val name: String, val color: String?)

    @Volatile
    var entries: List<Entry> = emptyList()
        private set

    @Volatile
    var folders: List<Folder> = emptyList()
        private set

    fun interface Listener {
        fun onChanged()
    }

    private val listeners = java.util.concurrent.CopyOnWriteArrayList<Listener>()
    fun addListener(l: Listener) = listeners.add(l)
    fun removeListener(l: Listener) = listeners.remove(l)

    fun set(list: List<Entry>, folderList: List<Folder>) {
        entries = list
        folders = folderList
        listeners.forEach { it.onChanged() }
    }
}
