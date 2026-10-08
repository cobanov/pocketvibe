package dev.cobanov.pocketvibe

import android.net.Uri
import android.util.Log
import java.io.BufferedInputStream
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.IOException
import java.io.InputStream
import java.io.OutputStream
import java.net.InetAddress
import java.net.InetSocketAddress
import java.net.ServerSocket
import java.net.Socket
import java.util.concurrent.Executors
import org.json.JSONArray
import org.json.JSONObject

// A small HTTP/1.1 server on 127.0.0.1, enough for what the launcher and the
// games ask of it: the Android side of what pocketvibed's http.server does on
// the handheld. One request per connection.

const val MAX_BODY = 1 shl 20 // bytes; the largest body is the settings

class Request(
    val method: String,
    val target: String,
    val headers: Map<String, String>, // names in lower case
    val body: ByteArray,
) {
    val path: String = target.substringBefore('?')
    val query: Map<String, String> = target.substringAfter('?', "").split('&').filter { it.isNotEmpty() }
        .associate { Uri.decode(it.substringBefore('=')) to Uri.decode(it.substringAfter('=', "")) }

    fun header(name: String): String? = headers[name.lowercase()]

    fun cookie(name: String): String? = header("cookie")?.split(';')
        ?.map { it.trim() }?.firstOrNull { it.startsWith("$name=") }?.substringAfter('=')

    fun json(): JSONObject = try {
        JSONObject(String(body, Charsets.UTF_8).ifBlank { "{}" })
    } catch (e: Exception) {
        JSONObject()
    }
}

class Response(
    val status: Int,
    val type: String = "application/octet-stream",
    val body: ByteArray? = null,
    val file: File? = null,
    val headers: Map<String, String> = emptyMap(),
) {
    companion object {
        fun json(data: Any, status: Int = 200) = Response(
            status, "application/json", data.toString().toByteArray(), headers = mapOf("Cache-Control" to "no-store"),
        )

        fun error(message: String, status: Int) = json(JSONObject().put("error", message), status)

        fun notFound() = Response(404, "text/plain", "Not found".toByteArray())
    }
}

class HttpServer(val port: Int, private val handle: (Request) -> Response) {
    private val socket = ServerSocket().apply {
        reuseAddress = true
        bind(InetSocketAddress(InetAddress.getByName("127.0.0.1"), port), 64)
    }
    private val workers = Executors.newCachedThreadPool { Thread(it).apply { isDaemon = true } }

    fun start(): HttpServer {
        Thread({ accept() }, "http-$port").apply { isDaemon = true }.start()
        return this
    }

    fun stop() {
        try {
            socket.close()
        } catch (_: IOException) {
        }
        workers.shutdown()
    }

    private fun accept() {
        while (!socket.isClosed) {
            val client = try {
                socket.accept()
            } catch (e: IOException) {
                return
            }
            workers.execute { serve(client) }
        }
    }

    private fun serve(client: Socket) {
        client.use {
            try {
                it.soTimeout = 20_000
                val request = readRequest(BufferedInputStream(it.getInputStream())) ?: return
                val response = try {
                    handle(request)
                } catch (e: Exception) {
                    Log.w(TAG, "${request.method} ${request.path}", e)
                    Response.error(e.message ?: e.toString(), 500)
                }
                write(it.getOutputStream(), response, request.method == "HEAD")
            } catch (_: IOException) {
                // The page went away mid-request.
            }
        }
    }

    private fun readRequest(input: InputStream): Request? {
        val head = ByteArrayOutputStream()
        var tail = 0 // how much of "\r\n\r\n" was just read
        while (tail < 4) {
            val b = input.read()
            if (b < 0 || head.size() > 65536) return null
            head.write(b)
            tail = when {
                b == '\r'.code -> if (tail == 2) 3 else 1
                b == '\n'.code && (tail == 1 || tail == 3) -> tail + 1
                else -> 0
            }
        }
        val lines = head.toString("ISO-8859-1").split("\r\n")
        val parts = lines[0].split(' ')
        if (parts.size < 3) return null
        val headers = HashMap<String, String>()
        for (line in lines.drop(1)) {
            val colon = line.indexOf(':')
            if (colon > 0) headers[line.substring(0, colon).trim().lowercase()] = line.substring(colon + 1).trim()
        }
        val length = headers["content-length"]?.toIntOrNull() ?: 0
        if (length < 0 || length > MAX_BODY) return null
        val body = ByteArray(length)
        var read = 0
        while (read < length) {
            val n = input.read(body, read, length - read)
            if (n < 0) return null
            read += n
        }
        return Request(parts[0], parts[1], headers, body)
    }

    private fun write(out: OutputStream, response: Response, headOnly: Boolean) {
        val length = response.body?.size?.toLong() ?: response.file?.length() ?: 0L
        val head = StringBuilder("HTTP/1.1 ${response.status} ${REASONS[response.status] ?: "OK"}\r\n")
            .append("Content-Type: ${response.type}\r\n")
            .append("Content-Length: $length\r\n")
            .append("Connection: close\r\n")
        for ((name, value) in response.headers) head.append("$name: $value\r\n")
        head.append("\r\n")
        out.write(head.toString().toByteArray(Charsets.ISO_8859_1))
        if (!headOnly) {
            response.body?.let { out.write(it) }
            response.file?.inputStream()?.use { it.copyTo(out, 1 shl 16) }
        }
        out.flush()
    }

    companion object {
        private val REASONS = mapOf(
            200 to "OK", 400 to "Bad Request", 403 to "Forbidden", 404 to "Not Found",
            405 to "Method Not Allowed", 500 to "Internal Server Error", 502 to "Bad Gateway",
        )
    }
}

private val TYPES = mapOf(
    "html" to "text/html; charset=utf-8", "js" to "text/javascript; charset=utf-8", "mjs" to "text/javascript; charset=utf-8",
    "css" to "text/css; charset=utf-8", "json" to "application/json", "txt" to "text/plain; charset=utf-8",
    "png" to "image/png", "jpg" to "image/jpeg", "jpeg" to "image/jpeg", "webp" to "image/webp", "gif" to "image/gif",
    "svg" to "image/svg+xml", "ico" to "image/x-icon", "wav" to "audio/wav", "mp3" to "audio/mpeg", "ogg" to "audio/ogg",
    "m4a" to "audio/mp4", "mp4" to "video/mp4", "webm" to "video/webm", "woff" to "font/woff", "woff2" to "font/woff2",
    "ttf" to "font/ttf", "otf" to "font/otf", "wasm" to "application/wasm", "glb" to "model/gltf-binary",
    "gltf" to "model/gltf+json", "bin" to "application/octet-stream", "xml" to "application/xml",
)

fun mimeType(name: String): String = TYPES[name.substringAfterLast('.', "").lowercase()] ?: "application/octet-stream"

/** A file under root for a URL path, never outside it; a folder means its index.html. */
fun serveFile(root: File, urlPath: String): Response {
    val base = root.canonicalFile
    var file = File(base, Uri.decode(urlPath).trimStart('/')).canonicalFile
    if (file != base && !file.path.startsWith(base.path + File.separator)) return Response.notFound()
    if (file.isDirectory) file = File(file, "index.html")
    if (!file.isFile) return Response.notFound()
    return Response(200, mimeType(file.name), file = file, headers = mapOf("Cache-Control" to "no-cache"))
}

fun jsonArray(items: Iterable<Any>) = JSONArray().apply { items.forEach { put(it) } }

const val TAG = "PocketVibe"
