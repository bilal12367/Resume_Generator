import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { COLORS, SPACING, RADIUS, SHADOWS } from '../constants/theme';

interface ServerConfigModalProps {
  visible: boolean;
  onClose: () => void;
}

export const ServerConfigModal: React.FC<ServerConfigModalProps> = ({
  visible,
  onClose,
}) => {
  const { apiBaseUrl, updateApiBaseUrl } = useAuth();
  const [inputUrl, setInputUrl] = useState(apiBaseUrl);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    database?: string;
    status?: string;
    success?: boolean;
  } | null>(null);

  const presets = [
    { label: 'Tailscale Funnel (bilal1-job-scraper-2)', url: 'https://bilal1-job-scraper-2.taile80bab.ts.net' },
    { label: 'Android Emulator (10.0.2.2:8000)', url: 'http://10.0.2.2:8000' },
    { label: 'Localhost (127.0.0.1:8000)', url: 'http://localhost:8000' },
    { label: 'Port 8000 (LAN)', url: 'http://192.168.1.100:8000' },
  ];

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await api.checkHealth(inputUrl);
      const isOk = res.database === 'connected' || res.status === 'online';
      setTestResult({
        database: res.database,
        status: res.status,
        success: isOk,
      });
    } catch (err: any) {
      setTestResult({
        status: err.message || 'Offline',
        success: false,
      });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = () => {
    updateApiBaseUrl(inputUrl);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.header}>
            <View style={styles.headerTitleRow}>
              <Text style={styles.headerIcon}>⚙️</Text>
              <Text style={styles.title}>API Server Settings</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.body}>
            <Text style={styles.description}>
              Configure the backend API URL. If testing on Android Emulator, use{' '}
              <Text style={styles.bold}>http://10.0.2.2:8000</Text>.
            </Text>

            <Text style={styles.inputLabel}>API Base URL:</Text>
            <TextInput
              style={styles.input}
              value={inputUrl}
              onChangeText={setInputUrl}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="http://10.0.2.2:8000"
              placeholderTextColor={COLORS.textLight}
            />

            <Text style={styles.presetsLabel}>Quick Presets:</Text>
            <View style={styles.presetsGroup}>
              {presets.map((p, idx) => (
                <TouchableOpacity
                  key={idx}
                  style={[
                    styles.presetPill,
                    inputUrl === p.url && styles.activePresetPill,
                  ]}
                  onPress={() => setInputUrl(p.url)}
                >
                  <Text
                    style={[
                      styles.presetText,
                      inputUrl === p.url && styles.activePresetText,
                    ]}
                  >
                    {p.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {testResult && (
              <View
                style={[
                  styles.resultBox,
                  testResult.success ? styles.resultSuccess : styles.resultFailed,
                ]}
              >
                <Text
                  style={[
                    styles.resultText,
                    testResult.success ? styles.textSuccess : styles.textDanger,
                  ]}
                >
                  {testResult.success
                    ? `✅ Server connected! DB: ${testResult.database || 'Online'}`
                    : `⚠️ Unable to reach server (${testResult.status}). Mock mode active.`}
                </Text>
              </View>
            )}
          </View>

          <View style={styles.footer}>
            <TouchableOpacity
              style={styles.testBtn}
              onPress={handleTestConnection}
              disabled={testing}
            >
              {testing ? (
                <ActivityIndicator size="small" color={COLORS.primary} />
              ) : (
                <Text style={styles.testBtnText}>Test Ping</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
              <Text style={styles.saveBtnText}>Save & Apply</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.lg,
  },
  card: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.xl,
    width: '100%',
    maxWidth: 400,
    overflow: 'hidden',
    ...SHADOWS.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerIcon: {
    fontSize: 18,
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.textMain,
  },
  closeBtn: {
    width: 28,
    height: 28,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: {
    color: COLORS.textMuted,
    fontSize: 13,
    fontWeight: 'bold',
  },
  body: {
    padding: SPACING.md,
    gap: 10,
  },
  description: {
    fontSize: 12,
    color: COLORS.textSecondary,
    lineHeight: 18,
  },
  bold: {
    fontWeight: '700',
    color: COLORS.primary,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textMain,
    marginTop: 4,
  },
  input: {
    borderWidth: 1.5,
    borderColor: COLORS.primaryBorder,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: 10,
    fontSize: 13,
    color: COLORS.textMain,
    backgroundColor: COLORS.bg,
  },
  presetsLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textMuted,
    marginTop: 4,
  },
  presetsGroup: {
    gap: 6,
  },
  presetPill: {
    backgroundColor: COLORS.bg,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingVertical: 7,
    paddingHorizontal: SPACING.sm,
  },
  activePresetPill: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primaryLight,
  },
  presetText: {
    fontSize: 11,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
  activePresetText: {
    color: COLORS.primary,
    fontWeight: '700',
  },
  resultBox: {
    padding: SPACING.sm,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    marginTop: 6,
  },
  resultSuccess: {
    backgroundColor: COLORS.successLight,
    borderColor: COLORS.successBorder,
  },
  resultFailed: {
    backgroundColor: COLORS.warningLight,
    borderColor: COLORS.warningBorder,
  },
  resultText: {
    fontSize: 11,
    fontWeight: '600',
  },
  textSuccess: {
    color: '#065f46',
  },
  textDanger: {
    color: '#92400e',
  },
  footer: {
    flexDirection: 'row',
    padding: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    gap: SPACING.sm,
  },
  testBtn: {
    flex: 1,
    backgroundColor: COLORS.bg,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingVertical: 11,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  testBtnText: {
    color: COLORS.textMain,
    fontSize: 13,
    fontWeight: '700',
  },
  saveBtn: {
    flex: 1.2,
    backgroundColor: COLORS.primary,
    paddingVertical: 11,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOWS.sm,
  },
  saveBtnText: {
    color: COLORS.white,
    fontSize: 13,
    fontWeight: '700',
  },
});

