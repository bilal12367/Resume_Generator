import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { ENV_CONFIG } from '../config/env';
import { COLORS, SPACING, RADIUS, SHADOWS } from '../constants/theme';

interface ServerConnectionScreenProps {
  onConnected: () => void;
}

export const ServerConnectionScreen: React.FC<ServerConnectionScreenProps> = ({
  onConnected,
}) => {
  const { apiBaseUrl, updateApiBaseUrl, initialCheckError } = useAuth();

  // Try from env first, then auth context default, then fallback
  const initialUrl =
    apiBaseUrl ||
    ENV_CONFIG.DETECTED_API_BASE_URL ||
    ENV_CONFIG.DEFAULT_FALLBACK_URL;

  const [inputUrl, setInputUrl] = useState<string>(initialUrl);
  const [testing, setTesting] = useState<boolean>(false);
  const [testResult, setTestResult] = useState<{
    database?: string;
    status?: string;
    success?: boolean;
    testedUrl?: string;
  } | null>(
    initialCheckError
      ? {
          database: 'disconnected',
          status: initialCheckError,
          success: false,
          testedUrl: initialUrl,
        }
      : null
  );

  const presets = [
    {
      id: 'tailscale',
      title: 'Tailscale Funnel (Live Public)',
      subtitle: 'bilal1-job-scraper-2.taile80bab.ts.net',
      url: 'https://bilal1-job-scraper-2.taile80bab.ts.net',
      icon: '🔒',
    },
    {
      id: 'emulator',
      title: 'Android Emulator',
      subtitle: 'Maps to host machine (10.0.2.2:8000)',
      url: 'http://10.0.2.2:8000',
      icon: '📱',
    },
    {
      id: 'localhost',
      title: 'Localhost (iOS / Web)',
      subtitle: 'Standard local dev port (127.0.0.1:8000)',
      url: 'http://localhost:8000',
      icon: '💻',
    },
    {
      id: 'lan',
      title: 'Wi-Fi / LAN IP',
      subtitle: 'Physical device on local network',
      url: 'http://192.168.1.100:8000',
      icon: '🌐',
    },
  ];

  // Auto-test if env URL is detected
  useEffect(() => {
    if (ENV_CONFIG.DETECTED_API_BASE_URL) {
      handleTestConnection(ENV_CONFIG.DETECTED_API_BASE_URL);
    }
  }, []);

  const handleTestConnection = async (urlToTest?: string) => {
    const target = (urlToTest || inputUrl).trim();
    if (!target) return;

    setTesting(true);
    setTestResult(null);
    try {
      const res = await api.checkHealth(target);
      const isOk =
        res.database === 'connected' ||
        res.status === 'online' ||
        res.status === 'healthy' ||
        res.status?.toLowerCase().includes('ok') ||
        res.status?.toLowerCase().includes('health');

      setTestResult({
        database: res.database,
        status: res.status,
        success: isOk,
        testedUrl: target,
      });

      if (isOk) {
        updateApiBaseUrl(target);
      }
    } catch (err: any) {
      setTestResult({
        status: err.message || 'Offline',
        success: false,
        testedUrl: target,
      });
    } finally {
      setTesting(false);
    }
  };

  const handleConnectAndContinue = () => {
    const clean = inputUrl.trim() || ENV_CONFIG.DEFAULT_FALLBACK_URL;
    if (testResult && !testResult.success) {
      Alert.alert(
        'Server Not Verified',
        `The server at ${clean} reported:\n\n${testResult.status}\n\nDo you want to proceed with this URL? Real API errors will be shown if requests fail.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Proceed Anyway',
            onPress: () => {
              updateApiBaseUrl(clean);
              onConnected();
            },
          },
        ]
      );
      return;
    }
    updateApiBaseUrl(clean);
    onConnected();
  };

  return (
    <KeyboardAvoidingView
      style={styles.keyboardContainer}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContainer}
        keyboardShouldPersistTaps="handled"
      >
        {/* Brand Header */}
        <View style={styles.brandContainer}>
          <View style={styles.logoBadge}>
            <Text style={styles.logoIcon}>🤖</Text>
          </View>
          <Text style={styles.brandTitle}>JobAgent AI</Text>
          <Text style={styles.brandSubtitle}>
            LinkedIn Job Search & ATS Modification Platform
          </Text>
        </View>

        {/* Server Setup Card */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>🔗 Server Connection</Text>
            <Text style={styles.cardSubtitle}>
              Connect the mobile app to your FastAPI backend server
            </Text>
          </View>

          {/* Environment Detection Status Banner */}
          {ENV_CONFIG.DETECTED_API_BASE_URL ? (
            <View style={styles.envBannerSuccess}>
              <Text style={styles.envBannerIcon}>🌱</Text>
              <View style={styles.envBannerTextGroup}>
                <Text style={styles.envBannerTitle}>Base URL detected from .env</Text>
                <Text style={styles.envBannerSub} numberOfLines={1}>
                  {ENV_CONFIG.DETECTED_API_BASE_URL}
                </Text>
              </View>
            </View>
          ) : (
            <View style={styles.envBannerInfo}>
              <Text style={styles.envBannerIcon}>ℹ️</Text>
              <View style={styles.envBannerTextGroup}>
                <Text style={styles.envBannerTitle}>No .env override found</Text>
                <Text style={styles.envBannerSub}>
                  Enter your backend IP below or select a quick preset
                </Text>
              </View>
            </View>
          )}

          {/* URL Input */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Backend Server URL:</Text>
            <View style={styles.inputContainer}>
              <Text style={styles.inputIcon}>🌐</Text>
              <TextInput
                style={styles.input}
                value={inputUrl}
                onChangeText={(text) => {
                  setInputUrl(text);
                  setTestResult(null);
                }}
                autoCapitalize="none"
                autoCorrect={false}
                placeholder="http://10.0.2.2:8000"
                placeholderTextColor={COLORS.textLight}
              />
              {inputUrl.length > 0 && (
                <TouchableOpacity
                  onPress={() => setInputUrl('')}
                  style={styles.clearBtn}
                >
                  <Text style={styles.clearBtnText}>✕</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* Preset Buttons */}
          <View style={styles.presetsSection}>
            <Text style={styles.presetsHeader}>Quick Select Presets:</Text>
            <View style={styles.presetsList}>
              {presets.map((preset) => {
                const isSelected = inputUrl === preset.url;
                return (
                  <TouchableOpacity
                    key={preset.id}
                    style={[
                      styles.presetCard,
                      isSelected && styles.presetCardActive,
                    ]}
                    onPress={() => {
                      setInputUrl(preset.url);
                      setTestResult(null);
                    }}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.presetIcon}>{preset.icon}</Text>
                    <View style={styles.presetTextGroup}>
                      <Text
                        style={[
                          styles.presetTitle,
                          isSelected && styles.presetTitleActive,
                        ]}
                      >
                        {preset.title}
                      </Text>
                      <Text style={styles.presetUrl}>{preset.url}</Text>
                    </View>
                    <View
                      style={[
                        styles.radioCircle,
                        isSelected && styles.radioCircleActive,
                      ]}
                    >
                      {isSelected && <View style={styles.radioDot} />}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Test Status Banner */}
          {testResult && (
            <View
              style={[
                styles.resultCard,
                testResult.success ? styles.resultCardSuccess : styles.resultCardFailed,
              ]}
            >
              <Text style={styles.resultIcon}>
                {testResult.success ? '✅' : '⚠️'}
              </Text>
              <View style={styles.resultTextGroup}>
                <Text
                  style={[
                    styles.resultTitle,
                    testResult.success ? styles.textSuccess : styles.textDanger,
                  ]}
                >
                  {testResult.success
                    ? 'Server connection verified!'
                    : 'Server unreachable at this address'}
                </Text>
                <Text style={styles.resultDetail}>
                  {testResult.success
                    ? `Database: ${testResult.database || 'online'} • URL: ${testResult.testedUrl}`
                    : `Error: ${testResult.status} (Database: ${testResult.database || 'disconnected'})`}
                </Text>
              </View>
            </View>
          )}

          {/* Action Buttons */}
          <View style={styles.actionButtonsContainer}>
            <TouchableOpacity
              style={styles.testBtn}
              onPress={() => handleTestConnection()}
              disabled={testing}
              activeOpacity={0.8}
            >
              {testing ? (
                <View style={styles.loadingRow}>
                  <ActivityIndicator size="small" color={COLORS.primary} />
                  <Text style={styles.testBtnText}>Testing Ping...</Text>
                </View>
              ) : (
                <Text style={styles.testBtnText}>⚡ Test Connection</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.connectBtn}
              onPress={handleConnectAndContinue}
              activeOpacity={0.85}
            >
              <Text style={styles.connectBtnText}>
                Connect & Continue ➡️
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        <Text style={styles.footerNote}>
          You can change the server connection anytime from the top header badge.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  keyboardContainer: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  scrollContainer: {
    flexGrow: 1,
    padding: SPACING.lg,
    justifyContent: 'center',
  },
  brandContainer: {
    alignItems: 'center',
    marginBottom: SPACING.xl,
  },
  logoBadge: {
    width: 68,
    height: 68,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.primaryLight,
    borderWidth: 2,
    borderColor: COLORS.primaryBorder,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.sm,
    ...SHADOWS.purple,
  },
  logoIcon: {
    fontSize: 34,
  },
  brandTitle: {
    fontSize: 26,
    fontWeight: '900',
    color: COLORS.textMain,
    letterSpacing: -0.5,
  },
  brandSubtitle: {
    fontSize: 13,
    color: COLORS.textMuted,
    textAlign: 'center',
    marginTop: 4,
    maxWidth: 280,
  },
  card: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.xl,
    padding: SPACING.xl,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: SPACING.md,
    ...SHADOWS.md,
  },
  cardHeader: {
    gap: 4,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.textMain,
  },
  cardSubtitle: {
    fontSize: 12,
    color: COLORS.textMuted,
  },
  envBannerSuccess: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.successLight,
    borderWidth: 1,
    borderColor: COLORS.successBorder,
    borderRadius: RADIUS.md,
    padding: SPACING.sm,
    gap: 10,
  },
  envBannerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.bg,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    padding: SPACING.sm,
    gap: 10,
  },
  envBannerIcon: {
    fontSize: 18,
  },
  envBannerTextGroup: {
    flex: 1,
  },
  envBannerTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textMain,
  },
  envBannerSub: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginTop: 1,
  },
  inputGroup: {
    gap: 6,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textMain,
    textTransform: 'uppercase',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: COLORS.primaryBorder,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.bg,
    paddingHorizontal: SPACING.sm,
  },
  inputIcon: {
    fontSize: 14,
    marginRight: 6,
  },
  input: {
    flex: 1,
    paddingVertical: 11,
    fontSize: 13,
    color: COLORS.textMain,
  },
  clearBtn: {
    padding: 6,
  },
  clearBtnText: {
    fontSize: 12,
    color: COLORS.textMuted,
    fontWeight: 'bold',
  },
  presetsSection: {
    gap: 8,
  },
  presetsHeader: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textMuted,
    textTransform: 'uppercase',
  },
  presetsList: {
    gap: 8,
  },
  presetCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.bg,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    padding: SPACING.sm,
    gap: 10,
  },
  presetCardActive: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primaryLight,
  },
  presetIcon: {
    fontSize: 18,
  },
  presetTextGroup: {
    flex: 1,
  },
  presetTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textMain,
  },
  presetTitleActive: {
    color: COLORS.primary,
  },
  presetUrl: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginTop: 2,
    fontFamily: 'monospace',
  },
  radioCircle: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioCircleActive: {
    borderColor: COLORS.primary,
  },
  radioDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.primary,
  },
  resultCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.sm,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    gap: 10,
  },
  resultCardSuccess: {
    backgroundColor: COLORS.successLight,
    borderColor: COLORS.successBorder,
  },
  resultCardFailed: {
    backgroundColor: COLORS.warningLight,
    borderColor: COLORS.warningBorder,
  },
  resultIcon: {
    fontSize: 18,
  },
  resultTextGroup: {
    flex: 1,
  },
  resultTitle: {
    fontSize: 12,
    fontWeight: '700',
  },
  resultDetail: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  textSuccess: {
    color: '#065f46',
  },
  textDanger: {
    color: '#92400e',
  },
  actionButtonsContainer: {
    gap: 10,
    marginTop: 6,
  },
  testBtn: {
    backgroundColor: COLORS.bg,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    paddingVertical: 12,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  testBtnText: {
    color: COLORS.textMain,
    fontSize: 13,
    fontWeight: '700',
  },
  connectBtn: {
    backgroundColor: COLORS.primary,
    paddingVertical: 13,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOWS.purple,
  },
  connectBtnText: {
    color: COLORS.white,
    fontSize: 14,
    fontWeight: '800',
  },
  demoModeBtn: {
    paddingVertical: 10,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primaryLight,
    borderWidth: 1,
    borderColor: COLORS.primaryBorder,
  },
  demoModeBtnText: {
    color: COLORS.primary,
    fontSize: 12,
    fontWeight: '700',
  },
  footerNote: {
    textAlign: 'center',
    fontSize: 11,
    color: COLORS.textLight,
    marginTop: SPACING.xl,
    paddingHorizontal: SPACING.md,
  },
});

