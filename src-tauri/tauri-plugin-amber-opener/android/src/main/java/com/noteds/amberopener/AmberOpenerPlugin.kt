package com.noteds.amberopener

import android.app.Activity
import android.content.Intent
import android.net.Uri
import androidx.activity.result.ActivityResult
import app.tauri.annotation.ActivityCallback
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin

@InvokeArg
class SignerRequestArgs {
    lateinit var type: String
    var content: String = ""
    var pubkey: String? = null
    var currentUser: String? = null
    var id: String? = null
    var signerPackage: String? = null
    var permissions: String? = null
}

/**
 * Talks to NIP-55 signer apps (Amber etc.) the way native Android apps do:
 *
 * 1. If we already know the signer's package, first try its ContentResolver
 *    endpoint. When the user has told the signer to remember the permission,
 *    this returns the result silently — no app switch, no UI at all.
 * 2. Otherwise, launch the signer with startActivityForResult and read the
 *    result from the returned Intent's extras.
 *
 * Neither path goes through the clipboard, unlike the web-app flow (the
 * Browser.EXTRA_APPLICATION_ID + clipboard round trip) this replaced, which
 * made every decrypt pop a "copied" / "pasted from clipboard" toast and could
 * silently pick up a stale clipboard value when a request was dismissed.
 */
@TauriPlugin
class AmberOpenerPlugin(private val activity: Activity) : Plugin(activity) {
    @Command
    fun signerRequest(invoke: Invoke) {
        val args = try {
            invoke.parseArgs(SignerRequestArgs::class.java)
        } catch (ex: Exception) {
            invoke.reject(ex.message)
            return
        }

        Thread {
            try {
                when (val outcome = queryContentResolver(args)) {
                    is ResolverOutcome.Result -> invoke.resolve(outcome.data)
                    ResolverOutcome.Rejected -> invoke.reject("Signer rejected the request", "REJECTED")
                    ResolverOutcome.Unavailable -> activity.runOnUiThread { launchIntent(invoke, args) }
                }
            } catch (ex: Exception) {
                invoke.reject(ex.message)
            }
        }.start()
    }

    private sealed class ResolverOutcome {
        class Result(val data: JSObject) : ResolverOutcome()
        object Rejected : ResolverOutcome()
        object Unavailable : ResolverOutcome()
    }

    private fun queryContentResolver(args: SignerRequestArgs): ResolverOutcome {
        val signerPackage = args.signerPackage ?: return ResolverOutcome.Unavailable
        val endpoint = when (args.type) {
            "sign_event" -> "SIGN_EVENT"
            "nip04_encrypt" -> "NIP04_ENCRYPT"
            "nip04_decrypt" -> "NIP04_DECRYPT"
            "nip44_encrypt" -> "NIP44_ENCRYPT"
            "nip44_decrypt" -> "NIP44_DECRYPT"
            else -> return ResolverOutcome.Unavailable
        }
        val projection = arrayOf(args.content, args.pubkey ?: "", args.currentUser ?: "")
        val cursor = try {
            activity.contentResolver.query(
                Uri.parse("content://$signerPackage.$endpoint"),
                projection,
                "1",
                null,
                null
            )
        } catch (_: Exception) {
            null
        } ?: return ResolverOutcome.Unavailable

        cursor.use {
            if (it.getColumnIndex("rejected") > -1) return ResolverOutcome.Rejected
            if (!it.moveToFirst()) return ResolverOutcome.Unavailable
            val resultIndex = it.getColumnIndex("result").takeIf { i -> i > -1 }
                ?: it.getColumnIndex("signature").takeIf { i -> i > -1 }
                ?: return ResolverOutcome.Unavailable
            val data = JSObject()
            data.put("result", it.getString(resultIndex))
            val eventIndex = it.getColumnIndex("event")
            if (eventIndex > -1) data.put("event", it.getString(eventIndex))
            return ResolverOutcome.Result(data)
        }
    }

    private fun launchIntent(invoke: Invoke, args: SignerRequestArgs) {
        try {
            // Raw (not URL-encoded) content, as NIP-55 specifies for native apps.
            val intent = Intent(Intent.ACTION_VIEW, Uri.parse("nostrsigner:${args.content}"))
            // A remembered package may have been uninstalled; let Android
            // resolve any installed signer instead.
            args.signerPackage
                ?.takeIf { intent.setPackage(it).resolveActivity(activity.packageManager) != null }
                ?: intent.setPackage(null)
            intent.putExtra("type", args.type)
            args.pubkey?.let { intent.putExtra("pubkey", it) }
            args.currentUser?.let { intent.putExtra("current_user", it) }
            args.id?.let { intent.putExtra("id", it) }
            args.permissions?.let { intent.putExtra("permissions", it) }
            intent.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP)
            startActivityForResult(invoke, intent, "signerResult")
        } catch (ex: Exception) {
            invoke.reject(ex.message)
        }
    }

    @ActivityCallback
    private fun signerResult(invoke: Invoke, result: ActivityResult) {
        val data = result.data
        if (result.resultCode != Activity.RESULT_OK || data == null) {
            invoke.reject("Signer rejected the request", "REJECTED")
            return
        }
        val value = data.getStringExtra("result") ?: data.getStringExtra("signature")
        if (value.isNullOrEmpty()) {
            invoke.reject("Signer returned no result")
            return
        }
        val response = JSObject()
        response.put("result", value)
        data.getStringExtra("package")?.let { response.put("package", it) }
        data.getStringExtra("event")?.let { response.put("event", it) }
        invoke.resolve(response)
    }
}
