import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  ScrollView,
  TouchableOpacity,
  Linking,
  ActivityIndicator,
} from 'react-native';
import { useJobs } from '../context/JobsContext';
import { COLORS, SPACING, RADIUS, SHADOWS } from '../constants/theme';

interface JobDetailsModalProps {
  visible: boolean;
  jobData: any;
  loading: boolean;
  onClose: () => void;
  onStartWorkflow?: (jobId: string) => void;
}

export const JobDetailsModal: React.FC<JobDetailsModalProps> = ({
  visible,
  jobData,
  loading,
  onClose,
  onStartWorkflow,
}) => {
  const { isSelected, toggleSelectedJob } = useJobs();

  if (!visible) return null;

  const targetJobId = jobData ? String(jobData.job_id || jobData.id || '') : '';
  const inList = isSelected(targetJobId);
  const isNaukri = (jobData?.job_source || '').toLowerCase() === 'naukri';

  const company = jobData?.company_name || jobData?.company || 'Company';
  const location = jobData?.location || 'Location Not Specified';
  const postedDate = jobData?.posted_time || jobData?.posted_date || 'Recently';
  const expLevel = jobData?.seniority_level || jobData?.experience_level || jobData?.experience || 'Not specified';
  const errorMsg = jobData?.error;
  const description =
    jobData?.description ||
    jobData?.raw_description ||
    jobData?.minimal_description ||
    (errorMsg ? `Unable to load description: ${errorMsg}` : 'No description body available.');

  const handleToggleList = () => {
    if (!targetJobId) return;
    toggleSelectedJob({
      jobId: targetJobId,
      title: jobData?.title || `Job ${targetJobId}`,
      company: company,
      location: location,
      jobSource: jobData?.job_source,
      jobUrl: jobData?.job_url,
    });
  };

  const handleOpenExternal = () => {
    if (jobData?.job_url) {
      Linking.openURL(jobData.job_url).catch(() => {});
    } else if (targetJobId) {
      const url = isNaukri
        ? `https://www.naukri.com/job-listings-${targetJobId}`
        : `https://www.linkedin.com/jobs/view/${targetJobId}`;
      Linking.openURL(url).catch(() => {});
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          {/* Header */}
          <View style={[styles.header, isNaukri ? styles.headerNaukri : styles.headerPurple]}>
            <View style={styles.headerTitleArea}>
              <View style={styles.headerBadgeRow}>
                <View style={styles.headerPlatformBadge}>
                  <Text style={styles.headerPlatformText}>
                    {isNaukri ? 'Naukri.com' : 'LinkedIn'}
                  </Text>
                </View>
                <Text style={styles.headerJobId}>ID: {targetJobId}</Text>
              </View>
              <Text style={styles.headerTitle} numberOfLines={2}>
                {loading ? 'Fetching Job Details...' : jobData?.title || 'Job Details'}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} activeOpacity={0.7}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Body */}
          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={COLORS.primary} />
              <Text style={styles.loadingText}>Connecting to server & fetching job metadata...</Text>
            </View>
          ) : (
            <ScrollView
              style={styles.scrollBody}
              contentContainerStyle={styles.scrollContent}
              nestedScrollEnabled={true}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={true}
            >
              {/* Error banner if fetching failed */}
              {errorMsg && (
                <View style={styles.errorBox}>
                  <Text style={styles.errorText}>⚠️ {errorMsg}</Text>
                </View>
              )}

              {/* Highlighted Meta Grid */}
              <View style={styles.metaGrid}>
                <View style={styles.metaCard}>
                  <Text style={styles.metaLabel}>🏢 COMPANY</Text>
                  <Text style={styles.metaValue} numberOfLines={1}>{company}</Text>
                </View>

                <View style={styles.metaCard}>
                  <Text style={styles.metaLabel}>📍 LOCATION</Text>
                  <Text style={styles.metaValue} numberOfLines={1}>{location}</Text>
                </View>

                <View style={styles.metaCard}>
                  <Text style={styles.metaLabel}>🕒 POSTED</Text>
                  <Text style={styles.metaValue} numberOfLines={1}>{postedDate}</Text>
                </View>

                <View style={styles.metaCard}>
                  <Text style={styles.metaLabel}>🎖️ EXPERIENCE</Text>
                  <Text style={styles.metaValue} numberOfLines={1}>{expLevel}</Text>
                </View>
              </View>

              {/* Secondary Details (Applicants, Employment Type) */}
              {(jobData?.num_applicants || jobData?.employment_type) && (
                <View style={styles.secondaryBadgesRow}>
                  {jobData.num_applicants && (
                    <View style={styles.secondaryBadge}>
                      <Text style={styles.secondaryBadgeText}>👥 {jobData.num_applicants}</Text>
                    </View>
                  )}
                  {jobData.employment_type && (
                    <View style={styles.secondaryBadge}>
                      <Text style={styles.secondaryBadgeText}>💼 {jobData.employment_type}</Text>
                    </View>
                  )}
                </View>
              )}

              {/* Required Skills */}
              {jobData?.skills_required && Array.isArray(jobData.skills_required) && jobData.skills_required.length > 0 && (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>✨ Required Skills & Qualifications</Text>
                  <View style={styles.skillsRow}>
                    {jobData.skills_required.map((skill: string, idx: number) => (
                      <View key={idx} style={styles.skillBadge}>
                        <Text style={styles.skillBadgeText}>{skill}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}

              {/* Full Description Box - Fully Expandable & Scrollable */}
              <View style={styles.section}>
                <View style={styles.descriptionHeaderRow}>
                  <Text style={styles.sectionTitle}>📄 Full Role Description</Text>
                </View>
                <View style={styles.descriptionContainer}>
                  <Text style={styles.descriptionText} selectable={true}>
                    {description}
                  </Text>
                </View>
              </View>

              {/* View on Platform External Button */}
              <TouchableOpacity
                style={styles.externalLinkBtn}
                onPress={handleOpenExternal}
                activeOpacity={0.8}
              >
                <Text style={styles.externalLinkBtnText}>
                  View Full Listing on {isNaukri ? 'Naukri' : 'LinkedIn'} ↗️
                </Text>
              </TouchableOpacity>
            </ScrollView>
          )}

          {/* Footer Actions */}
          <View style={styles.footer}>
            <TouchableOpacity
              style={[styles.footerBtn, inList ? styles.btnSuccess : styles.btnOutlinePurple]}
              onPress={handleToggleList}
              activeOpacity={0.8}
            >
              <Text style={[styles.footerBtnText, inList ? styles.textWhite : styles.textPurple]}>
                {inList ? '✓ In Selected List' : '➕ Add to List'}
              </Text>
            </TouchableOpacity>

            {onStartWorkflow && targetJobId && (
              <TouchableOpacity
                style={[styles.footerBtn, styles.btnPurple]}
                onPress={() => {
                  onClose();
                  onStartWorkflow(targetJobId);
                }}
                activeOpacity={0.8}
              >
                <Text style={styles.footerBtnTextWhite}>⚙️ Process ATS</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: COLORS.white,
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    height: '88%',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    ...SHADOWS.lg,
  },
  header: {
    padding: SPACING.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  headerPurple: {
    backgroundColor: COLORS.primary,
  },
  headerNaukri: {
    backgroundColor: COLORS.naukriNavy,
  },
  headerTitleArea: {
    flex: 1,
    marginRight: SPACING.sm,
  },
  headerBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  headerPlatformBadge: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: RADIUS.sm,
  },
  headerPlatformText: {
    color: COLORS.white,
    fontSize: 10,
    fontWeight: '800',
  },
  headerJobId: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 11,
    fontFamily: 'monospace',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: COLORS.white,
    lineHeight: 22,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: RADIUS.pill,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: {
    color: COLORS.white,
    fontSize: 14,
    fontWeight: 'bold',
  },
  loadingContainer: {
    flex: 1,
    padding: SPACING.xxxl,
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.md,
  },
  loadingText: {
    fontSize: 13,
    color: COLORS.textMuted,
    fontWeight: '600',
    textAlign: 'center',
  },
  scrollBody: {
    flex: 1,
  },
  scrollContent: {
    padding: SPACING.md,
    gap: SPACING.md,
    paddingBottom: SPACING.xl,
  },
  errorBox: {
    backgroundColor: '#FEE2E2',
    borderWidth: 1,
    borderColor: '#F87171',
    borderRadius: RADIUS.md,
    padding: SPACING.sm,
  },
  errorText: {
    color: '#B91C1C',
    fontSize: 12,
    fontWeight: '600',
  },
  metaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
  },
  metaCard: {
    flex: 1,
    minWidth: '46%',
    backgroundColor: COLORS.bg,
    padding: SPACING.sm,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  metaLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.textMuted,
    marginBottom: 2,
  },
  metaValue: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textMain,
  },
  secondaryBadgesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  secondaryBadge: {
    backgroundColor: COLORS.primaryLight,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: RADIUS.pill,
  },
  secondaryBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.primary,
  },
  section: {
    gap: 6,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textMain,
  },
  skillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  skillBadge: {
    backgroundColor: COLORS.primaryLight,
    borderWidth: 1,
    borderColor: COLORS.primaryBorder,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: RADIUS.pill,
  },
  skillBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.primary,
  },
  descriptionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  descriptionContainer: {
    backgroundColor: COLORS.darkCard,
    padding: SPACING.md,
    borderRadius: RADIUS.md,
    // Removed maxHeight limitation so description expands naturally and outer ScrollView scrolls smoothly!
  },
  descriptionText: {
    color: COLORS.white,
    fontSize: 13,
    lineHeight: 20,
  },
  externalLinkBtn: {
    backgroundColor: COLORS.bg,
    borderWidth: 1,
    borderColor: COLORS.primaryBorder,
    paddingVertical: 12,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    marginTop: SPACING.xs,
  },
  externalLinkBtnText: {
    color: COLORS.primary,
    fontSize: 13,
    fontWeight: '700',
  },
  footer: {
    flexDirection: 'row',
    padding: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    backgroundColor: COLORS.white,
    gap: SPACING.sm,
  },
  footerBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnSuccess: {
    backgroundColor: COLORS.success,
  },
  btnPurple: {
    backgroundColor: COLORS.primary,
  },
  btnOutlinePurple: {
    backgroundColor: COLORS.white,
    borderWidth: 1.5,
    borderColor: COLORS.primary,
  },
  footerBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
  footerBtnTextWhite: {
    color: COLORS.white,
    fontSize: 13,
    fontWeight: '700',
  },
  textWhite: {
    color: COLORS.white,
  },
  textPurple: {
    color: COLORS.primary,
  },
});
