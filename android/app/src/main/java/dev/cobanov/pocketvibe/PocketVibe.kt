package dev.cobanov.pocketvibe

import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.BatteryManager
import android.os.StatFs
import android.util.Log
import java.io.BufferedInputStream
import java.io.File
import java.io.FileOutputStream
import java.io.IOException
import java.net.HttpURLConnection
import java.net.Inet4Address
import java.net.NetworkInterface
import java.net.URL
import java.security.MessageDigest
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.UUID
import java.util.concurrent.Executors
import java.util.zip.CRC32
import java.util.zip.ZipInputStream
import org.json.JSONArray
import org.json.JSONObject

/**
 * The app's local service, the Android counterpart of pocketvibed.py: serves
 * the launcher and its /api on 127.0.0.1, serves each installed game on its own
 * port (its own origin, so its own saves) and talks to the stores. The launcher
 * is the handheld's, unchanged, so the /api here answers as pocketvibed does.
 *
 * Other apps on the device can reach 127.0.0.1 too, so every /api call needs
 * the session's cookie, which only the page this app opened gets.
 */
class PocketVibe private constructor(private val context: Context) {
    companion object {
        @Volatile private var instance: PocketVibe? = null

        fun get(context: Context): PocketVibe = instance ?: synchronized(this) {
            instance ?: PocketVibe(context.applicationContext).also { instance = it }
        }

        private val GAME_ID = Regex("[a-z0-9][a-z0-9-]{0,63}")
        private val STORE_URL = Regex("https?://\\S+")
        private const val SHELL_PATH = "/__pocketvibe__/"
        private val SHELL_FILES = setOf("play.html", "play.css", "play.js", "i18n.js", "screens.js")
        private val TEXT_FIELDS = setOf("title", "author", "version", "description", "genre", "entry", "download", "cover", "sha256", "updated")
        private val ACTIVE = setOf("queued", "downloading", "installing")
        private const val MAX_CATALOG = 4 shl 20
        private const val MAX_COVER = 2 shl 20
        private const val APP_JOB = "__app__" // the app's own update, among the games' jobs
        private const val UPDATE_CHECK_EVERY = 6 * 3600 * 1000L // ms, so GitHub is not asked on every start

        // The handheld's typeface, so text takes the same room as there.
        private val FONTS = """<style>@font-face{font-family:'DejaVu Sans';font-weight:100 599;src:url(${SHELL_PATH}fonts/DejaVuSans.woff2) format('woff2')}@font-face{font-family:'DejaVu Sans';font-weight:600 900;src:url(${SHELL_PATH}fonts/DejaVuSans-Bold.woff2) format('woff2')}</style>"""
    }

    private val games = File(context.filesDir, "games")
    private val cache = File(context.cacheDir, "pocketvibe")
    private val settingsFile = File(context.filesDir, "settings.json")
    private val playsFile = File(context.filesDir, "plays.json")
    private val portsFile = File(context.filesDir, "ports.json")
    private val bundledDone = File(context.filesDir, ".bundled") // the bundled games are unpacked once, never again
    private val updating = File(context.filesDir, "updating") // the version Android was asked to install
    private val config = JSONObject(String(asset("config.json") ?: "{}".toByteArray()))
    private val version = config.optString("version", "0.0.0")
    private val defaultStore = config.optString("store_url")
    private val updateUrl = config.optString("update_url")
    private val token = UUID.randomUUID().toString()
    private val pool = Executors.newCachedThreadPool { Thread(it).apply { isDaemon = true } }
    private val filesLock = Any()
    private val jobs = LinkedHashMap<String, JSONObject>()
    private val gameServers = HashMap<String, HttpServer>()
    private val coverMisses = HashMap<String, Long>()
    private var catalogCache = Triple(0L, emptyList<JSONObject>(), JSONArray())
    /** Something to tell the player when the launcher next loads. */
    @Volatile var notice: String? = null

    /** Set while a game is open; the launcher clears it when it loads. */
    @Volatile var inGame = false
    var onQuit: (() -> Unit)? = null

    private val launcher: HttpServer = (8730..8739).firstNotNullOf { port ->
        try {
            HttpServer(port) { handleLauncher(it) }
        } catch (e: IOException) {
            null
        }
    }.start()

    /** The launcher, with the key that gives the page its session cookie. */
    val launcherUrl get() = "http://127.0.0.1:${launcher.port}/?k=$token"

