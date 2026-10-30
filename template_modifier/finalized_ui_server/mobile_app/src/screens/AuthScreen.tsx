import React, { useState } from 'react';
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
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { COLORS, SPACING, RADIUS, SHADOWS } from '../constants/theme';

interface AuthScreenProps {
  onOpenServerConfig: () => void;
}

export const AuthScreen: React.FC<AuthScreenProps> = ({ onOpenServerConfig }) => {
  const { login, register, isLoading, error, clearError, apiBaseUrl, disconnectServer } = useAuth();

  const [tab, setTab] = useState<'login' | 'register'>('login');

  // Login form
  const [loginEmail, setLoginEmail] = useState('candidate@example.com');
  const [loginPassword, setLoginPassword] = useState('password123');

  // Register form
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirmPassword, setRegConfirmPassword] = useState('');

  // Local validation message
  const [localMsg, setLocalMsg] = useState<{ text: string; type: 'error' | 'success' } | null>(null);

  const handleLoginSubmit = async () => {
    setLocalMsg(null);
    clearError();
    if (!loginEmail.trim() || !loginPassword.trim()) {
      setLocalMsg({ text: 'Please enter your email and password.', type: 'error' });
      return;
    }

    const success = await login(loginEmail.trim(), loginPassword);
    if (!success) {
      setLocalMsg({ text: error || 'Failed to sign in. Check server connection.', type: 'error' });
    }
  };

  const handleRegisterSubmit = async () => {
    setLocalMsg(null);
    clearError();
    if (!regName.trim() || !regEmail.trim() || !regPassword.trim() || !regConfirmPassword.trim()) {
      setLocalMsg({ text: 'Please fill in all registration fields.', type: 'error' });
      return;
    }
    if (regPassword !== regConfirmPassword) {
      setLocalMsg({ text: 'Passwords do not match.', type: 'error' });
      return;
    }

    const success = await register(regName.trim(), regEmail.trim(), regPassword);
    if (!success) {
      setLocalMsg({ text: error || 'Registration failed.', type: 'error' });
    }
  };

  const handleDemoLogin = async () => {
    setLoginEmail('candidate@example.com');
    setLoginPassword('password123');
    await login('candidate@example.com', 'password123');
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
        {/* Top Server Host Info Badge */}
        <View style={styles.topBar}>
          <TouchableOpacity
            style={styles.changeServerBtn}
            onPress={disconnectServer}
            activeOpacity={0.7}
          >
            <Text style={styles.changeServerText}>← Change Server</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.serverPill}
            onPress={onOpenServerConfig}
            activeOpacity={0.8}
          >
            <View style={styles.dot} />
            <Text style={styles.serverPillText} numberOfLines={1}>
              API: {apiBaseUrl.replace(/^https?:\/\//, '')}
            </Text>
            <Text style={styles.serverGearIcon}>⚙️</Text>
          </TouchableOpacity>
        </View>

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

        {/* Card */}
        <View style={styles.card}>
          {/* Tab Selector */}
          <View style={styles.tabBar}>
            <TouchableOpacity
              style={[styles.tabBtn, tab === 'login' && styles.activeTabBtn]}
              onPress={() => {
                setTab('login');
                setLocalMsg(null);
                clearError();
              }}
            >
              <Text style={[styles.tabBtnText, tab === 'login' && styles.activeTabBtnText]}>
                Sign In
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tabBtn, tab === 'register' && styles.activeTabBtn]}
              onPress={() => {
                setTab('register');
                setLocalMsg(null);
                clearError();
              }}
            >
              <Text style={[styles.tabBtnText, tab === 'register' && styles.activeTabBtnText]}>
                Create Account
              </Text>
            </TouchableOpacity>
          </View>

          {/* Alert Message */}
          {(localMsg || error) && (
            <View
              style={[
                styles.alertBox,
                (localMsg?.type === 'success' ? styles.alertSuccess : styles.alertError),
              ]}
            >
              <Text
                style={[
                  styles.alertText,
                  (localMsg?.type === 'success' ? styles.alertTextSuccess : styles.alertTextError),
                ]}
              >
                {localMsg?.text || error}
              </Text>
            </View>
          )}

          {tab === 'login' ? (
            /* Login Form */
            <View style={styles.form}>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Email Address</Text>
                <TextInput
                  style={styles.input}
                  placeholder="candidate@company.com"
                  placeholderTextColor={COLORS.textLight}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  value={loginEmail}
                  onChangeText={setLoginEmail}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Password</Text>
                <TextInput
                  style={styles.input}
                  placeholder="••••••••"
                  placeholderTextColor={COLORS.textLight}
                  secureTextEntry
                  value={loginPassword}
                  onChangeText={setLoginPassword}
                />
              </View>

              <TouchableOpacity
                style={styles.submitBtn}
                onPress={handleLoginSubmit}
                disabled={isLoading}
                activeOpacity={0.85}
              >
                {isLoading ? (
                  <ActivityIndicator color={COLORS.white} size="small" />
                ) : (
                  <Text style={styles.submitBtnText}>Sign In to JobAgent</Text>
                )}
              </TouchableOpacity>
            </View>
          ) : (
            /* Register Form */
            <View style={styles.form}>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Full Name</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Bilal Developer"
                  placeholderTextColor={COLORS.textLight}
                  value={regName}
                  onChangeText={setRegName}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Email Address</Text>
                <TextInput
                  style={styles.input}
                  placeholder="user@example.com"
                  placeholderTextColor={COLORS.textLight}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  value={regEmail}
                  onChangeText={setRegEmail}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Password</Text>
                <TextInput
                  style={styles.input}
                  placeholder="••••••••"
                  placeholderTextColor={COLORS.textLight}
                  secureTextEntry
                  value={regPassword}
                  onChangeText={setRegPassword}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Confirm Password</Text>
                <TextInput
                  style={styles.input}
                  placeholder="••••••••"
                  placeholderTextColor={COLORS.textLight}
                  secureTextEntry
                  value={regConfirmPassword}
                  onChangeText={setRegConfirmPassword}
                />
              </View>

              <TouchableOpacity
                style={styles.submitBtn}
                onPress={handleRegisterSubmit}
                disabled={isLoading}
                activeOpacity={0.85}
              >
                {isLoading ? (
                  <ActivityIndicator color={COLORS.white} size="small" />
                ) : (
                  <Text style={styles.submitBtnText}>Create Account</Text>
                )}
              </TouchableOpacity>
            </View>
          )}
        </View>

        <Text style={styles.footerNote}>
          Automated multi-agent job scraper & ATS resume compiler
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
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.md,
  },
  changeServerBtn: {
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  changeServerText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.primary,
  },
  serverPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 6,
    ...SHADOWS.sm,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.success,
  },
  serverPillText: {
    fontSize: 11,
    color: COLORS.textSecondary,
    fontWeight: '600',
    maxWidth: 160,
  },
  serverGearIcon: {
    fontSize: 12,
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
    ...SHADOWS.md,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: COLORS.bg,
    borderRadius: RADIUS.md,
    padding: 4,
    marginBottom: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: RADIUS.sm,
  },
  activeTabBtn: {
    backgroundColor: COLORS.primary,
    ...SHADOWS.sm,
  },
  tabBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textMuted,
  },
  activeTabBtnText: {
    color: COLORS.white,
  },
  alertBox: {
    padding: SPACING.md,
    borderRadius: RADIUS.md,
    marginBottom: SPACING.md,
  },
  alertError: {
    backgroundColor: COLORS.dangerLight,
    borderWidth: 1,
    borderColor: COLORS.dangerBorder,
  },
  alertSuccess: {
    backgroundColor: COLORS.successLight,
    borderWidth: 1,
    borderColor: COLORS.successBorder,
  },
  alertText: {
    fontSize: 12,
    fontWeight: '600',
  },
  alertTextError: {
    color: COLORS.danger,
  },
  alertTextSuccess: {
    color: COLORS.success,
  },
  form: {
    gap: SPACING.md,
  },
  inputGroup: {
    gap: 4,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textMain,
  },
  input: {
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: 11,
    fontSize: 13,
    color: COLORS.textMain,
    backgroundColor: COLORS.bg,
  },
  submitBtn: {
    backgroundColor: COLORS.primary,
    paddingVertical: 13,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
    ...SHADOWS.purple,
  },
  submitBtnText: {
    color: COLORS.white,
    fontSize: 14,
    fontWeight: '800',
  },
  demoBtn: {
    paddingVertical: 10,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primaryLight,
    borderWidth: 1,
    borderColor: COLORS.primaryBorder,
  },
  demoBtnText: {
    color: COLORS.primary,
    fontSize: 12,
    fontWeight: '700',
  },
  footerNote: {
    textAlign: 'center',
    fontSize: 11,
    color: COLORS.textLight,
    marginTop: SPACING.xl,
  },
});

