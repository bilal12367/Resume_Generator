import React, { useState } from 'react';
import { StatusBar, StyleSheet, View, Text, ActivityIndicator } from 'react-native';
import {
  SafeAreaProvider,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { JobsProvider } from './src/context/JobsContext';
import { TopHeader } from './src/components/TopHeader';
import { BottomTabBar, TabScreen } from './src/components/BottomTabBar';
import { SelectedJobsDrawer } from './src/components/SelectedJobsDrawer';
import { ServerConfigModal } from './src/components/ServerConfigModal';
import { ServerConnectionScreen } from './src/screens/ServerConnectionScreen';
import { AuthScreen } from './src/screens/AuthScreen';
import { SearchJobsScreen } from './src/screens/SearchJobsScreen';
import { SavedJobsScreen } from './src/screens/SavedJobsScreen';
import { WorkflowScreen } from './src/screens/WorkflowScreen';
import { COLORS, SPACING, RADIUS, SHADOWS } from './src/constants/theme';
import { ENV_CONFIG } from './src/config/env';

function AppContent() {
  const insets = useSafeAreaInsets();
  const { user, hasConnectedServer, setHasConnectedServer, isInitializing } = useAuth();

  const [activeTab, setActiveTab] = useState<TabScreen>('search');
  const [showServerConfig, setShowServerConfig] = useState<boolean>(false);

  // 1. INITIALIZING / FIRST CALL TO TAILSCALE FUNNEL
  // Test connection to the Tailscale Funnel URL immediately on startup
  if (isInitializing) {
    return (
      <View style={[styles.splashContainer, { paddingTop: insets.top }]}>
        <View style={styles.splashCard}>
          <View style={styles.splashIconBadge}>
            <Text style={styles.splashIcon}>🤖</Text>
          </View>
          <Text style={styles.splashTitle}>JobAgent AI</Text>
          <Text style={styles.splashSubtitle}>
            LinkedIn Job Search & ATS Modification Platform
          </Text>

          <View style={styles.splashLoadingBox}>
            <ActivityIndicator size="large" color={COLORS.primary} />
            <Text style={styles.splashStatusText}>Connecting to Tailscale Funnel...</Text>
            <View style={styles.splashPill}>
              <Text style={styles.splashHostText}>
                {ENV_CONFIG.TAILSCALE_HOSTNAME}.taile80bab.ts.net
              </Text>
            </View>
          </View>
        </View>
      </View>
    );
  }

  // 2. SERVER CONNECTION SCREEN
  // Only displayed if the initial Tailscale Funnel call failed.
  // If the connection succeeded, this page is automatically bypassed!
  if (!hasConnectedServer) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <ServerConnectionScreen
          onConnected={() => setHasConnectedServer(true)}
        />
      </View>
    );
  }

  // 3. AUTHENTICATION SCREEN (Sign In / Register)
  // If user was previously logged in, credentials are automatically restored from storage,
  // bypassing this screen straight to the main app!
  if (!user) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <AuthScreen onOpenServerConfig={() => setShowServerConfig(true)} />
        <ServerConfigModal
          visible={showServerConfig}
          onClose={() => setShowServerConfig(false)}
        />
      </View>
    );
  }

  // 4. MAIN APP FLOW (Search Jobs -> Saved Jobs -> ATS Workflow)
  const getHeaderInfo = (): { title: string; subtitle: string } => {
    switch (activeTab) {
      case 'search':
        return {
          title: 'Manual Job Search',
          subtitle: 'Search real-time listings on LinkedIn & Naukri.com',
        };
      case 'saved':
        return {
          title: 'Apply & Saved Jobs',
          subtitle: 'Cached job postings and application pipeline',
        };
      case 'workflow':
        return {
          title: 'ATS Resume Workflow',
          subtitle: 'Generate tailored ATS data and multi-template PDFs',
        };
      default:
        return {
          title: 'JobAgent AI',
          subtitle: 'Job Search & ATS Engine',
        };
    }
  };

  const headerInfo = getHeaderInfo();

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Top Header */}
      <TopHeader
        title={headerInfo.title}
        subtitle={headerInfo.subtitle}
        onOpenServerConfig={() => setShowServerConfig(true)}
      />

      {/* Screen Body */}
      <View style={styles.screenContainer}>
        {activeTab === 'search' && (
          <SearchJobsScreen
            onNavigateToWorkflow={() => setActiveTab('workflow')}
          />
        )}

        {activeTab === 'saved' && (
          <SavedJobsScreen
            onNavigateToWorkflow={() => setActiveTab('workflow')}
          />
        )}

        {activeTab === 'workflow' && <WorkflowScreen />}
      </View>

      {/* Persistent Selected Jobs Floating Drawer / Modal */}
      <SelectedJobsDrawer
        onProcessBatch={() => setActiveTab('workflow')}
      />

      {/* Bottom Navigation Tab Bar */}
      <BottomTabBar
        currentTab={activeTab}
        onSelectTab={(tab) => setActiveTab(tab)}
      />

      {/* Server Configuration Modal (Accessible anytime from top header) */}
      <ServerConfigModal
        visible={showServerConfig}
        onClose={() => setShowServerConfig(false)}
      />
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar barStyle="dark-content" />
      <AuthProvider>
        <JobsProvider>
          <AppContent />
        </JobsProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.white,
  },
  screenContainer: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  splashContainer: {
    flex: 1,
    backgroundColor: COLORS.bg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.xl,
  },
  splashCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.xl,
    padding: SPACING.xxl,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOWS.md,
  },
  splashIconBadge: {
    width: 68,
    height: 68,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.primaryLight,
    borderWidth: 2,
    borderColor: COLORS.primaryBorder,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.md,
  },
  splashIcon: {
    fontSize: 34,
  },
  splashTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.textMain,
    marginBottom: 4,
  },
  splashSubtitle: {
    fontSize: 12,
    color: COLORS.textMuted,
    textAlign: 'center',
    marginBottom: SPACING.xl,
    lineHeight: 17,
  },
  splashLoadingBox: {
    alignItems: 'center',
    gap: SPACING.sm,
  },
  splashStatusText: {
    fontSize: 13,
    color: COLORS.textMain,
    fontWeight: '700',
    marginTop: SPACING.xs,
  },
  splashPill: {
    backgroundColor: COLORS.primarySubtle,
    borderWidth: 1,
    borderColor: COLORS.primaryBorder,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: RADIUS.pill,
  },
  splashHostText: {
    fontSize: 11,
    color: COLORS.primary,
    fontFamily: 'monospace',
    fontWeight: '600',
  },
});