    init {
        cleanUp()
        installBundled()
        noticeUpdate()
    }

    fun quit() {
        onQuit?.invoke()
    }

    // ---------- Files ----------

    private fun asset(path: String): ByteArray? {
        if (path.split('/').any { it == ".." }) return null
        return try {
            context.assets.open(path).use { it.readBytes() }
        } catch (e: IOException) {
            null
        }
    }

    private fun readJson(file: File): Any? = try {
        val text = file.readText().trim()
        if (text.startsWith("[")) JSONArray(text) else JSONObject(text)
    } catch (e: Exception) {
        null
    }

    /** Whole or not at all: a full card never leaves the file empty. */
    private fun writeJson(file: File, data: Any) {
        file.parentFile?.mkdirs()
        val temp = File(file.parentFile, ".${file.name}.tmp")
        temp.writeText(if (data is JSONObject) data.toString(2) else data.toString())
        if (!temp.renameTo(file)) throw IOException("could not write ${file.name}")
    }

    /** Leftovers of work that was cut off (power, a crash, quitting mid-download). */
    private fun cleanUp() {
        for (path in games.listFiles().orEmpty().filter { it.name.startsWith(".") }) {
            val name = path.name.removePrefix(".").removeSuffix(".old")
            if (path.name.endsWith(".old") && path.isDirectory && !File(games, name).exists()) {
                path.renameTo(File(games, name))
            } else {
                path.deleteRecursively()
            }
        }
        File(cache, "audio").deleteRecursively() // menu music older launchers rendered and kept here
        UpdateProvider.file(context).parentFile?.deleteRecursively() // an update Android installed or the player declined
    }

    // ---------- Settings and plays ----------

    private fun defaultSettings() = JSONObject()
        .put("language", if (Locale.getDefault().language == "tr") "tr" else "en")
        .put("music", true) // background music in the menus
        .put("musicVolume", 0.8)
        .put("uiSounds", true) // sound effects
        .put("sfxVolume", 0.8)
        .put("showFps", false)
        .put("stores", JSONArray().put(defaultStore))

    private fun loadSettings(): JSONObject {
        val settings = defaultSettings()
        val saved = readJson(settingsFile) as? JSONObject ?: return settings
        for (key in settings.keys().asSequence().toList()) if (saved.has(key)) settings.put(key, saved.get(key))
        return settings
    }

    private fun saveSettings(changes: JSONObject): JSONObject = synchronized(filesLock) {
        val settings = loadSettings()
        val defaults = defaultSettings()
        for (key in changes.keys().asSequence().toList()) {
            val default = defaults.opt(key) ?: continue
            val value = changes.get(key)
            when {
                default is Boolean && value is Boolean -> settings.put(key, value)
                default is Double && value is Number -> settings.put(key, value.toDouble().coerceIn(0.0, 1.0))
                default is String && value is String -> settings.put(key, value)
                key == "stores" && value is JSONArray -> {
                    val urls = LinkedHashSet<String>()
                    for (i in 0 until value.length()) {
                        val url = (value.opt(i) as? String)?.trim() ?: continue
                        if (STORE_URL.matches(url)) urls.add(url)
                    }
                    settings.put(key, jsonArray(urls.take(10)))
                }
            }
        }
        writeJson(settingsFile, settings)
        settings
    }

    private fun recordPlay(gid: String) {
        try {
            synchronized(filesLock) {
                val plays = readJson(playsFile) as? JSONObject ?: JSONObject()
                val count = plays.optJSONObject(gid)?.optInt("count", 0) ?: 0
                plays.put(gid, JSONObject().put("count", count + 1).put("last", System.currentTimeMillis() / 1000.0))
                writeJson(playsFile, plays)
            }
        } catch (e: IOException) {
            // A full card must not stop a game from starting.
        }
    }

    // ---------- Library ----------

    private fun readManifest(dir: File): JSONObject {
        var meta = JSONObject()
        // openboy.json is the manifest's name from before the project was renamed.
        for (name in listOf("pocketvibe.json", "openboy.json")) {
            val parsed = readJson(File(dir, name)) as? JSONObject
            if (parsed != null) {
                meta = parsed
                break
            }
        }
        if (!meta.has("id")) meta.put("id", dir.name)
        if (!meta.has("title")) meta.put("title", dir.name.split('-').joinToString(" ") { it.replaceFirstChar(Char::uppercase) })
        if (!meta.has("entry")) meta.put("entry", "index.html")
        return meta
    }

