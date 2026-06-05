import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const manifestPath = 'android/app/src/main/AndroidManifest.xml';
const gradlePath = 'android/app/build.gradle';

function replaceOnce(content, searchValue, replaceValue) {
  if (!content.includes(searchValue)) {
    return content;
  }
  return content.replace(searchValue, replaceValue);
}

function ensureManifest() {
  if (!existsSync(manifestPath)) {
    throw new Error(`Missing ${manifestPath}. Run: npx cap add android`);
  }

  let manifest = readFileSync(manifestPath, 'utf8');

  const permissions = [
    '<uses-permission android:name="android.permission.INTERNET" />',
    '<uses-permission android:name="android.permission.CAMERA" />',
    '<uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" android:maxSdkVersion="32" />',
    '<uses-permission android:name="android.permission.READ_MEDIA_IMAGES" />',
    '<uses-permission android:name="android.permission.READ_MEDIA_VIDEO" />',
    '<uses-feature android:name="android.hardware.camera" android:required="false" />',
  ];

  for (const permission of permissions) {
    if (!manifest.includes(permission)) {
      manifest = manifest.replace('<application', `    ${permission}\n    <application`);
    }
  }

  manifest = replaceOnce(
    manifest,
    'android:label="@string/app_name"',
    'android:label="AI Chat"'
  );

  manifest = replaceOnce(
    manifest,
    'android:name=".MainActivity"',
    'android:name=".MainActivity"\n            android:screenOrientation="portrait"'
  );

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

ensureManifest();
ensureGradle();
console.log('Capacitor Android project patched for AI Chat.');
