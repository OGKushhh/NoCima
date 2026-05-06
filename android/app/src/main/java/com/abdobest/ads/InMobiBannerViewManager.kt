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
        view.removeAllViews()

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

                // ✅ FIX: Removed 'onAdDisplayed' and 'onAdClicked' as they don't exist in this SDK version
            })
            load()
        }

        view.addView(banner, ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
    }
}