    private fun library(): JSONArray {
        val plays = readJson(playsFile) as? JSONObject ?: JSONObject()
        val list = games.listFiles().orEmpty().filter { it.isDirectory && !it.name.startsWith(".") }.map { dir ->
            readManifest(dir).apply {
                for (key in listOf("id", "title", "entry")) put(key, get(key).toString())
                val played = plays.optJSONObject(getString("id"))
                put("lastPlayed", played?.optDouble("last", 0.0) ?: 0)
                put("plays", played?.optInt("count", 0) ?: 0)
            }
        }
        return jsonArray(list.sortedBy { it.getString("title").lowercase() })
    }

    // ---------- Stores ----------

    private fun open(url: String, timeout: Int = 10_000): HttpURLConnection =
        (URL(url).openConnection() as HttpURLConnection).apply {
            connectTimeout = timeout
            readTimeout = timeout
            setRequestProperty("User-Agent", "PocketVibe/$version (Android)")
        }

    private fun readLimited(connection: HttpURLConnection, limit: Int): ByteArray {
        if (connection.responseCode !in 200..299) throw IOException("HTTP ${connection.responseCode}")
        connection.inputStream.use { input ->
            val data = input.readNBytesCompat(limit + 1)
            if (data.size > limit) throw IOException("too large")
            return data
        }
    }

    /** The usable games of one store's catalog; anything malformed is left out. */
    private fun catalogEntries(data: JSONObject): List<JSONObject> {
        val list = data.optJSONArray("games") ?: return emptyList()
        val entries = ArrayList<JSONObject>()
        for (i in 0 until list.length()) {
            val game = list.optJSONObject(i) ?: continue
            val id = game.opt("id") as? String ?: continue
            if (!GAME_ID.matches(id) || game.opt("title") !is String || game.opt("download") !is String) continue
            val entry = JSONObject()
            for (key in game.keys()) {
                val value = game.get(key)
                if (key in TEXT_FIELDS && value !is String) continue
                entry.put(key, value)
            }
            if (entry.has("controls") && entry.opt("controls") !is JSONObject) entry.remove("controls")
            for (key in listOf("size", "downloads")) {
                if (entry.has(key) && entry.opt(key).let { it !is Int && it !is Long }) entry.remove(key)
            }
            entries.add(entry)
        }
        return entries
    }

    /** One store's catalog, and whether it came from the store or the last copy. */
    private fun fetchCatalog(url: String): Pair<JSONObject, Boolean> {
        val cached = File(cache, "catalog-${sha1(url).take(12)}.json")
        return try {
            val data = JSONObject(String(readLimited(open(url), MAX_CATALOG)))
            writeJson(cached, data)
            data to true
        } catch (e: Exception) {
            (readJson(cached) as? JSONObject ?: JSONObject().put("games", JSONArray())) to false
        }
    }

    /** Games from every store in the settings; on a clash the first store wins. */
    private fun mergedCatalog(maxAgeMs: Long = 0): Pair<List<JSONObject>, JSONArray> {
        synchronized(this) {
            if (maxAgeMs > 0 && System.currentTimeMillis() - catalogCache.first < maxAgeMs) {
                return catalogCache.second to catalogCache.third
            }
        }
        val urls = loadSettings().getJSONArray("stores").let { a -> (0 until a.length()).map { a.getString(it) } }
        val results = urls.map { url -> pool.submit<Pair<JSONObject, Boolean>> { fetchCatalog(url) } }.map { it.get() }
        val merged = LinkedHashMap<String, JSONObject>()
        val stores = JSONArray()
        for ((url, result) in urls.zip(results)) {
            val (data, online) = result
            val name = (data.opt("name") as? String)?.takeIf { it.isNotEmpty() } ?: URL(url).host ?: url
            val entries = catalogEntries(data)
            stores.put(JSONObject().put("url", url).put("name", name).put("online", online).put("count", entries.size))
            for (entry in entries) merged.putIfAbsent(entry.getString("id"), entry.put("store", name))
        }
        synchronized(this) { catalogCache = Triple(System.currentTimeMillis(), merged.values.toList(), stores) }
        return merged.values.toList() to stores
    }

