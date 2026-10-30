import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Modal,
} from 'react-native';
import { useJobs } from '../context/JobsContext';
import { COLORS, SPACING, RADIUS, SHADOWS } from '../constants/theme';

interface SelectedJobsDrawerProps {
  onProcessBatch: () => void;
}

export const SelectedJobsDrawer: React.FC<SelectedJobsDrawerProps> = ({
  onProcessBatch,
}) => {
  const {
    selectedJobs,
    removeSelectedJob,
    clearSelectedJobs,
    isDrawerOpen,
    setIsDrawerOpen,
  } = useJobs();

  if (selectedJobs.length === 0) {
    return null;
  }

  return (
    <>
      {/* Floating Action Pill at Bottom Right */}
      {!isDrawerOpen && (
        <TouchableOpacity
          style={styles.floatingPill}
          onPress={() => setIsDrawerOpen(true)}
          activeOpacity={0.85}
        >
          <Text style={styles.pillIcon}>⚡</Text>
          <Text style={styles.pillTitle}>Selected Jobs</Text>
          <View style={styles.pillBadge}>
            <Text style={styles.pillBadgeText}>{selectedJobs.length}</Text>
          </View>
        </TouchableOpacity>
      )}

      {/* Expanded Modal Drawer */}
      <Modal
        visible={isDrawerOpen}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setIsDrawerOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.drawerCard}>
            {/* Header */}
            <View style={styles.drawerHeader}>
              <View style={styles.headerTitleGroup}>
                <Text style={styles.headerIcon}>📚</Text>
                <Text style={styles.drawerTitle}>Selected Jobs Stack</Text>
                <View style={styles.countBadge}>
                  <Text style={styles.countBadgeText}>{selectedJobs.length}</Text>
                </View>
              </View>

              <View style={styles.headerActions}>
                <TouchableOpacity
                  onPress={clearSelectedJobs}
                  style={styles.dismissBtn}
                >
                  <Text style={styles.dismissBtnText}>Dismiss all</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => setIsDrawerOpen(false)}
                  style={styles.closeBtn}
                >
                  <Text style={styles.closeBtnText}>✕</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* List */}
            <ScrollView style={styles.itemsList} contentContainerStyle={styles.itemsContent}>
              {selectedJobs.map((job) => (
                <View key={job.jobId} style={styles.jobRow}>
                  <View style={styles.jobInfo}>
                    <View style={styles.jobIdRow}>
                      <View style={styles.idChip}>
                        <Text style={styles.idChipText}>ID: {job.jobId}</Text>
                      </View>
                      {job.company ? (
                        <Text style={styles.companyText} numberOfLines={1}>
                          • {job.company}
                        </Text>
                      ) : null}
                    </View>
                    <Text style={styles.jobTitleText} numberOfLines={1}>
                      {job.title || `Job Listing ${job.jobId}`}
                    </Text>
                  </View>

                  <TouchableOpacity
                    onPress={() => removeSelectedJob(job.jobId)}
                    style={styles.removeBtn}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Text style={styles.removeBtnText}>✕</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>

            {/* Bottom Process Batch Button */}
            <View style={styles.footer}>
              <TouchableOpacity
                style={styles.processBatchBtn}
                onPress={() => {
                  setIsDrawerOpen(false);
                  onProcessBatch();
                }}
                activeOpacity={0.85}
              >
                <Text style={styles.processBatchIcon}>⚡</Text>
                <Text style={styles.processBatchText}>
                  Process Batch ({selectedJobs.length} Jobs) in ATS
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  floatingPill: {
    position: 'absolute',
    bottom: 72,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.darkCard,
    borderRadius: RADIUS.pill,
    paddingVertical: 10,
    paddingHorizontal: 16,
    gap: 8,
    borderWidth: 1.5,
    borderColor: COLORS.primaryBorder,
    ...SHADOWS.lg,
    zIndex: 99,
  },
  pillIcon: {
    fontSize: 16,
  },
  pillTitle: {
    color: COLORS.white,
    fontWeight: '700',
    fontSize: 13,
  },
  pillBadge: {
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.pill,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  pillBadgeText: {
    color: COLORS.white,
    fontSize: 11,
    fontWeight: '800',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  drawerCard: {
    backgroundColor: COLORS.darkCard,
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    maxHeight: '75%',
    overflow: 'hidden',
    borderTopWidth: 1.5,
    borderTopColor: COLORS.primaryBorder,
    ...SHADOWS.lg,
  },
  drawerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: SPACING.md,
    backgroundColor: COLORS.primary,
  },
  headerTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerIcon: {
    fontSize: 16,
  },
  drawerTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.white,
  },
  countBadge: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.pill,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  countBadgeText: {
    color: COLORS.primary,
    fontSize: 11,
    fontWeight: '800',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  dismissBtn: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  dismissBtnText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 12,
    fontWeight: '600',
  },
  closeBtn: {
    width: 28,
    height: 28,
    borderRadius: RADIUS.pill,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: {
    color: COLORS.white,
    fontSize: 13,
    fontWeight: 'bold',
  },
  itemsList: {
    maxHeight: 280,
  },
  itemsContent: {
    padding: SPACING.md,
    gap: 8,
  },
  jobRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.06)',
    padding: SPACING.sm,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  jobInfo: {
    flex: 1,
    marginRight: 10,
  },
  jobIdRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  idChip: {
    backgroundColor: COLORS.primaryLight,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  idChipText: {
    color: COLORS.primary,
    fontSize: 10,
    fontWeight: '700',
    fontFamily: 'monospace',
  },
  companyText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 11,
    fontWeight: '500',
    flex: 1,
  },
  jobTitleText: {
    color: COLORS.white,
    fontSize: 12,
    fontWeight: '600',
  },
  removeBtn: {
    width: 26,
    height: 26,
    borderRadius: RADIUS.pill,
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeBtnText: {
    color: COLORS.danger,
    fontSize: 11,
    fontWeight: 'bold',
  },
  footer: {
    padding: SPACING.md,
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
  },
  processBatchBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primary,
    paddingVertical: 12,
    borderRadius: RADIUS.md,
    gap: 8,
    ...SHADOWS.purple,
  },
  processBatchIcon: {
    fontSize: 16,
  },
  processBatchText: {
    color: COLORS.white,
    fontSize: 13,
    fontWeight: '800',
  },
});

