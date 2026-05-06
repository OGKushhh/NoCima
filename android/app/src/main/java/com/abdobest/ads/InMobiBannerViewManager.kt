package com.abdobest.ads

import android.util.Log
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.annotations.ReactProp
import com.inmobi.ads.InMobiBanner
import com.inmobi.ads.InMobiAdRequestStatus
import com.inmobi.ads.AdMetaInfo
import com.inmobi.ads.listeners.BannerAdEventListener

/**
 * InMobiBannerViewManager
 *
 * Registers the native view "InMobiBannerView" used by TopBannerAd.tsx.
 * Accepts a `placementId` prop and automatically loads + shows a banner.
 */
class InMobiBannerViewManager(
    private val reactContext: ReactApplicationContext
) : SimpleViewManager<FrameLayout>() {

    companion object {
        private const val TAG = "InMobiBannerViewManager"
    }

    override fun getName(): String = "InMobiBannerView"

    override fun createViewInstance(context: ThemedReactContext): FrameLayout {
        return FrameLayout(context)
    }

    @ReactProp(name = "placementId")
    fun setPlacementId(view: FrameLayout, placementId: Double) {
        val pid = placementId.toLong()
        // Remove any existing banner
        view.removeAllViews()

        // Create new banner with the correct placement ID
        val banner = InMobiBanner(view.context, pid).apply {
            setEnableAutoRefresh(false)
            setAnimationType(InMobiBanner.AnimationType.ROTATE_HORIZONTAL_AXIS)
            setListener(object : BannerAdEventListener() {
                override fun onAdLoadSucceeded(ad: InMobiBanner, adMetaInfo: AdMetaInfo) {
                    Log.d(TAG, "Banner loaded pid=$pid")
                    ad.visibility = View.VISIBLE
                }

                override fun onAdLoadFailed(ad: InMobiBanner, status: InMobiAdRequestStatus) {
                    Log.w(TAG, "Banner failed pid=$pid status=${status.message}")
                }

                override fun onAdDisplayed(ad: InMobiBanner, adMetaInfo: AdMetaInfo) {
                    // Optional: track impression
                }

                override fun onAdClicked(ad: InMobiBanner) {
                    // Optional: track click
                }

                override fun onAdImpression(ad: InMobiBanner) {
                    // Optional: track impression
                }

                override fun onUserLeftApplication(ad: InMobiBanner) {
                    // Optional: handle user leaving app
                }

                override fun onAdDismissed(ad: InMobiBanner) {
                    // Optional: handle ad closure (for banners this is rare)
                }
            })
            load()
        }

        view.addView(banner, ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
    }
}