    private fun store(): JSONObject {
        val (catalog, stores) = mergedCatalog()
        val installed = HashMap<String, JSONObject>()
        val lib = library()
        for (i in 0 until lib.length()) lib.getJSONObject(i).let { installed[it.getString("id")] = it }
        val list = JSONArray()
        for (entry in catalog) {
            val local = installed[entry.getString("id")]
            list.put(JSONObject(entry.toString()).put("installed", local != null)
                .put("update", local != null && local.optString("version") != entry.optString("version")))
        }
        val online = (0 until stores.length()).any { stores.getJSONObject(it).optBoolean("online") }
        return JSONObject().put("online", online).put("games", list).put("stores", stores)
    }

    private fun findCatalogEntry(gid: String) = mergedCatalog(60_000).first.firstOrNull { it.getString("id") == gid }

    // ---------- Installing ----------

    private fun setJob(gid: String, state: String? = null, progress: Double? = null, error: String? = null) = synchronized(jobs) {
        val job = jobs.getOrPut(gid) { JSONObject().put("state", "queued").put("progress", 0).put("error", JSONObject.NULL) }
        state?.let { job.put("state", it) }
        progress?.let { job.put("progress", it) }
        if (state != null) job.put("error", error ?: JSONObject.NULL)
    }

    private fun jobState(gid: String) = synchronized(jobs) { jobs[gid]?.optString("state") }

    /** Unzip, refusing entries that would land outside the folder. */
    private fun unzip(zip: File, target: File) {
        val base = target.canonicalPath
        ZipInputStream(BufferedInputStream(zip.inputStream())).use { input ->
            while (true) {
                val entry = input.nextEntry ?: break
                val out = File(target, entry.name)
                val path = out.canonicalPath
                if (path != base && !path.startsWith(base + File.separator)) throw IOException("unsafe path in archive: ${entry.name}")
                if (entry.isDirectory) {
                    out.mkdirs()
                } else {
                    out.parentFile?.mkdirs()
                    FileOutputStream(out).use { input.copyTo(it) }
                }
            }
        }
    }

    /** Downloads url to file, reporting progress as job gid; returns the file's SHA-256. */
    private fun download(url: String, file: File, gid: String, size: Long): String {
        val digest = MessageDigest.getInstance("SHA-256")
        val connection = open(url, 30_000)
        if (connection.responseCode !in 200..299) throw IOException("HTTP ${connection.responseCode}")
        val total = connection.contentLengthLong.takeIf { it > 0 } ?: size
        connection.inputStream.use { input ->
            file.outputStream().use { out ->
                val buffer = ByteArray(1 shl 16)
                var done = 0L
                while (true) {
                    val n = input.read(buffer)
                    if (n < 0) break
                    out.write(buffer, 0, n)
                    digest.update(buffer, 0, n)
                    done += n
                    if (total > 0) setJob(gid, progress = minOf(done.toDouble() / total, 1.0))
                }
            }
        }
        return hex(digest.digest())
    }

    /** Puts a game zip in the Library as games/<gid>, replacing what is there. */
    private fun unpack(gid: String, zip: File, entry: JSONObject) {
        val staging = File(games, ".$gid.new")
        try {
            staging.deleteRecursively()
            staging.mkdirs()
            unzip(zip, staging)
            // Accept zips that wrap the game in a single top-level folder.
            val entries = staging.listFiles().orEmpty().filter { !it.name.startsWith("__MACOSX") }
            val root = if (entries.size == 1 && entries[0].isDirectory) entries[0] else staging
            val manifest = readManifest(root)
            if (!File(root, entry.optString("entry", manifest.getString("entry"))).exists()) throw IOException("archive has no index.html")
            for (key in listOf("id", "title", "author", "version", "description", "entry")) {
                if (entry.has(key)) manifest.put(key, entry.get(key))
            }
            manifest.put("id", gid)
            File(root, "pocketvibe.json").writeText(manifest.toString(2))

            val target = File(games, gid)
            val old = File(games, ".$gid.old")
            old.deleteRecursively()
            if (target.exists()) target.renameTo(old)
            if (!root.renameTo(target)) throw IOException("could not install the game")
            old.deleteRecursively()
        } finally {
            staging.deleteRecursively()
        }
    }

