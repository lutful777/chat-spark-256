import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.lovable.chat_spark_256.capacitor',
  appName: 'AI Chat',
  webDir: 'dist',
  android: {
    allowMixedContent: true,
    webContentsDebuggingEnabled: false,
    captureInput: true,
  },
};

export default config;
