package com.abdobest.ads

import android.util.Log
import android.view.View
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.annotations.ReactProp
import com.inmobi.ads.InMobiBanner
import com.inmobi.ads.listeners.BannerAdEventListener

/**
 * InMobiBannerViewManager
 *
 * Registers the native view "InMobiBannerView" used by TopBannerAd.tsx.
 * Accepts a `placementId` prop and automatically loads + shows a 320×50 banner.
 */
class InMobiBannerViewManager(
    private val reactContext: ReactApplicationContext
) : SimpleViewManager<InMobiBanner>() {

    companion object {
        private const val TAG = "InMobiBannerViewManager"
    }

    override fun getName(): String = "InMobiBannerView"

    override fun createViewInstance(context: ThemedReactContext): InMobiBanner {
        return InMobiBanner(context, -1L) // placeholder; real pid set via prop
    }

    @ReactProp(name = "placementId")
    fun setPlacementId(view: InMobiBanner, placementId: Double) {
        // InMobiBanner doesn't allow changing the placement after construction,
        // so we must swap out the view's tag and reload.
        // The cleanest way is to configure then load.
        view.tag = placementId.toLong()
        view.setEnableAutoRefresh(false)
        view.setAnimationType(InMobiBanner.AnimationType.ROTATE_HORIZONTAL_AXIS)
        view.setListener(object : BannerAdEventListener() {
            override fun onAdLoadSucceeded(ad: InMobiBanner) {
                Log.d(TAG, "Banner loaded pid=${placementId.toLong()}")
                ad.visibility = View.VISIBLE
            }
            override fun onAdLoadFailed(ad: InMobiBanner, status: com.inmobi.ads.InMobiAdRequestStatus) {
                Log.w(TAG, "Banner failed pid=${placementId.toLong()} status=${status.message}")
            }
        })
        view.load()
    }
}
