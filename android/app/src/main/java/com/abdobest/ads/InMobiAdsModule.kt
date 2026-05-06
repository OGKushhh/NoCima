package com.abdobest.ads

import android.app.Activity
import android.util.Log
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.inmobi.ads.*
import com.inmobi.ads.listeners.InterstitialAdEventListener
import com.inmobi.sdk.InMobiSdk
import com.inmobi.sdk.SdkInitializationListener
import org.json.JSONObject

class InMobiAdsModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        private const val TAG = "InMobiAdsModule"
    }

    private val interstitials = mutableMapOf<Long, InMobiInterstitial>()
    private val rewardedAds = mutableMapOf<Long, InMobiInterstitial>()

    override fun getName(): String = "InMobiAds"

    @ReactMethod
    fun initialize(accountId: String, gdprConsent: Boolean) {
        val activity = currentActivity ?: run {
            Log.w(TAG, "initialize called with no Activity")
            return
        }
        try {
            val consent = JSONObject()
            // Using the correct key for GDPR consent
            consent.put(InMobiSdk.IM_GDPR_CONSENT_AVAILABLE, gdprConsent)
            InMobiSdk.init(activity, accountId, consent, object : SdkInitializationListener {
                // ✅ FIX: Use InMobiAdRequestStatus for SDK 10.7.4
                override fun onInitializationComplete(error: InMobiAdRequestStatus?) {
                    if (error != null) {
                        Log.e(TAG, "InMobi init error: ${error.message}")
                    } else {
                        Log.d(TAG, "InMobi SDK initialised")
                    }
                }
            })
        } catch (e: Exception) {
            Log.e(TAG, "initialize exception: ${e.message}")
        }
    }

    // ... (loadInterstitial, showInterstitial etc. remain same)

    @ReactMethod
    fun isInterstitialReady(placementId: Double, promise: Promise) {
        val pid = placementId.toLong()
        val ad = interstitials[pid]
        // ✅ FIX: Call isReady as a function
        promise.resolve(ad?.isReady() == true)
    }

    // ... (loadRewarded, showRewarded etc.)

    @ReactMethod
    fun isRewardedReady(placementId: Double, promise: Promise) {
        val pid = placementId.toLong()
        val ad = rewardedAds[pid]
        // ✅ FIX: Call isReady as a function
        promise.resolve(ad?.isReady() == true)
    }

    private fun getOrCreateInterstitial(
        pid: Long,
        activity: Activity,
        isRewarded: Boolean
    ): InMobiInterstitial {
        // ... (same as before)
    }

    private fun sendEvent(eventName: String, params: WritableMap?) {
        // ... (same as before)
    }

    @ReactMethod fun addListener(eventName: String) {}
    @ReactMethod fun removeListeners(count: Int) {}
}