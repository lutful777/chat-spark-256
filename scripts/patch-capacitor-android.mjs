import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const manifestPath = 'android/app/src/main/AndroidManifest.xml';
const gradlePath = 'android/app/build.gradle';
const filePathsPath = 'android/app/src/main/res/xml/file_paths.xml';

function ensureManifest() {
  if (!existsSync(manifestPath)) {
    throw new Error(`Missing ${manifestPath}. Run: npx cap add android`);
  }

  let manifest = readFileSync(manifestPath, 'utf8');

  // Idempotent permission injection
  const permissions = [
    '<uses-permission android:name="android.permission.INTERNET" />',
    '<uses-permission android:name="android.permission.CAMERA" />',
    '<uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" android:maxSdkVersion="32" />',
    '<uses-permission android:name="android.permission.READ_MEDIA_IMAGES" />',
    '<uses-permission android:name="android.permission.READ_MEDIA_VIDEO" />',
    '<uses-feature android:name="android.hardware.camera" android:required="false" />',
  ];

  for (const perm of permissions) {
    if (!manifest.includes(perm)) {
      manifest = manifest.replace('<application', `    ${perm}\n    <application`);
    }
  }

  // Fix app label
  if (manifest.includes('android:label="@string/app_name"')) {
    manifest = manifest.replace('android:label="@string/app_name"', 'android:label="AI Chat"');
  }

  // Portrait orientation — only inject if not already present
  if (!manifest.includes('android:screenOrientation')) {
    manifest = manifest.replace(
      'android:name=".MainActivity"',
      'android:name=".MainActivity"\n            android:screenOrientation="portrait"'
    );
  }

  // Keyboard resize mode — prevent viewport shrink on soft keyboard open
  if (!manifest.includes('android:windowSoftInputMode')) {
    manifest = manifest.replace(
      'android:name=".MainActivity"',
      'android:name=".MainActivity"\n            android:windowSoftInputMode="adjustResize"'
    );
  }

  writeFileSync(manifestPath, manifest);
}

function ensureGradle() {
  if (!existsSync(gradlePath)) {
    throw new Error(`Missing ${gradlePath}. Run: npx cap add android`);
  }

  let gradle = readFileSync(gradlePath, 'utf8');

  gradle = gradle.replace(/applicationId\s+"[^"]+"/, 'applicationId "app.lovable.chat_spark_256.capacitor"');
  gradle = gradle.replace(/versionCode\s+\d+/, 'versionCode 1');
  gradle = gradle.replace(/versionName\s+"[^"]+"/, 'versionName "1.0.0"');

  writeFileSync(gradlePath, gradle);
}

function ensureFilePaths() {
  if (!existsSync(filePathsPath)) return;

  const content = `<?xml version="1.0" encoding="utf-8"?>
<paths xmlns:android="http://schemas.android.com/apk/res/android">
    <external-path name="my_images" path="." />
    <external-files-path name="my_external_files" path="." />
    <cache-path name="my_cache_images" path="." />
    <files-path name="my_files" path="." />
</paths>`;

  writeFileSync(filePathsPath, content);
}

ensureManifest();
ensureGradle();
ensureFilePaths();
console.log('Capacitor Android project patched for AI Chat.');
