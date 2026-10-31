import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Linking,
} from 'react-native';
import { SearchJobItem, SavedJob, SelectedJob } from '../types';
import { useJobs } from '../context/JobsContext';
import { useTheme } from '../context/ThemeContext';
import { COLORS, SPACING, RADIUS, SHADOWS } from '../constants/theme';

interface JobCardProps {
  job: SearchJobItem | SavedJob;
  onViewDetails: (job: SearchJobItem | SavedJob) => void;
  onStartWorkflow?: (job: SearchJobItem | SavedJob) => void;
}

export const JobCard: React.FC<JobCardProps> = ({
  job,
  onViewDetails,
  onStartWorkflow,
}) => {
  const { isSelected, toggleSelectedJob } = useJobs();
  const { theme } = useTheme();

  const isNaukri = (job.job_source || '').toLowerCase() === 'naukri';
  const jobId = String(job.job_id);
  const inList = isSelected(jobId);

  const postedDate =
    ('posted_date' in job && job.posted_date) ||
    ('posted_time' in job && job.posted_time) ||
    'Recently posted';

  const expLevel =
    ('experience_level' in job && job.experience_level) ||
    ('experience' in job && job.experience) ||
    ('seniority_level' in job && job.seniority_level);

  const handleToggleList = () => {
    const selected: SelectedJob = {
      jobId: jobId,
      title: job.title,
      company: job.company_name,
      location: job.location,
      jobSource: job.job_source,
      jobUrl: job.job_url,
    };
    toggleSelectedJob(selected);
  };

  const handleOpenExternal = () => {
    if (job.job_url) {
      Linking.openURL(job.job_url).catch((err) =>
        console.warn('Cannot open external link:', err)
      );
    } else {
      const fallbackUrl = isNaukri
        ? `https://www.naukri.com/job-listings-${jobId}`
        : `https://www.linkedin.com/jobs/view/${jobId}`;
      Linking.openURL(fallbackUrl).catch(() => {});
    }
  };

  const jobStatus = 'status' in job ? (job.status as string) : undefined;

  return (
    <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
      {/* Top Header Row */}
      <View style={styles.headerRow}>
        <View style={styles.badgeGroup}>
          <View
            style={[
              styles.platformBadge,
              isNaukri ? styles.naukriBadge : styles.linkedinBadge,
            ]}
          >
            <Text style={styles.platformBadgeText}>
              {isNaukri ? 'Naukri' : 'LinkedIn'}
            </Text>
          </View>

          <View style={[styles.idBadge, { backgroundColor: theme.bg, borderColor: theme.border }]}>
            <Text style={[styles.idBadgeText, { color: theme.textMuted }]}>ID: {jobId}</Text>
          </View>

          {/* Workflow Status Badge */}
          {jobStatus && jobStatus !== 'Basic Information' && (
            <View
              style={[
                styles.statusBadge,
                jobStatus === 'PDF Generated' ? styles.statusBadgePdf : styles.statusBadgeAts,
              ]}
            >
              <Text style={styles.statusBadgeText}>
                {jobStatus === 'PDF Generated' ? '✓ PDF Ready' : '⚡ ATS Ready'}
              </Text>
            </View>
          )}
        </View>

        <View style={[styles.timeBadge, { backgroundColor: theme.bg }]}>
          <Text style={[styles.timeBadgeText, { color: theme.textMuted }]}>🕒 {postedDate}</Text>
        </View>
      </View>

      {/* Title & Company */}
      <TouchableOpacity
        onPress={() => onViewDetails(job)}
        activeOpacity={0.8}
        style={styles.clickableTitleArea}
      >
        <Text style={[styles.jobTitle, { color: theme.textMain }]} numberOfLines={2}>
          {job.title}
        </Text>

        <View style={styles.companyRow}>
          <Text style={styles.companyIcon}>🏢</Text>
          <Text style={[styles.companyName, { color: theme.textSecondary }]} numberOfLines={1}>
            {job.company_name || 'Employer'}
          </Text>
        </View>
      </TouchableOpacity>

      {/* Location & Experience Meta Tags */}
      <View style={styles.metaRow}>
        <View style={[styles.metaBadge, { backgroundColor: theme.bg, borderColor: theme.border }]}>
          <Text style={[styles.metaBadgeText, { color: theme.textSecondary }]} numberOfLines={1}>
            📍 {job.location || 'Location Not Specified'}
          </Text>
        </View>

        {expLevel ? (
          <View style={[styles.metaBadge, styles.expBadge]}>
            <Text style={[styles.metaBadgeText, styles.expBadgeText]} numberOfLines={1}>
              🎖️ {expLevel}
            </Text>
          </View>
        ) : null}
      </View>

      {/* Action Buttons Row */}
      <View style={styles.actionsContainer}>
        <View style={styles.primaryActionsRow}>
          <TouchableOpacity
            style={[
              styles.btn,
              isNaukri ? styles.btnNaukri : styles.btnPurple,
              styles.flexBtn,
            ]}
            onPress={() => onViewDetails(job)}
            activeOpacity={0.8}
          >
            <Text style={styles.btnTextWhite}>👁️ Read Description</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.btn, styles.btnOutline, styles.iconBtn]}
            onPress={handleOpenExternal}
            activeOpacity={0.7}
          >
            <Text style={styles.btnIcon}>↗️</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.secondaryActionsRow}>
          <TouchableOpacity
            style={[
              styles.btn,
              inList ? styles.btnSuccess : styles.btnOutlinePurple,
              styles.flexBtn,
            ]}
            onPress={handleToggleList}
            activeOpacity={0.8}
          >
            <Text
              style={[
                styles.btnText,
                inList ? styles.btnTextWhite : styles.btnTextPurple,
              ]}
            >
              {inList ? '✓ In Selected List' : '➕ Add to List'}
            </Text>
          </TouchableOpacity>

          {onStartWorkflow && (
            <TouchableOpacity
              style={[styles.btn, styles.btnPurpleSubtle, styles.flexBtn]}
              onPress={() => onStartWorkflow(job)}
              activeOpacity={0.8}
            >
              <Text style={styles.btnTextPurple}>⚙️ Start ATS</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOWS.sm,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.sm,
  },
  badgeGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  platformBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: RADIUS.sm,
  },
  linkedinBadge: {
    backgroundColor: COLORS.linkedin,
  },
  naukriBadge: {
    backgroundColor: COLORS.naukri,
  },
  platformBadgeText: {
    color: COLORS.white,
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  idBadge: {
    backgroundColor: COLORS.primaryLight,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.primaryBorder,
  },
  idBadgeText: {
    color: COLORS.primary,
    fontSize: 10,
    fontWeight: '700',
    fontFamily: 'monospace',
  },
  statusBadge: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
  },
  statusBadgePdf: {
    backgroundColor: '#DCFCE7',
    borderColor: '#86EFAC',
  },
  statusBadgeAts: {
    backgroundColor: '#F3E8FF',
    borderColor: '#D8B4FE',
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#15803D',
  },
  timeBadge: {
    backgroundColor: COLORS.bg,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  timeBadgeText: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: '600',
  },
  clickableTitleArea: {
    marginVertical: 4,
  },
  jobTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textMain,
    lineHeight: 22,
    marginBottom: 4,
  },
  companyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: SPACING.xs,
  },
  companyIcon: {
    fontSize: 13,
  },
  companyName: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.primary,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginVertical: SPACING.xs,
  },
  metaBadge: {
    backgroundColor: COLORS.bg,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  metaBadgeText: {
    fontSize: 11,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
  expBadge: {
    backgroundColor: COLORS.warningLight,
    borderColor: COLORS.warningBorder,
  },
  expBadgeText: {
    color: '#b45309',
    fontWeight: '600',
  },
  actionsContainer: {
    marginTop: SPACING.sm,
    paddingTop: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
    gap: 8,
  },
  primaryActionsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  secondaryActionsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  btn: {
    paddingVertical: 9,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flexBtn: {
    flex: 1,
  },
  iconBtn: {
    width: 40,
    paddingHorizontal: 0,
  },
  btnPurple: {
    backgroundColor: COLORS.primary,
  },
  btnNaukri: {
    backgroundColor: COLORS.naukriNavy,
  },
  btnSuccess: {
    backgroundColor: COLORS.success,
  },
  btnOutline: {
    backgroundColor: COLORS.bg,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  btnOutlinePurple: {
    backgroundColor: COLORS.white,
    borderWidth: 1.5,
    borderColor: COLORS.primary,
  },
  btnPurpleSubtle: {
    backgroundColor: COLORS.primaryLight,
    borderWidth: 1,
    borderColor: COLORS.primaryBorder,
  },
  btnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  btnTextWhite: {
    color: COLORS.white,
    fontSize: 12,
    fontWeight: '700',
  },
  btnTextPurple: {
    color: COLORS.primary,
    fontSize: 12,
    fontWeight: '700',
  },
  btnIcon: {
    fontSize: 13,
  },
});
