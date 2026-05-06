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

// ❌ NO import com.inmobi.sdk.Error

class InMobiAdsModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    private val interstitials = mutableMapOf<Long, InMobiInterstitial>()
    private val rewardedAds   = mutableMapOf<Long, InMobiInterstitial>()

    override fun getName(): String = "InMobiAds"

    @ReactMethod
    fun initialize(accountId: String, gdprConsent: Boolean) {
        val activity = currentActivity ?: return
        try {
            val consent = JSONObject()
            consent.put(InMobiSdk.IM_GDPR_CONSENT_AVAILABLE, gdprConsent)
            InMobiSdk.init(activity, accountId, consent, object : SdkInitializationListener {
                override fun onInitializationComplete(error: InMobiAdRequestStatus?) { // ✅ correct type
                    if (error != null) {
                        Log.e("InMobiAds", "init error: ${error.message}")
                    } else {
                        Log.d("InMobiAds", "init success")
                    }
                }
            })
        } catch (e: Exception) { Log.e("InMobiAds", "init exception", e) }
    }

    @ReactMethod
    fun isInterstitialReady(placementId: Double, promise: Promise) {
        promise.resolve(interstitials[placementId.toLong()]?.isReady() == true) // ✅ function call
    }

    @ReactMethod
    fun isRewardedReady(placementId: Double, promise: Promise) {
        promise.resolve(rewardedAds[placementId.toLong()]?.isReady() == true)   // ✅ function call
    }

    // ... rest of your methods (load, show, etc.) unchanged
}