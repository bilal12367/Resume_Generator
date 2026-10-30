/**
 * Environment configuration helper.
 * Reads API_BASE_URL from process.env (or .env bundler),
 * configured according to hostname 'bilal1-job-scraper-2.taile80bab.ts.net'
 */

declare const process: any;

const getEnvBaseUrl = (): string | null => {
  try {
    if (typeof process !== 'undefined' && process.env) {
      if (process.env.API_BASE_URL && typeof process.env.API_BASE_URL === 'string') {
        const val = process.env.API_BASE_URL.trim();
        if (val.length > 0) return val;
      }
      if (process.env.REACT_APP_API_BASE_URL && typeof process.env.REACT_APP_API_BASE_URL === 'string') {
        const val = process.env.REACT_APP_API_BASE_URL.trim();
        if (val.length > 0) return val;
      }
      if (process.env.EXPO_PUBLIC_API_URL && typeof process.env.EXPO_PUBLIC_API_URL === 'string') {
        const val = process.env.EXPO_PUBLIC_API_URL.trim();
        if (val.length > 0) return val;
      }
    }
  } catch (e) {
    // ignore
  }
  return null;
};

export const ENV_CONFIG = {
  TAILSCALE_HOSTNAME: 'bilal1-job-scraper-2',
  TAILSCALE_FUNNEL_URL: 'https://bilal1-job-scraper-2.taile80bab.ts.net',
  DETECTED_API_BASE_URL: getEnvBaseUrl(),
  DEFAULT_FALLBACK_URL: 'https://bilal1-job-scraper-2.taile80bab.ts.net',
};
