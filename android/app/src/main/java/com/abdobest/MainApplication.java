package com.abdobest;

import android.app.Application;
import com.facebook.react.PackageList;
import com.facebook.react.ReactApplication;
import com.facebook.react.ReactNativeHost;
import com.facebook.react.ReactPackage;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint;
import com.facebook.react.defaults.DefaultReactHost;
import com.facebook.soloader.SoLoader;
import com.abdobest.nitro.NitroModulesPackage;
import java.util.List;

public class MainApplication extends Application implements ReactApplication {
    private final ReactNativeHost mReactNativeHost = new DefaultReactHost(this) {
        @Override
        protected boolean isNewArchEnabled() {
            return BuildConfig.NEW_ARCH_ENABLED;
        }
        
        @Override
        protected List<ReactPackage> getPackages() {
            List<ReactPackage> packages = super.getPackages();
            // Initialize Nitro modules
            ReactApplicationContext context = getReactInstanceManager().getCurrentReactContext();
            if (context != null) {
                NitroModulesPackage.install(context);
            }
            return packages;
        }
    };

    @Override
    public ReactNativeHost getReactNativeHost() {
        return mReactNativeHost;
    }

    @Override
    public void onCreate() {
        super.onCreate();
        SoLoader.init(this, false);
        if (BuildConfig.IS_NEW_ARCHITECTURE_ENABLED) {
            DefaultNewArchitectureEntryPoint.load();
        }
    }
}
