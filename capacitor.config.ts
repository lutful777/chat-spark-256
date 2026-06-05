import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.lovable.chat_spark_256.capacitor',
  appName: 'AI Chat',
  webDir: 'dist',
  server: {
    url: 'https://chat-spark-256.vercel.app/?apk=capacitor-1.0.0',
    cleartext: false,
    allowNavigation: ['chat-spark-256.vercel.app'],
  },
  android: {
    allowMixedContent: true,
    webContentsDebuggingEnabled: false,
    captureInput: true,
  },
};

export default config;
