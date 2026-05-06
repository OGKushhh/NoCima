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

/**
 * InMobiAdsModule for SDK 10.7.4
 */
class InMobiAdsModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        private const val TAG = "InMobiAdsModule"
    }

    private val interstitials = mutableMapOf<Long, InMobiInterstitial>()
    private val rewardedAds   = mutableMapOf<Long, InMobiInterstitial>()

    override fun getName(): String = "InMobiAds"

    @ReactMethod
    fun initialize(accountId: String, gdprConsent: Boolean) {
        val activity = currentActivity ?: run {
            Log.w(TAG, "initialize called with no Activity")
            return
        }
        try {
            val consent = JSONObject()
            consent.put(InMobiSdk.IM_GDPR_CONSENT_AVAILABLE, gdprConsent)
            InMobiSdk.setLogLevel(InMobiSdk.LogLevel.NONE)
            InMobiSdk.init(activity, accountId, consent, object : SdkInitializationListener {
                // ✅ Use InMobiAdRequestStatus? (not Error) for SDK 10.7.4
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

    @ReactMethod
    fun loadInterstitial(placementId: Double) {
        val pid = placementId.toLong()
        val activity = currentActivity ?: return
        UiThreadUtil.runOnUiThread {
            val ad = getOrCreateInterstitial(pid, activity, isRewarded = false)
            ad.load()
        }
    }

    @ReactMethod
    fun showInterstitial(placementId: Double) {
        val pid = placementId.toLong()
        UiThreadUtil.runOnUiThread {
            interstitials[pid]?.show() ?: Log.w(TAG, "showInterstitial: no ad for $pid")
        }
    }

    @ReactMethod
    fun isInterstitialReady(placementId: Double, promise: Promise) {
        val pid = placementId.toLong()
        val ad = interstitials[pid]
        promise.resolve(ad?.isReady() == true)   // ✅ function call
    }

    @ReactMethod
    fun loadRewarded(placementId: Double) {
        val pid = placementId.toLong()
        val activity = currentActivity ?: return
        UiThreadUtil.runOnUiThread {
            val ad = getOrCreateInterstitial(pid, activity, isRewarded = true)
            ad.load()
        }
    }

    @ReactMethod
    fun showRewarded(placementId: Double) {
        val pid = placementId.toLong()
        UiThreadUtil.runOnUiThread {
            rewardedAds[pid]?.show() ?: Log.w(TAG, "showRewarded: no ad for $pid")
        }
    }

    @ReactMethod
    fun isRewardedReady(placementId: Double, promise: Promise) {
        val pid = placementId.toLong()
        val ad = rewardedAds[pid]
        promise.resolve(ad?.isReady() == true)   // ✅ function call
    }

    private fun getOrCreateInterstitial(
        pid: Long,
        activity: Activity,
        isRewarded: Boolean
    ): InMobiInterstitial {
        val map = if (isRewarded) rewardedAds else interstitials
        return map.getOrPut(pid) {
            InMobiInterstitial(activity, pid, object : InterstitialAdEventListener() {
                override fun onAdLoadSucceeded(ad: InMobiInterstitial, info: AdMetaInfo) {
                    Log.d(TAG, "Ad loaded: pid=$pid rewarded=$isRewarded")
                }

                override fun onAdLoadFailed(ad: InMobiInterstitial, status: InMobiAdRequestStatus) {
                    Log.w(TAG, "Ad load failed: pid=$pid status=${status.message}")
                    map.remove(pid)
                }

                override fun onAdDisplayed(ad: InMobiInterstitial, info: AdMetaInfo) {
                    Log.d(TAG, "Ad displayed: pid=$pid")
                }

                override fun onAdDismissed(ad: InMobiInterstitial) {
                    Log.d(TAG, "Ad dismissed: pid=$pid")
                    map.remove(pid)
                    sendEvent("InMobiInterstitialDismissed", null)
                }

                override fun onUserLeftApplication(ad: InMobiInterstitial) {}

                override fun onRewardsUnlocked(ad: InMobiInterstitial, rewards: MutableMap<Any?, Any?>?) {
                    if (isRewarded) {
                        Log.d(TAG, "Reward granted: pid=$pid")
                        sendEvent("InMobiRewardedAdRewarded", null)
                    }
                }
            })
        }
    }

    private fun sendEvent(eventName: String, params: WritableMap?) {
        reactContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(eventName, params)
    }

    @ReactMethod fun addListener(eventName: String) {}
    @ReactMethod fun removeListeners(count: Int) {}
}