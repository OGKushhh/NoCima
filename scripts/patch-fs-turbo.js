#!/usr/bin/env node
/**
 * postinstall patch: react-native-fs-turbo@0.5.1
 *
 * react-native-fs-turbo ships AGP 8.13.0 in its own buildscript classpath,
 * which overrides the root project's AGP 8.6.0.  The newer AGP changes how
 * Prefab resolves native libraries, causing [CXX1210] "No compatible library
 * found" on react-native-screens and other modules that use CMake.
 *
 * This script comments out the conflicting AGP classpath line so that
 * the root project's AGP version is used everywhere.
 */

const fs = require('fs');
const path = require('path');

const TARGET_FILE = path.join(
  __dirname,
  '..',
  'node_modules',
  'react-native-fs-turbo',
  'android',
  'build.gradle'
);

if (!fs.existsSync(TARGET_FILE)) {
  console.log('[patch] react-native-fs-turbo build.gradle not found — skipping');
  process.exit(0);
}

let content = fs.readFileSync(TARGET_FILE, 'utf8');

const agpLine = '    classpath "com.android.tools.build:gradle:8.13.0"';
const commentedLine = '    // PATCHED: Removed AGP 8.13.0 (use root project AGP 8.6.0)';

if (content.includes(agpLine)) {
  content = content.replace(agpLine, commentedLine);
  fs.writeFileSync(TARGET_FILE, content, 'utf8');
  console.log('[patch] react-native-fs-turbo patched — commented out AGP 8.13.0');
} else if (content.includes('PATCHED: Removed AGP')) {
  console.log('[patch] react-native-fs-turbo already patched');
} else {
  console.log('[patch] react-native-fs-turbo has unexpected AGP version — skipping');
}