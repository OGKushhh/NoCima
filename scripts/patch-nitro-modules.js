#!/usr/bin/env node
/**
 * postinstall patch: react-native-nitro-modules@0.35.5
 *
 * Patch 1 — NitroModulesPackage.kt: ReactModuleInfo 6-arg → 7-arg constructor.
 *   RN 0.76+ requires `hasConstants` parameter.
 *
 * Patch 2 — build.gradle: Comment out the AGP 9.2.0 classpath line.
 *   Our root project uses AGP 8.6.0.  AGP 9.2.0 requires Gradle 8.12+ (we're
 *   on 8.10.2) and ships a different Prefab/CMake integration that causes
 *   [CXX1210] "No compatible library found" on arm64-v8a.
 *
 * Runs automatically via the "postinstall" npm hook after every `npm install`.
 */

const fs = require('fs');
const path = require('path');

const NITRO_ROOT = path.join(__dirname, '..', 'node_modules', 'react-native-nitro-modules', 'android');

// ── Patch 1: NitroModulesPackage.kt ──────────────────────────────────────────
const packageFile = path.join(
  NITRO_ROOT, 'src', 'main', 'java', 'com', 'margelo', 'nitro', 'NitroModulesPackage.kt'
);

if (fs.existsSync(packageFile)) {
  let content = fs.readFileSync(packageFile, 'utf8');

  if (content.includes('hasConstants = false')) {
    console.log('[patch 1] NitroModulesPackage.kt already patched');
  } else {
    const oldStr = '          isTurboModule = isTurboModule,\n        )';
    const newStr = '          isTurboModule = isTurboModule,\n          hasConstants = false,\n        )';
    if (content.includes(oldStr)) {
      content = content.replace(oldStr, newStr);
      fs.writeFileSync(packageFile, content, 'utf8');
      console.log('[patch 1] NitroModulesPackage.kt patched — added hasConstants');
    } else {
      console.warn('[patch 1] NitroModulesPackage.kt — unexpected content, manual check needed');
      process.exit(1);
    }
  }
} else {
  console.log('[patch 1] NitroModulesPackage.kt not found — skipping');
}

// ── Patch 2: build.gradle — neutralize AGP 9.2.0 classpath ───────────────────
const buildGradle = path.join(NITRO_ROOT, 'build.gradle');

if (fs.existsSync(buildGradle)) {
  let content = fs.readFileSync(buildGradle, 'utf8');

  const agpLine = '    classpath "com.android.tools.build:gradle:9.2.0"';
  const commentedAgpLine = '    // PATCHED: Removed AGP 9.2.0 (requires Gradle 8.12+, we use 8.10.2 + AGP 8.6.0)';

  if (content.includes(agpLine)) {
    content = content.replace(agpLine, commentedAgpLine);
    fs.writeFileSync(buildGradle, content, 'utf8');
    console.log('[patch 2] build.gradle patched — commented out AGP 9.2.0 classpath');
  } else if (content.includes('PATCHED: Removed AGP')) {
    console.log('[patch 2] build.gradle already patched');
  } else {
    console.log('[patch 2] build.gradle has unexpected content — skipping');
  }
} else {
  console.log('[patch 2] build.gradle not found — skipping');
}

console.log('[patch] All nitro-modules patches applied');