import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { COLORS, SPACING, RADIUS, SHADOWS } from '../constants/theme';

interface TopHeaderProps {
  title: string;
  subtitle?: string;
  onOpenServerConfig: () => void;
}

export const TopHeader: React.FC<TopHeaderProps> = ({
  title,
  subtitle,
  onOpenServerConfig,
}) => {
  const { user, logout, apiBaseUrl } = useAuth();
  const { isDark, toggleTheme, theme } = useTheme();

  // Shorten host for display badge
  const displayHost = apiBaseUrl.replace(/^https?:\/\//, '').split('/')[0];

  const handleUserPress = () => {
    Alert.alert(
      'Account Session',
      `Signed in as ${user?.name || 'User'} (${user?.email || ''})\n\nDo you want to sign out?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: () => logout(),
        },
      ]
    );
  };

  return (
    <View style={[styles.headerContainer, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
      <View style={styles.topRow}>
        <View style={styles.brandRow}>
          <View style={[styles.logoBadge, { backgroundColor: theme.primaryLight, borderColor: theme.primaryBorder }]}>
            <Text style={styles.logoIcon}>⚡</Text>
          </View>
          <View>
            <Text style={[styles.brandTitle, { color: theme.primary }]}>JobAgent AI</Text>
            <Text style={[styles.brandSubtitle, { color: theme.textMuted }]}>ATS & Job Suite</Text>
          </View>
        </View>

        <View style={styles.actionsRow}>
          {/* Dark Mode Toggle */}
          <TouchableOpacity
            style={[styles.themeToggleBtn, { backgroundColor: theme.primaryLight, borderColor: theme.primaryBorder }]}
            onPress={toggleTheme}
            activeOpacity={0.7}
          >
            <Text style={styles.themeToggleIcon}>{isDark ? '☀️' : '🌙'}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.serverBadge, { backgroundColor: theme.bg, borderColor: theme.border }]}
            onPress={onOpenServerConfig}
            activeOpacity={0.7}
          >
            <View style={styles.statusDot} />
            <Text style={[styles.serverBadgeText, { color: theme.textSecondary }]} numberOfLines={1}>
              {displayHost}
            </Text>
          </TouchableOpacity>

          {user && (
            <TouchableOpacity
              style={styles.userButton}
              onPress={handleUserPress}
              activeOpacity={0.7}
            >
              <Text style={styles.userInitial}>
                {user.name ? user.name.charAt(0).toUpperCase() : 'U'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      <View style={styles.titleRow}>
        <Text style={[styles.screenTitle, { color: theme.textMain }]}>{title}</Text>
        {subtitle ? <Text style={[styles.screenSubtitle, { color: theme.textMuted }]}>{subtitle}</Text> : null}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  headerContainer: {
    backgroundColor: COLORS.white,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    ...SHADOWS.sm,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.sm,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  logoBadge: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.primaryBorder,
  },
  logoIcon: {
    fontSize: 20,
  },
  brandTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.primary,
    letterSpacing: -0.3,
  },
  brandSubtitle: {
    fontSize: 10,
    fontWeight: '600',
    color: COLORS.textMuted,
    textTransform: 'uppercase',
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  themeToggleBtn: {
    width: 32,
    height: 32,
    borderRadius: RADIUS.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  themeToggleIcon: {
    fontSize: 14,
  },
  serverBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.bg,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.pill,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 5,
    maxWidth: 125,
    gap: 5,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: COLORS.success,
  },
  serverBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  userButton: {
    width: 32,
    height: 32,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOWS.sm,
  },
  userInitial: {
    color: COLORS.white,
    fontWeight: '700',
    fontSize: 13,
  },
  titleRow: {
    marginTop: 2,
  },
  screenTitle: {
    fontSize: 19,
    fontWeight: '800',
    color: COLORS.textMain,
    letterSpacing: -0.3,
  },
  screenSubtitle: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 2,
  },
});
