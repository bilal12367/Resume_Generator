import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useJobs } from '../context/JobsContext';
import { useTheme } from '../context/ThemeContext';
import { api } from '../services/api';
import { SavedJob } from '../types';
import { JobCard } from '../components/JobCard';
import { JobDetailsModal } from '../components/JobDetailsModal';
import { COLORS, SPACING, RADIUS, SHADOWS } from '../constants/theme';

interface SavedJobsScreenProps {
  onNavigateToWorkflow: (jobId: string) => void;
}

export const SavedJobsScreen: React.FC<SavedJobsScreenProps> = ({
  onNavigateToWorkflow,
}) => {
  const { apiBaseUrl } = useAuth();
  const { setTargetWorkflowJob } = useJobs();
  const { theme } = useTheme();

  const [jobs, setJobs] = useState<SavedJob[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [sourceFilter, setSourceFilter] = useState<'all' | 'linkedin' | 'naukri'>('all');
  const [statusFilter, setStatusFilter] = useState<string>('All');

  // Job Details Modal
  const [selectedModalJob, setSelectedModalJob] = useState<any>(null);
  const [modalLoading, setModalLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);

  const fetchJobs = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const [savedJobs, workflowSessions] = await Promise.all([
        api.getSavedJobs(apiBaseUrl),
        api.getWorkflowSessions(apiBaseUrl).catch(() => []),
      ]);

      // Map workflow sessions by job_id to accurately resolve ATS & PDF generation status
      const sessionMap = new Map<string, any>();
      for (const s of workflowSessions) {
        if (s.job_id) {
          sessionMap.set(String(s.job_id), s);
        }
      }

      const enriched: SavedJob[] = savedJobs.map((j) => {
        const sess = sessionMap.get(String(j.job_id));
        let resolvedStatus: any = j.status || 'Basic Information';

        if (sess) {
          if (sess.status === 'PDF_COMPLETED' || (sess.pdf_links && sess.pdf_links.length > 0)) {
            resolvedStatus = 'PDF Generated';
          } else if (sess.status === 'ATS_COMPLETED' || sess.generated_ats) {
            resolvedStatus = 'ATS Data Generated';
          }
        }

        return {
          ...j,
          status: resolvedStatus,
        };
      });

      setJobs(enriched);
    } catch (err: any) {
      console.warn('Error loading saved jobs:', err);
      setErrorMsg(err.message || 'Failed to load saved jobs from server');
      setJobs([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchJobs();
  }, [apiBaseUrl]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchJobs();
  };

  const handleViewJobDetails = async (job: SavedJob) => {
    setShowModal(true);
    setModalLoading(true);
    setSelectedModalJob(job);
    try {
      const details = await api.getJobDetails(
        apiBaseUrl,
        job.job_id,
        job.job_source,
        job.job_url
      );
      setSelectedModalJob(details);
    } catch (err: any) {
      console.warn('Error fetching job details:', err);
      setSelectedModalJob({
        ...job,
        error: err.message || 'Failed to fetch job details from server',
      });
    } finally {
      setModalLoading(false);
    }
  };

  const handleStartWorkflow = (jobId: string) => {
    const jobItem = jobs.find((j) => String(j.job_id) === String(jobId));
    if (jobItem) {
      setTargetWorkflowJob({
        jobId: String(jobItem.job_id),
        title: jobItem.title,
        company: jobItem.company_name,
        location: jobItem.location,
        jobSource: jobItem.job_source,
        jobUrl: jobItem.job_url,
      });
    }
    onNavigateToWorkflow(jobId);
  };

  const filteredJobs = jobs.filter((j) => {
    const q = searchQuery.trim().toLowerCase();
    const matchesQuery =
      !q ||
      j.title.toLowerCase().includes(q) ||
      j.company_name.toLowerCase().includes(q) ||
      j.location.toLowerCase().includes(q) ||
      String(j.job_id).toLowerCase().includes(q);

    const matchesSource =
      sourceFilter === 'all' || (j.job_source || '').toLowerCase() === sourceFilter;

    const matchesStatus =
      statusFilter === 'All' || (j.status || 'Basic Information') === statusFilter;

    return matchesQuery && matchesSource && matchesStatus;
  });

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      <FlatList
        data={filteredJobs}
        keyExtractor={(item) => `${item.job_source}-${item.job_id}`}
        contentContainerStyle={styles.listContent}
        refreshing={refreshing}
        onRefresh={handleRefresh}
        ListHeaderComponent={
          <View style={styles.header}>
            {/* Search Input */}
            <View style={[styles.searchBar, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <Text style={styles.searchIcon}>🔍</Text>
              <TextInput
                style={[styles.searchInput, { color: theme.textMain }]}
                placeholder="Search saved jobs by title, company, or ID..."
                placeholderTextColor={theme.textLight}
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setSearchQuery('')}>
                  <Text style={styles.clearIcon}>✕</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Source Filters (All / LinkedIn / Naukri) */}
            <View style={[styles.sourceTabs, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <TouchableOpacity
                style={[
                  styles.sourceTab,
                  sourceFilter === 'all' && styles.sourceTabActive,
                ]}
                onPress={() => setSourceFilter('all')}
              >
                <Text
                  style={[
                    styles.sourceTabText,
                    sourceFilter === 'all' && styles.sourceTabTextActive,
                  ]}
                >
                  All Sources ({jobs.length})
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.sourceTab,
                  sourceFilter === 'linkedin' && styles.sourceTabActiveLinkedIn,
                ]}
                onPress={() => setSourceFilter('linkedin')}
              >
                <Text
                  style={[
                    styles.sourceTabText,
                    sourceFilter === 'linkedin' && styles.sourceTabTextActive,
                  ]}
                >
                  LinkedIn ({jobs.filter((j) => (j.job_source || '').toLowerCase() === 'linkedin').length})
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.sourceTab,
                  sourceFilter === 'naukri' && styles.sourceTabActiveNaukri,
                ]}
                onPress={() => setSourceFilter('naukri')}
              >
                <Text
                  style={[
                    styles.sourceTabText,
                    sourceFilter === 'naukri' && styles.sourceTabTextActive,
                  ]}
                >
                  Naukri ({jobs.filter((j) => (j.job_source || '').toLowerCase() === 'naukri').length})
                </Text>
              </TouchableOpacity>
            </View>

            {/* Status Tabs Horizontal Scroll */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.statusScroll}
            >
              {[
                'All',
                'Basic Information',
                'ATS Data Generated',
                'PDF Generated',
                'Applied',
              ].map((st) => {
                const isActive = statusFilter === st;
                return (
                  <TouchableOpacity
                    key={st}
                    style={[
                      styles.statusPill,
                      { backgroundColor: theme.surface, borderColor: theme.border },
                      isActive && { backgroundColor: theme.primaryLight, borderColor: theme.primary },
                    ]}
                    onPress={() => setStatusFilter(st)}
                  >
                    <Text
                      style={[
                        styles.statusPillText,
                        { color: theme.textSecondary },
                        isActive && { color: theme.primary, fontWeight: '700' },
                      ]}
                    >
                      {st === 'ATS Data Generated' ? '⚡ ATS Generated' : st === 'PDF Generated' ? '📄 PDF Generated' : st}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Error Banner */}
            {errorMsg && (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>⚠️ API Error: {errorMsg}</Text>
                <TouchableOpacity style={styles.inlineRetryBtn} onPress={handleRefresh}>
                  <Text style={styles.inlineRetryBtnText}>🔄 Retry Loading Saved Jobs</Text>
                </TouchableOpacity>
              </View>
            )}

            <View style={styles.resultsInfoRow}>
              <Text style={styles.resultsCountText}>
                Showing <Text style={styles.bold}>{filteredJobs.length}</Text> cached jobs
              </Text>
              <TouchableOpacity onPress={handleRefresh} style={styles.refreshBtn}>
                <Text style={styles.refreshBtnText}>🔄 Refresh</Text>
              </TouchableOpacity>
            </View>
          </View>
        }
        renderItem={({ item }) => (
          <JobCard
            job={item}
            onViewDetails={(j) => handleViewJobDetails(j as SavedJob)}
            onStartWorkflow={(j) => handleStartWorkflow(String(j.job_id))}
          />
        )}
        ListEmptyComponent={
          loading ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator color={COLORS.primary} size="large" />
              <Text style={styles.loadingText}>Fetching saved job postings from MySQL...</Text>
            </View>
          ) : errorMsg ? (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyIcon}>⚠️</Text>
              <Text style={[styles.emptyTitle, styles.textErrorTitle]}>Failed to Load Saved Jobs</Text>
              <Text style={styles.emptySubtitle}>{errorMsg}</Text>
              <TouchableOpacity style={styles.emptyRetryBtn} onPress={handleRefresh}>
                <Text style={styles.emptyRetryBtnText}>🔄 Try Again</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyIcon}>📂</Text>
              <Text style={styles.emptyTitle}>No saved jobs found</Text>
              <Text style={styles.emptySubtitle}>
                Jobs you search or add to your list will appear here for ATS resume optimization.
              </Text>
            </View>
          )
        }
      />

      {/* Details Modal */}
      <JobDetailsModal
        visible={showModal}
        jobData={selectedModalJob}
        loading={modalLoading}
        onClose={() => setShowModal(false)}
        onStartWorkflow={(jobId) => handleStartWorkflow(jobId)}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  listContent: {
    padding: SPACING.md,
    paddingBottom: 90,
  },
  header: {
    marginBottom: SPACING.md,
    gap: SPACING.sm,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOWS.sm,
  },
  searchIcon: {
    fontSize: 14,
    marginRight: 6,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: COLORS.textMain,
    paddingVertical: 0,
  },
  clearIcon: {
    fontSize: 12,
    color: COLORS.textMuted,
    padding: 4,
  },
  sourceTabs: {
    flexDirection: 'row',
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.md,
    padding: 3,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 4,
  },
  sourceTab: {
    flex: 1,
    paddingVertical: 7,
    alignItems: 'center',
    borderRadius: RADIUS.sm,
  },
  sourceTabActive: {
    backgroundColor: COLORS.primary,
  },
  sourceTabActiveLinkedIn: {
    backgroundColor: COLORS.linkedin,
  },
  sourceTabActiveNaukri: {
    backgroundColor: COLORS.naukriNavy,
  },
  sourceTabText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textMuted,
  },
  sourceTabTextActive: {
    color: COLORS.white,
  },
  statusScroll: {
    flexDirection: 'row',
    gap: 6,
    paddingVertical: 2,
  },
  statusPill: {
    backgroundColor: COLORS.white,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  statusPillActive: {
    backgroundColor: COLORS.primaryLight,
    borderColor: COLORS.primary,
  },
  statusPillText: {
    fontSize: 11,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  statusPillTextActive: {
    color: COLORS.primary,
    fontWeight: '800',
  },
  resultsInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 2,
  },
  resultsCountText: {
    fontSize: 12,
    color: COLORS.textMuted,
  },
  bold: {
    fontWeight: '800',
    color: COLORS.primary,
  },
  refreshBtn: {
    paddingVertical: 2,
    paddingHorizontal: 6,
  },
  refreshBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.primary,
  },
  loadingBox: {
    padding: SPACING.xxxl,
    alignItems: 'center',
    gap: SPACING.md,
  },
  loadingText: {
    fontSize: 12,
    color: COLORS.textMuted,
    fontWeight: '600',
  },
  emptyBox: {
    padding: SPACING.xxxl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyIcon: {
    fontSize: 40,
    marginBottom: SPACING.sm,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textMain,
  },
  emptySubtitle: {
    fontSize: 12,
    color: COLORS.textMuted,
    textAlign: 'center',
    marginTop: 4,
    maxWidth: 240,
  },
  errorBox: {
    backgroundColor: '#FEE2E2',
    borderWidth: 1,
    borderColor: '#F87171',
    borderRadius: RADIUS.md,
    padding: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  errorText: {
    color: '#B91C1C',
    fontSize: 12,
    fontWeight: '600',
  },
  inlineRetryBtn: {
    marginTop: 6,
    alignSelf: 'flex-start',
    backgroundColor: '#DC2626',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: RADIUS.sm,
  },
  inlineRetryBtnText: {
    color: COLORS.white,
    fontSize: 11,
    fontWeight: '700',
  },
  emptyRetryBtn: {
    marginTop: 14,
    backgroundColor: COLORS.primary,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: RADIUS.md,
  },
  emptyRetryBtnText: {
    color: COLORS.white,
    fontSize: 13,
    fontWeight: '700',
  },
  textErrorTitle: {
    color: '#DC2626',
  },
});

