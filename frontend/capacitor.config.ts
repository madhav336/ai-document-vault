import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.aibookmarkvault.app',
  appName: 'AI Document Vault',
  webDir: 'out',
  overrideUserAgent: 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
  server: {
    url: 'https://ai-doc-vault.vercel.app',
    allowNavigation: [
      'ai-doc-vault.vercel.app',
      '*.clerk.accounts.dev',
      'accounts.google.com'
    ],
    cleartext: true
  }
};

export default config;