    private fun install(entry: JSONObject) {
        val gid = entry.getString("id")
        games.mkdirs()
        val zip = File(games, ".$gid.zip")
        try {
            setJob(gid, "downloading", 0.0)
            val sha = download(entry.getString("download"), zip, gid, entry.optLong("size", 0))
            if (entry.optString("sha256").let { it.isNotEmpty() && it != sha }) throw IOException("download is corrupted (checksum mismatch)")
            setJob(gid, "installing", 1.0)
            unpack(gid, zip, entry)
            setJob(gid, "done")
        } catch (e: Exception) {
            Log.w(TAG, "install $gid", e)
            setJob(gid, "error", error = e.message ?: e.toString())
        } finally {
            zip.delete()
        }
    }

    /** A new install starts with a few games in its Library, from zips in the
     *  APK's bundled folder. Only once: games the player removes stay removed,
     *  and a game the player already has is left alone. */
    private fun installBundled() {
        if (bundledDone.exists()) return
        games.mkdirs()
        for (name in context.assets.list("bundled").orEmpty().filter { it.endsWith(".zip") }.sorted()) {
            val gid = name.removeSuffix(".zip")
            if (!GAME_ID.matches(gid) || File(games, gid).exists()) continue
            val zip = File(games, ".$gid.zip")
            try {
                context.assets.open("bundled/$name").use { input -> zip.outputStream().use { input.copyTo(it) } }
                unpack(gid, zip, JSONObject())
            } catch (e: Exception) {
                Log.w(TAG, "bundled game $gid not installed", e)
            } finally {
                zip.delete()
            }
        }
        try {
            bundledDone.createNewFile()
        } catch (e: IOException) {
            // Then it tries again next time; games already there are left alone.
        }
    }

    private fun remove(gid: String) {
        synchronized(gameServers) { gameServers.remove(gid) }?.stop()
        File(games, gid).deleteRecursively()
    }

    // ---------- Covers ----------

    /** A game's cover: from the installed game, else cached from the store. */
    private fun cover(gid: String): File? {
        for (name in listOf("cover.png", "cover.jpg", "cover.webp")) {
            val local = File(File(games, gid), name)
            if (local.exists()) return local
        }
        synchronized(coverMisses) {
            if (System.currentTimeMillis() - (coverMisses[gid] ?: 0) < 600_000) return null
        }
        val url = findCatalogEntry(gid)?.optString("cover").orEmpty()
        if (url.isEmpty()) return miss(gid)
        val cached = File(cache, "covers/$gid-${sha1(url).take(12)}")
        if (cached.exists()) return cached
        return try {
            val data = readLimited(open(url), MAX_COVER)
            cached.parentFile?.mkdirs()
            cached.parentFile?.listFiles()?.filter { it.name.startsWith("$gid-") }?.forEach { it.delete() }
            cached.writeBytes(data)
            cached
        } catch (e: Exception) {
            miss(gid)
        }
    }

    private fun miss(gid: String): File? {
        synchronized(coverMisses) { coverMisses[gid] = System.currentTimeMillis() }
        return null
    }

    // ---------- Device ----------

