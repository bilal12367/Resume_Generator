import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useJobs } from '../context/JobsContext';
import { COLORS, SPACING, RADIUS, SHADOWS } from '../constants/theme';

export type TabScreen = 'search' | 'saved' | 'workflow';

interface BottomTabBarProps {
  currentTab: TabScreen;
  onSelectTab: (tab: TabScreen) => void;
}

export const BottomTabBar: React.FC<BottomTabBarProps> = ({
  currentTab,
  onSelectTab,
}) => {
  const insets = useSafeAreaInsets();
  const { selectedJobs } = useJobs();

  const tabs: Array<{
    id: TabScreen;
    label: string;
    icon: string;
    badgeCount?: number;
  }> = [
    {
      id: 'search',
      label: 'Search Jobs',
      icon: '🔍',
    },
    {
      id: 'saved',
      label: 'Apply & Saved',
      icon: '💼',
    },
    {
      id: 'workflow',
      label: 'ATS & PDF',
      icon: '⚡',
      badgeCount: selectedJobs.length > 0 ? selectedJobs.length : undefined,
    },
  ];

  return (
    <View
      style={[
        styles.container,
        {
          paddingBottom: Math.max(insets.bottom, SPACING.sm),
        },
      ]}
    >
      <View style={styles.tabRow}>
        {tabs.map((tab) => {
          const isActive = currentTab === tab.id;
          return (
            <TouchableOpacity
              key={tab.id}
              style={[styles.tabButton, isActive && styles.activeTabButton]}
              onPress={() => onSelectTab(tab.id)}
              activeOpacity={0.8}
            >
              <View style={styles.iconContainer}>
                <Text style={[styles.tabIcon, isActive && styles.activeTabIcon]}>
                  {tab.icon}
                </Text>
                {tab.badgeCount !== undefined && tab.badgeCount > 0 && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{tab.badgeCount}</Text>
                  </View>
                )}
              </View>
              <Text
                style={[styles.tabLabel, isActive && styles.activeTabLabel]}
                numberOfLines={1}
              >
                {tab.label}
              </Text>
              {isActive && <View style={styles.activeIndicator} />}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.white,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: SPACING.xs,
    ...SHADOWS.md,
  },
  tabRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: SPACING.sm,
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.xs,
    position: 'relative',
    borderRadius: RADIUS.md,
  },
  activeTabButton: {
    backgroundColor: COLORS.primarySubtle,
  },
  iconContainer: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    width: 28,
    height: 28,
  },
  tabIcon: {
    fontSize: 18,
    opacity: 0.65,
  },
  activeTabIcon: {
    opacity: 1,
    transform: [{ scale: 1.1 }],
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textMuted,
    marginTop: 2,
  },
  activeTabLabel: {
    color: COLORS.primary,
    fontWeight: '800',
  },
  activeIndicator: {
    position: 'absolute',
    bottom: -SPACING.xs,
    width: 20,
    height: 3,
    backgroundColor: COLORS.primary,
    borderRadius: 2,
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -8,
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.pill,
    minWidth: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 1.5,
    borderColor: COLORS.white,
  },
  badgeText: {
    color: COLORS.white,
    fontSize: 9,
    fontWeight: '800',
  },
});
