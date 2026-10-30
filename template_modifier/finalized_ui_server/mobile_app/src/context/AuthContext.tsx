import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User } from '../types';
import { api, DEFAULT_API_BASE_URL } from '../services/api';
import { ENV_CONFIG } from '../config/env';
import { AppStorage, STORAGE_KEYS } from '../utils/storage';

interface AuthContextType {
  user: User | null;
  token: string | null;
  apiBaseUrl: string;
  hasConnectedServer: boolean;
  setHasConnectedServer: (connected: boolean) => void;
  isInitializing: boolean;
  initialCheckError: string | null;
  isLoading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<boolean>;
  register: (name: string, email: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  updateApiBaseUrl: (newUrl: string) => void;
  disconnectServer: () => void;
  clearError: () => void;
  recheckServerConnection: () => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [apiBaseUrl, setApiBaseUrl] = useState<string>(
    ENV_CONFIG.TAILSCALE_FUNNEL_URL || ENV_CONFIG.DETECTED_API_BASE_URL || DEFAULT_API_BASE_URL
  );
  const [hasConnectedServer, setHasConnectedServer] = useState<boolean>(false);
  const [isInitializing, setIsInitializing] = useState<boolean>(true);
  const [initialCheckError, setInitialCheckError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Initial check on app startup:
  // 1. Restore logged-in user & token from storage
  // 2. Make the first call to the Tailscale Funnel URL
  //    - If successful -> bypass server connection screen!
  //    - If not successful -> present server connection screen with error
  useEffect(() => {
    const startupSequence = async () => {
      setIsInitializing(true);
      setInitialCheckError(null);

      // Restore saved user credentials (keep user logged in)
      try {
        const [savedToken, savedUserJson, savedUrl] = await Promise.all([
          AppStorage.getItem(STORAGE_KEYS.AUTH_TOKEN),
          AppStorage.getItem(STORAGE_KEYS.AUTH_USER),
          AppStorage.getItem(STORAGE_KEYS.API_BASE_URL),
        ]);

        let currentRestoredUser: User | null = null;
        let currentRestoredToken: string | null = null;

        if (savedToken && savedUserJson) {
          try {
            currentRestoredUser = JSON.parse(savedUserJson);
            currentRestoredToken = savedToken;
            setUser(currentRestoredUser);
            setToken(currentRestoredToken);
          } catch (e) {
            console.warn('Failed parsing stored user profile:', e);
          }
        }

        // Primary target: Tailscale Funnel URL
        const targetUrl = (
          ENV_CONFIG.TAILSCALE_FUNNEL_URL ||
          savedUrl ||
          ENV_CONFIG.DETECTED_API_BASE_URL ||
          DEFAULT_API_BASE_URL
        ).trim();

        setApiBaseUrl(targetUrl);

        // Make the first call to Tailscale Funnel URL
        const health = await api.checkHealth(targetUrl);
        const isOk =
          health.database === 'connected' ||
          health.status === 'online' ||
          health.status === 'healthy' ||
          health.status?.toLowerCase().includes('ok') ||
          health.status?.toLowerCase().includes('health');

        if (isOk) {
          // Connection success -> bypass server connection page!
          setHasConnectedServer(true);
          setInitialCheckError(null);
          await AppStorage.setItem(STORAGE_KEYS.API_BASE_URL, targetUrl);

          // If local storage didn't yield user (e.g. if native AsyncStorage is not yet linked in APK),
          // auto-restore active session from server!
          if (!currentRestoredUser || !currentRestoredToken) {
            try {
              const remoteSession = await api.fetchActiveSession(targetUrl);
              if (remoteSession && remoteSession.access_token && remoteSession.user) {
                setUser(remoteSession.user);
                setToken(remoteSession.access_token);
                await Promise.all([
                  AppStorage.setItem(STORAGE_KEYS.AUTH_TOKEN, remoteSession.access_token),
                  AppStorage.setItem(STORAGE_KEYS.AUTH_USER, JSON.stringify(remoteSession.user)),
                ]);
              }
            } catch (e) {
              // ignore
            }
          }
        } else {
          // Connection failed -> show server connection screen
          setHasConnectedServer(false);
          setInitialCheckError(
            `Tailscale Funnel unreachable (${health.status || 'Offline'}). Database: ${health.database || 'disconnected'}`
          );
        }
      } catch (err: any) {
        setHasConnectedServer(false);
        setInitialCheckError(err.message || 'Cannot reach Tailscale Funnel URL');
      } finally {
        setIsInitializing(false);
      }
    };

    startupSequence();
  }, []);

  const recheckServerConnection = async (): Promise<boolean> => {
    setIsLoading(true);
    try {
      const targetUrl = apiBaseUrl.trim() || ENV_CONFIG.TAILSCALE_FUNNEL_URL;
      const health = await api.checkHealth(targetUrl);
      const isOk =
        health.database === 'connected' ||
        health.status === 'online' ||
        health.status === 'healthy' ||
        health.status?.toLowerCase().includes('ok') ||
        health.status?.toLowerCase().includes('health');

      if (isOk) {
        setHasConnectedServer(true);
        setInitialCheckError(null);
        await AppStorage.setItem(STORAGE_KEYS.API_BASE_URL, targetUrl);
        return true;
      } else {
        setInitialCheckError(`Server returned status: ${health.status}`);
        return false;
      }
    } catch (err: any) {
      setInitialCheckError(err.message || 'Connection failed');
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (email: string, password: string): Promise<boolean> => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await api.login(apiBaseUrl, email, password);
      setUser(response.user);
      setToken(response.access_token);

      // Persist login state both locally & to server session
      await Promise.all([
        AppStorage.setItem(STORAGE_KEYS.AUTH_TOKEN, response.access_token),
        AppStorage.setItem(STORAGE_KEYS.AUTH_USER, JSON.stringify(response.user)),
        api.syncActiveSession(apiBaseUrl, {
          access_token: response.access_token,
          user: response.user,
        }),
      ]);

      return true;
    } catch (err: any) {
      setError(err.message || 'Login failed');
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const register = async (name: string, email: string, password: string): Promise<boolean> => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await api.register(apiBaseUrl, name, email, password);
      setUser(response.user);
      setToken(response.access_token);

      // Persist login state both locally & to server session
      await Promise.all([
        AppStorage.setItem(STORAGE_KEYS.AUTH_TOKEN, response.access_token),
        AppStorage.setItem(STORAGE_KEYS.AUTH_USER, JSON.stringify(response.user)),
        api.syncActiveSession(apiBaseUrl, {
          access_token: response.access_token,
          user: response.user,
        }),
      ]);

      return true;
    } catch (err: any) {
      setError(err.message || 'Registration failed');
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async (): Promise<void> => {
    setUser(null);
    setToken(null);
    setError(null);

    // Clear saved credentials locally & from server
    await Promise.all([
      AppStorage.removeItem(STORAGE_KEYS.AUTH_TOKEN),
      AppStorage.removeItem(STORAGE_KEYS.AUTH_USER),
      api.clearActiveSession(apiBaseUrl),
    ]);
  };

  const updateApiBaseUrl = (newUrl: string) => {
    const trimmed = newUrl.trim();
    if (trimmed) {
      setApiBaseUrl(trimmed);
      AppStorage.setItem(STORAGE_KEYS.API_BASE_URL, trimmed).catch(() => {});
    }
  };

  const disconnectServer = () => {
    setHasConnectedServer(false);
  };

  const clearError = () => setError(null);

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        apiBaseUrl,
        hasConnectedServer,
        setHasConnectedServer,
        isInitializing,
        initialCheckError,
        isLoading,
        error,
        login,
        register,
        logout,
        updateApiBaseUrl,
        disconnectServer,
        clearError,
        recheckServerConnection,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