    private fun status(): JSONObject {
        val battery = context.registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
        val level = battery?.getIntExtra(BatteryManager.EXTRA_LEVEL, -1) ?: -1
        val scale = battery?.getIntExtra(BatteryManager.EXTRA_SCALE, 100) ?: 100
        val plugged = battery?.getIntExtra(BatteryManager.EXTRA_STATUS, -1)
        val connectivity = context.getSystemService(ConnectivityManager::class.java)
        val wifi = connectivity.getNetworkCapabilities(connectivity.activeNetwork)
            ?.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) == true
        return JSONObject()
            .put("time", SimpleDateFormat("HH:mm", Locale.US).format(Date()))
            .put("battery", if (level >= 0) level * 100 / scale else JSONObject.NULL)
            .put("charging", plugged == BatteryManager.BATTERY_STATUS_CHARGING || plugged == BatteryManager.BATTERY_STATUS_FULL)
            .put("wifi", wifi)
    }

    private fun address(): String? = try {
        NetworkInterface.getNetworkInterfaces().toList().filter { it.isUp && !it.isLoopback }
            .flatMap { it.inetAddresses.toList() }.firstOrNull { it is Inet4Address && it.isSiteLocalAddress }?.hostAddress
    } catch (e: Exception) {
        null
    }

    private fun info(): JSONObject {
        val stat = StatFs(context.filesDir.path)
        val gamesSize = games.walkTopDown().filter { it.isFile }.sumOf { it.length() }
        return JSONObject()
            .put("version", version)
            .put("platform", "android")
            .put("free", stat.availableBytes)
            .put("total", stat.totalBytes)
            .put("games", gamesSize)
            .put("ip", address() ?: JSONObject.NULL)
            .put("gpu", JSONObject.NULL)
    }

    // ---------- Updates ----------

    /** The newest Android release, compared with this app. Cached for a while. */
    private fun checkUpdate(force: Boolean = false): JSONObject {
        val cached = File(cache, "update.json")
        val fresh = System.currentTimeMillis() - cached.lastModified() < UPDATE_CHECK_EVERY
        val release = (if (force || !fresh) null else readJson(cached) as? JSONObject) ?: latestRelease().also { writeJson(cached, it) }
        return JSONObject(release.toString()).put("current", version).put("available", newer(release.getString("version"), version))
    }

    /** GitHub lists releases newest first. Android's are tagged android-v1.2.3
     *  and carry the APK; the handheld's (v1.2.3) and the runtime's are skipped. */
    private fun latestRelease(): JSONObject {
        val connection = open(updateUrl).apply { setRequestProperty("Accept", "application/vnd.github+json") }
        val text = String(readLimited(connection, MAX_CATALOG)).trim()
        val releases = if (text.startsWith("[")) JSONArray(text) else JSONArray().put(JSONObject(text))
        for (i in 0 until releases.length()) {
            val release = releases.optJSONObject(i) ?: continue
            val tag = release.optString("tag_name")
            if (!tag.startsWith("android-v") || release.optBoolean("draft") || release.optBoolean("prerelease")) continue
            val assets = release.optJSONArray("assets") ?: continue
            val apk = (0 until assets.length()).mapNotNull { assets.optJSONObject(it) }
                .firstOrNull { it.optString("name").endsWith(".apk") } ?: continue
            // The checksum comes from GitHub's asset digest, or a "sha256: ..." line in the notes.
            val notes = (release.opt("body") as? String).orEmpty()
            val digest = (apk.opt("digest") as? String)?.removePrefix("sha256:")
            val noted = Regex("sha256:\\s*([0-9a-f]{64})").find(notes)?.groupValues?.get(1)
            return JSONObject()
                .put("version", tag.removePrefix("android-v"))
                .put("notes", notes.replace(Regex("\\s*sha256:\\s*[0-9a-f]{64}\\s*"), "").trim())
                .put("url", apk.getString("browser_download_url"))
                .put("size", apk.optLong("size"))
                .put("sha256", digest ?: noted.orEmpty())
        }
        throw IOException("no Android release yet")
    }

    /** Downloads the new APK, checks it and hands it to Android's installer,
     *  which asks the player and, once it is installed, offers to open it. */
    private fun installUpdate() {
        val apk = UpdateProvider.file(context)
        try {
            val release = checkUpdate()
            if (!release.getBoolean("available")) throw IOException("already up to date")
            val sha = release.getString("sha256")
            if (!Regex("[0-9a-f]{64}").matches(sha)) throw IOException("the release has no checksum")
            setJob(APP_JOB, "downloading", 0.0)
            apk.parentFile?.mkdirs()
            if (download(release.getString("url"), apk, APP_JOB, release.optLong("size")) != sha) {
                throw IOException("download is corrupted (checksum mismatch)")
            }
            setJob(APP_JOB, "installing", 1.0)
            updating.writeText(release.getString("version"))
            context.startActivity(
                Intent(Intent.ACTION_VIEW)
                    .setDataAndType(UpdateProvider.uri(context), UpdateProvider.TYPE)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_GRANT_READ_URI_PERMISSION),
            )
            setJob(APP_JOB, "done")
        } catch (e: Exception) {
            Log.w(TAG, "update", e)
            apk.delete()
            setJob(APP_JOB, "error", error = e.message ?: e.toString())
        }
    }

    /** The first start after Android installed an update: say so in the launcher. */
    private fun noticeUpdate() {
        val target = try {
            updating.readText().trim()
        } catch (e: IOException) {
            return
        }
        if (newer(target, version)) return // not installed: the player may still say yes later
        if (target == version) notice = "updated:$version"
        updating.delete()
    }

    // ---------- Games ----------

    /** The game's port, the same on every run: it is its origin, and so where its saves are. */
    private fun gamePort(gid: String): Int = synchronized(filesLock) {
        val ports = readJson(portsFile) as? JSONObject ?: JSONObject()
        if (!ports.has(gid)) {
            val taken = ports.keys().asSequence().map { ports.getInt(it) }.toSet()
            var port = 20000 + (CRC32().apply { update(gid.toByteArray()) }.value % 20000).toInt()
            while (port in taken) port = 20000 + (port - 20000 + 1) % 20000
            ports.put(gid, port)
            writeJson(portsFile, ports)
        }
        ports.getInt(gid)
    }

    /** Start (once) the game's own server and return its address: always the
     *  shell, which fits the game's 720x480 screen to this one. */
    private fun gameUrl(gid: String): String {
        val meta = readManifest(File(games, gid))
        val port = synchronized(gameServers) {
            gameServers.getOrPut(gid) { HttpServer(gamePort(gid)) { handleGame(gid, it) }.start() }.port
        }
        val settings = loadSettings()
        val query = "entry=${android.net.Uri.encode(meta.optString("entry", "index.html"))}" +
            "&perf=${if (settings.optBoolean("showFps")) 1 else 0}&lang=${settings.optString("language")}"
        return "http://127.0.0.1:$port${SHELL_PATH}play.html?$query"
    }

    /** The shell's own files and the fonts, under SHELL_PATH on every port. */
    private fun shellFile(path: String): Response? {
        val name = path.removePrefix(SHELL_PATH)
        if (name.startsWith("fonts/") && name.endsWith(".woff2")) {
            return asset("fonts/${name.substringAfterLast('/')}")?.let {
                Response(200, mimeType(name), it, headers = mapOf("Cache-Control" to "max-age=86400"))
            }
        }
        if (name !in SHELL_FILES) return null
        return asset("launcher/$name")?.let { Response(200, mimeType(name), withFonts(name, it), headers = mapOf("Cache-Control" to "no-cache")) }
    }

    private fun withFonts(name: String, data: ByteArray): ByteArray =
        if (name.endsWith(".html")) String(data).replaceFirst("</head>", "$FONTS</head>").toByteArray() else data

    private fun handleGame(gid: String, request: Request): Response {
        if (request.method != "GET" && request.method != "HEAD") return Response.error("not allowed", 405)
        if (request.path.startsWith(SHELL_PATH)) return shellFile(request.path) ?: Response.notFound()
        return serveFile(File(games, gid), request.path)
    }

    // ---------- The launcher and its /api ----------

    private fun launcherOrigin() = "http://127.0.0.1:${launcher.port}"

    /** The page this app opened, and only it: right host, right origin, the
     *  session cookie, and (but for covers) the header pages on other origins
     *  cannot send without a preflight. */
    private fun allowed(request: Request): Boolean {
        if (request.header("host") !in setOf("127.0.0.1:${launcher.port}", "localhost:${launcher.port}")) return false
        if (!request.path.startsWith("/api/")) return true
        if (request.header("origin") !in setOf(null, launcherOrigin())) return false
        if (request.cookie("pv") != token) return false
        if (request.method == "GET" && request.path.startsWith("/api/cover/")) return true
        return request.header("x-pocketvibe") == "1"
    }

    private fun handleLauncher(request: Request): Response {
        if (!allowed(request)) return Response.error("not allowed", 403)
        val path = request.path
        if (path.startsWith("/api/")) {
            return when (request.method) {
                "GET" -> apiGet(path, request)
                "POST" -> apiPost(path, request)
                else -> Response.error("not allowed", 405)
            }
        }
        if (path.startsWith(SHELL_PATH)) return shellFile(path) ?: Response.notFound()
        val name = if (path == "/") "index.html" else android.net.Uri.decode(path).trimStart('/')
        val data = asset("launcher/$name") ?: return Response.notFound()
        val headers = HashMap<String, String>()
        headers["Cache-Control"] = "no-cache"
        // The page this app opens carries the session key once; it becomes the cookie.
        if (name == "index.html" && request.query["k"] == token) headers["Set-Cookie"] = "pv=$token; Path=/; HttpOnly; SameSite=Strict"
        return Response(200, mimeType(name), withFonts(name, data), headers = headers)
    }

    private fun apiGet(path: String, request: Request): Response = when {
        path == "/api/library" -> {
            inGame = false // the launcher asks for the library when it loads: no game is running
            Response.json(library())
        }
        path == "/api/store" -> Response.json(store())
        path == "/api/status" -> Response.json(status())
        path == "/api/settings" -> Response.json(loadSettings())
        path == "/api/info" -> Response.json(info())
        path == "/api/screens" -> Response.json(JSONObject().put("screens", JSONObject.NULL).put("primary", 0))
        path == "/api/saves" -> Response.json(JSONArray())
        path == "/api/update" -> try {
            Response.json(checkUpdate(force = "force" in request.query))
        } catch (e: Exception) {
            Response.error(e.message ?: e.toString(), 502)
        }
        path == "/api/notice" -> Response.json(JSONObject().put("notice", notice ?: JSONObject.NULL)).also { notice = null }
        path == "/api/jobs" -> Response.json(synchronized(jobs) { JSONObject().apply { for ((gid, job) in jobs) put(gid, JSONObject(job.toString())) } })
        path.startsWith("/api/cover/") -> {
            val gid = path.substringAfterLast('/')
            val file = if (GAME_ID.matches(gid)) cover(gid) else null
            if (file == null) Response.error("no cover", 404)
            else Response(200, imageType(file), file = file)
        }
        else -> Response.error("unknown", 404)
    }

    private fun apiPost(path: String, request: Request): Response {
        when (path) {
            "/api/settings" -> return Response.json(saveSettings(request.json()))
            "/api/unlock-audio" -> return Response.json(JSONObject().put("ok", true)) // Android lets pages play sound without a key press
            "/api/quit" -> {
                quit()
                return Response.json(JSONObject().put("ok", true))
            }
            "/api/update/install" -> {
                if (jobState(APP_JOB) !in ACTIVE) {
                    setJob(APP_JOB, "queued", 0.0)
                    pool.execute { installUpdate() }
                }
                return Response.json(JSONObject().put("ok", true))
            }
            "/api/saves/backup" -> return Response.error("not on Android yet", 400)
        }
        val parts = path.trim('/').split('/')
        val action = parts.getOrNull(1)
        val gid = parts.getOrNull(2).orEmpty()
        if (!GAME_ID.matches(gid)) return Response.error("bad game id", 400)
        return when (action) {
            "launch" -> {
                if (!File(games, gid).isDirectory) return Response.error("not installed", 404)
                val url = try {
                    gameUrl(gid)
                } catch (e: IOException) {
                    return Response.error(e.message ?: "cannot start", 500)
                }
                inGame = true
                recordPlay(gid)
                Response.json(JSONObject().put("url", url))
            }
            "install" -> {
                val entry = findCatalogEntry(gid) ?: return Response.error("not in the store", 404)
                if (jobState(gid) !in ACTIVE) {
                    setJob(gid, "queued", 0.0)
                    pool.execute { install(entry) }
                }
                Response.json(JSONObject().put("ok", true))
            }
            "remove" -> {
                remove(gid)
                Response.json(JSONObject().put("ok", true))
            }
            else -> Response.error("unknown action", 404)
        }
    }
}

