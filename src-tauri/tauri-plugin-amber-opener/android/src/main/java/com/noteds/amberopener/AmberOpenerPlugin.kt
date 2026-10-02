package com.noteds.amberopener

import android.app.Activity
import android.content.Intent
import android.provider.Browser
import androidx.core.net.toUri
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin

@InvokeArg
class OpenAmberUrlArgs {
    lateinit var url: String
}

/**
 * Amber (and other NIP-55 signer apps) only parse request parameters from a
 * nostrsigner: URL's own query string when the launching Intent carries the
 * Browser.EXTRA_APPLICATION_ID extra — that's the marker a real browser sets
 * when it resolves an intent:// link into an Intent. Without it, Amber
 * assumes it's a native-app request and looks for parameters as Intent
 * extras instead, finds none, and rejects it as malformed. Tauri's stock
 * opener plugin has no way to attach this extra, hence this plugin.
 */
@InvokeArg
class QuerySignerArgs {
    lateinit var uri: String
    lateinit var args: Array<String>
}

@TauriPlugin
class AmberOpenerPlugin(private val activity: Activity) : Plugin(activity) {
    @Command
    fun openAmberUrl(invoke: Invoke) {
        try {
            val args = invoke.parseArgs(OpenAmberUrlArgs::class.java)
            val intent = Intent(Intent.ACTION_VIEW, args.url.toUri())
            intent.putExtra(Browser.EXTRA_APPLICATION_ID, activity.packageName)
            intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            activity.applicationContext.startActivity(intent)
            invoke.resolve()
        } catch (ex: Exception) {
            invoke.reject(ex.message)
        }
    }

    /**
     * NIP-55 content resolver: asks the signer app to perform a request in
     * the background, with no UI and no app switch. The signer only answers
     * when the user previously chose "remember my choice" for this app and
     * request type; otherwise it returns a null cursor or a `rejected`
     * column, which the caller treats as "fall back to the intent flow".
     */
    @Command
    fun querySigner(invoke: Invoke) {
        try {
            val args = invoke.parseArgs(QuerySignerArgs::class.java)
            val result = JSObject()
            val cursor = activity.contentResolver.query(args.uri.toUri(), null, null, args.args, null)
            if (cursor == null) {
                result.put("status", "unavailable")
            } else {
                cursor.use {
                    if (!it.moveToFirst()) {
                        result.put("status", "unavailable")
                    } else if (it.getColumnIndex("rejected") >= 0) {
                        result.put("status", "rejected")
                    } else {
                        val index = it.getColumnIndex("result")
                        val value = if (index >= 0) it.getString(index) else null
                        if (value.isNullOrEmpty()) {
                            result.put("status", "unavailable")
                        } else {
                            result.put("status", "ok")
                            result.put("result", value)
                        }
                    }
                }
            }
            invoke.resolve(result)
        } catch (ex: Exception) {
            // Signer not installed / provider not exported: caller falls back.
            val result = JSObject()
            result.put("status", "unavailable")
            invoke.resolve(result)
        }
    }
}
