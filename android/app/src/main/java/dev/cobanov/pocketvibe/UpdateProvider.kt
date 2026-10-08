package dev.cobanov.pocketvibe

import android.content.ContentProvider
import android.content.ContentValues
import android.content.Context
import android.database.Cursor
import android.database.MatrixCursor
import android.net.Uri
import android.os.ParcelFileDescriptor
import android.provider.OpenableColumns
import java.io.File

/**
 * Lends Android's package installer the downloaded update, the only file this
 * app ever shares. The installer cannot read the app's own folders; the intent
 * that opens it grants it this one address, read-only, for as long as it runs.
 */
class UpdateProvider : ContentProvider() {
    companion object {
        const val TYPE = "application/vnd.android.package-archive"
        private const val NAME = "PocketVibe.apk"

        fun file(context: Context) = File(context.cacheDir, "pocketvibe/update/$NAME")

        fun uri(context: Context): Uri = Uri.parse("content://${context.packageName}.update/$NAME")
    }

    override fun onCreate() = true

    override fun getType(uri: Uri) = TYPE

    override fun openFile(uri: Uri, mode: String): ParcelFileDescriptor {
        if (mode != "r") throw SecurityException("read only")
        return ParcelFileDescriptor.open(file(context!!), ParcelFileDescriptor.MODE_READ_ONLY)
    }

    // The installer asks for the file's name and size first.
    override fun query(uri: Uri, projection: Array<String>?, selection: String?, args: Array<String>?, sort: String?): Cursor {
        val file = file(context!!)
        val columns = projection ?: arrayOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE)
        return MatrixCursor(columns, 1).apply {
            addRow(columns.map { if (it == OpenableColumns.SIZE) file.length() else if (it == OpenableColumns.DISPLAY_NAME) NAME else null })
        }
    }

    override fun insert(uri: Uri, values: ContentValues?) = throw UnsupportedOperationException()

    override fun delete(uri: Uri, selection: String?, args: Array<String>?) = throw UnsupportedOperationException()

    override fun update(uri: Uri, values: ContentValues?, selection: String?, args: Array<String>?) = throw UnsupportedOperationException()
}