/** Whether version a is newer than b ("0.6.10" > "0.6.9"). */
private fun newer(a: String, b: String): Boolean {
    val parts = { v: String -> Regex("\\d+").findAll(v).take(3).map { it.value.toInt() }.toList() }
    val (x, y) = parts(a) to parts(b)
    for (i in 0 until maxOf(x.size, y.size)) {
        val d = x.getOrElse(i) { 0 } - y.getOrElse(i) { 0 }
        if (d != 0) return d > 0
    }
    return false
}

/** PNG by its signature, else JPEG, as the handheld decides. */
private fun imageType(file: File): String {
    val head = file.inputStream().use { it.readNBytesCompat(4) }
    return if (head.contentEquals(byteArrayOf(0x89.toByte(), 'P'.code.toByte(), 'N'.code.toByte(), 'G'.code.toByte()))) "image/png" else "image/jpeg"
}

private fun sha1(text: String) = hex(MessageDigest.getInstance("SHA-1").digest(text.toByteArray()))

private fun hex(bytes: ByteArray) = bytes.joinToString("") { "%02x".format(it) }

/** InputStream.readNBytes is Android 13+; this reads up to n bytes on any version. */
private fun java.io.InputStream.readNBytesCompat(n: Int): ByteArray {
    val out = java.io.ByteArrayOutputStream()
    val buffer = ByteArray(1 shl 16)
    while (out.size() < n) {
        val read = read(buffer, 0, minOf(buffer.size, n - out.size()))
        if (read < 0) break
        out.write(buffer, 0, read)
    }
    return out.toByteArray()
}
