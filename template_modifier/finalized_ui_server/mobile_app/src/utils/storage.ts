import AsyncStorage from '@react-native-async-storage/async-storage';

// In-memory fallback in case storage fails in edge runtimes
const memoryCache = new Map<string, string>();

const getGlobalLocalStorage = (): any => {
  try {
    const g: any = typeof globalThis !== 'undefined' ? globalThis : undefined;
    if (g && g.localStorage) return g.localStorage;
    if (g && g.window && g.window.localStorage) return g.window.localStorage;
  } catch (e) {
    // ignore
  }
  return null;
};

export const AppStorage = {
  async getItem(key: string): Promise<string | null> {
    try {
      if (AsyncStorage && typeof AsyncStorage.getItem === 'function') {
        const val = await AsyncStorage.getItem(key);
        if (val !== null) return val;
      }
    } catch (e) {
      // fallback
    }

    try {
      const storage = getGlobalLocalStorage();
      if (storage) {
        return storage.getItem(key);
      }
    } catch (e) {
      // fallback
    }

    return memoryCache.get(key) || null;
  },

  async setItem(key: string, value: string): Promise<void> {
    try {
      if (AsyncStorage && typeof AsyncStorage.setItem === 'function') {
        await AsyncStorage.setItem(key, value);
        return;
      }
    } catch (e) {
      // fallback
    }

    try {
      const storage = getGlobalLocalStorage();
      if (storage) {
        storage.setItem(key, value);
        return;
      }
    } catch (e) {
      // fallback
    }

    memoryCache.set(key, value);
  },

  async removeItem(key: string): Promise<void> {
    try {
      if (AsyncStorage && typeof AsyncStorage.removeItem === 'function') {
        await AsyncStorage.removeItem(key);
        return;
      }
    } catch (e) {
      // fallback
    }

    try {
      const storage = getGlobalLocalStorage();
      if (storage) {
        storage.removeItem(key);
        return;
      }
    } catch (e) {
      // fallback
    }

    memoryCache.delete(key);
  },
};

export const STORAGE_KEYS = {
  API_BASE_URL: '@jobagent_api_base_url',
  AUTH_TOKEN: '@jobagent_auth_token',
  AUTH_USER: '@jobagent_auth_user',
  SEARCH_HISTORY: '@jobagent_search_history',
  LAST_KEYWORD: '@jobagent_last_keyword',
  SELECTED_CITIES: '@jobagent_selected_cities',
  SELECTED_COMPANIES: '@jobagent_selected_companies',
};
