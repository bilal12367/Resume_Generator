import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useJobs } from '../context/JobsContext';
import { api } from '../services/api';
import {
  UserProfile,
  WorkflowSession,
  WorkflowBatch,
  SavedJob,
  PdfLink,
} from '../types';
import { COLORS, SPACING, RADIUS, SHADOWS } from '../constants/theme';

interface WorkflowScreenProps {
  initialJobId?: string | null;
}

type WorkflowSubTab = 'batch' | 'single' | 'manual';

export const WorkflowScreen: React.FC<WorkflowScreenProps> = () => {
  const { apiBaseUrl } = useAuth();
  const {
    selectedJobs,
    clearSelectedJobs,
    targetWorkflowJob,
    setTargetWorkflowJob,
  } = useJobs();

  // Sub-Tab Navigation ('batch' | 'single' | 'manual')
  const [activeTab, setActiveTab] = useState<WorkflowSubTab>(
    selectedJobs.length > 0 ? 'batch' : 'single'
  );

  // Batches & Sessions State
  const [batches, setBatches] = useState<WorkflowBatch[]>([]);
  const [activeBatchId, setActiveBatchId] = useState<string>('');
  const [batchProfileId, setBatchProfileId] = useState<number | null>(null);
  const [runningBatchATS, setRunningBatchATS] = useState<boolean>(false);

  const [sessions, setSessions] = useState<WorkflowSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string>('');
  const [activeSession, setActiveSession] = useState<WorkflowSession | null>(null);
  const [loadingSessions, setLoadingSessions] = useState<boolean>(true);

  // Form State for Single / Manual Mode
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [savedJobs, setSavedJobs] = useState<SavedJob[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<number | null>(null);
  const [selectedJobId, setSelectedJobId] = useState<string>('');
  const [customJobId, setCustomJobId] = useState<string>('');
  const [manualJobTitle, setManualJobTitle] = useState<string>('');
  const [manualJobDescription, setManualJobDescription] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Processing Flags
  const [runningATS, setRunningATS] = useState<boolean>(false);
  const [generatingPDF, setGeneratingPDF] = useState<boolean>(false);

  // ATS Edit & PDF state
  const [showJsonEditor, setShowJsonEditor] = useState<boolean>(false);
  const [jsonEditText, setJsonEditText] = useState<string>('');
  const [pdfFilename, setPdfFilename] = useState<string>('candidate_resume');
  const [selectedPdfIndex, setSelectedPdfIndex] = useState<number>(0);

  const pollingTimerRef = useRef<any>(null);

  // Switch to batch tab if user selects jobs
  useEffect(() => {
    if (selectedJobs.length > 0) {
      setActiveTab('batch');
    }
  }, [selectedJobs.length]);

  // Load Dropdowns, Sessions & Batches
  const loadInitialData = async () => {
    setLoadingSessions(true);
    setErrorMsg(null);
    try {
      const [profList, jobList, sessList, batchList] = await Promise.all([
        api.getUserProfiles(apiBaseUrl).catch(() => []),
        api.getSavedJobs(apiBaseUrl).catch(() => []),
        api.getWorkflowSessions(apiBaseUrl).catch(() => []),
        api.getWorkflowBatches(apiBaseUrl).catch(() => []),
      ]);

      setProfiles(profList);
      if (profList.length > 0) {
        setSelectedProfileId(profList[0].id);
        setBatchProfileId(profList[0].id);
      }

      setSavedJobs(jobList);
      setSessions(sessList);
      setBatches(batchList);

      if (batchList.length > 0 && !activeBatchId) {
        setActiveBatchId(batchList[0].batch_id);
      }

      if (sessList.length > 0) {
        if (!activeSessionId) {
          setActiveSessionId(sessList[0].session_id);
          setActiveSession(sessList[0]);
        } else {
          const found = sessList.find((s) => s.session_id === activeSessionId);
          if (found) setActiveSession(found);
        }
      }
    } catch (err: any) {
      console.warn('Error loading workflow data:', err);
      setErrorMsg(err.message || 'Failed to load workflow data from backend');
    } finally {
      setLoadingSessions(false);
    }
  };

  useEffect(() => {
    loadInitialData();
  }, [apiBaseUrl]);

  // Handle passed target job from search or saved screen
  useEffect(() => {
    if (targetWorkflowJob) {
      setActiveTab('single');
      setSelectedJobId(targetWorkflowJob.jobId);
      setPdfFilename(`resume_job_${targetWorkflowJob.jobId}`);
      if (activeSession) {
        setActiveSession({
          ...activeSession,
          job_id: targetWorkflowJob.jobId,
          title: `Workflow: ${targetWorkflowJob.title || targetWorkflowJob.jobId}`,
        });
      }
    }
  }, [targetWorkflowJob]);

  // Refresh sessions when activeSessionId changes
  useEffect(() => {
    if (activeSessionId) {
      const current = sessions.find((s) => s.session_id === activeSessionId);
      if (current) {
        setActiveSession(current);
        if (current.job_id) {
          setSelectedJobId(current.job_id);
          setPdfFilename(`candidate_${current.profile_id || 1}_job_${current.job_id}`);
        }
      }
    }
  }, [activeSessionId, sessions]);

  // Sync ATS JSON into editor
  useEffect(() => {
    if (activeSession?.generated_ats?.ats_data_parsed) {
      setJsonEditText(
        JSON.stringify(activeSession.generated_ats.ats_data_parsed, null, 2)
      );
    }
  }, [activeSession?.generated_ats]);

  // Auto-polling for active batch progress if jobs are in progress
  useEffect(() => {
    if (!activeBatchId) return;

    const currentBatchSessions = sessions.filter((s) => s.batch_id === activeBatchId);
    const hasPending = currentBatchSessions.some(
      (s) =>
        s.status === 'CREATED' ||
        s.status === 'QUEUED' ||
        s.status === 'ATS_GENERATING' ||
        s.status === 'PDF_GENERATING'
    );

    if (hasPending || runningBatchATS) {
      pollingTimerRef.current = setTimeout(async () => {
        try {
          const [updatedSessions, updatedBatches] = await Promise.all([
            api.getWorkflowSessions(apiBaseUrl),
            api.getWorkflowBatches(apiBaseUrl),
          ]);
          setSessions(updatedSessions);
          setBatches(updatedBatches);
        } catch (e) {}
      }, 3000);
    }

    return () => {
      if (pollingTimerRef.current) clearTimeout(pollingTimerRef.current);
    };
  }, [sessions, activeBatchId, runningBatchATS]);

  // --- BATCH ATS WORKFLOW EXECUTION ---
  const handleStartBatchWorkflow = async () => {
    if (!selectedJobs || selectedJobs.length === 0) {
      Alert.alert('No Jobs Selected', 'Add jobs to your drawer from LinkedIn or Naukri to process as a batch.');
      return;
    }

    const profileId = batchProfileId || selectedProfileId || (profiles[0] ? profiles[0].id : 1);
    setRunningBatchATS(true);
    setErrorMsg(null);

    try {
      const jobsPayload = selectedJobs.map((j) => ({
        job_id: j.jobId,
        title: j.title || `Job ${j.jobId}`,
        company_name: j.company || 'Company',
        job_source: (j.jobSource || 'linkedin').toLowerCase(),
        job_url: j.jobUrl,
      }));

      const res = await api.runBatchATS(apiBaseUrl, profileId, jobsPayload);

      clearSelectedJobs();

      // Refresh batches & sessions
      const [updatedBatches, updatedSessions] = await Promise.all([
        api.getWorkflowBatches(apiBaseUrl),
        api.getWorkflowSessions(apiBaseUrl),
      ]);

      setBatches(updatedBatches);
      setSessions(updatedSessions);

      if (res.batch_id) {
        setActiveBatchId(res.batch_id);
      }
      if (res.sessions && res.sessions.length > 0) {
        setActiveSessionId(res.sessions[0].session_id);
      } else if (updatedSessions.length > 0) {
        setActiveSessionId(updatedSessions[0].session_id);
      }

      Alert.alert(
        'Batch Started',
        `Successfully launched concurrent ATS workflow for ${jobsPayload.length} jobs.`
      );
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to start batch workflow');
      Alert.alert('Batch Failed', err.message || 'Could not execute batch workflow.');
    } finally {
      setRunningBatchATS(false);
    }
  };

  const handleRetrySession = async (sessionItem: WorkflowSession) => {
    try {
      setRunningBatchATS(true);
      setErrorMsg(null);
      const targetProfId = sessionItem.profile_id || batchProfileId || selectedProfileId || (profiles[0] ? profiles[0].id : 1);
      const payload: any = {
        profile_id: targetProfId,
        job_id: sessionItem.job_id || 'UNKNOWN',
      };
      await api.runATSWorkflow(apiBaseUrl, sessionItem.session_id, payload);
      await loadInitialData();
      Alert.alert('Job Retried', `ATS workflow re-processed for Job ${sessionItem.job_id}`);
    } catch (err: any) {
      setErrorMsg(err.message || 'Could not retry workflow for this job');
      Alert.alert('Retry Failed', err.message || 'Could not retry workflow for this job.');
    } finally {
      setRunningBatchATS(false);
    }
  };

  const handleRetryAllFailedInBatch = async () => {
    const failedList = batchSessions.filter((s) => s.status === 'FAILED');
    if (failedList.length === 0) return;

    setRunningBatchATS(true);
    setErrorMsg(null);
    try {
      const targetProfId = batchProfileId || selectedProfileId || (profiles[0] ? profiles[0].id : 1);
      const jobsToRetry = failedList.map((s) => ({
        job_id: s.job_id || 'UNKNOWN',
        title: s.title || `Job ${s.job_id}`,
        company_name: 'Company',
        job_source: (s.job_source || 'linkedin').toLowerCase(),
        job_url: s.job_url,
      }));
      await api.runBatchATS(apiBaseUrl, targetProfId, jobsToRetry);
      await loadInitialData();
      Alert.alert('Batch Retried', `Relaunched workflow for ${jobsToRetry.length} failed jobs.`);
    } catch (err: any) {
      setErrorMsg(err.message || 'Could not retry failed batch jobs');
      Alert.alert('Retry Failed', err.message || 'Could not retry failed batch jobs.');
    } finally {
      setRunningBatchATS(false);
    }
  };

  // --- SINGLE JOB ATS OPTIMIZATION ---
  const handleRunSingleATS = async () => {
    const isManual = activeTab === 'manual';
    const finalJobId = selectedJobId === 'custom' ? customJobId.trim() : selectedJobId;

    if (!isManual && !finalJobId) {
      Alert.alert('Job Required', 'Please select or enter a target Job ID.');
      return;
    }
    if (isManual && !manualJobDescription.trim()) {
      Alert.alert('Description Required', 'Please enter a manual job description.');
      return;
    }

    setRunningATS(true);
    setErrorMsg(null);

    try {
      let currentSessId = activeSessionId;
      if (!currentSessId || currentSessId.startsWith('batch_')) {
        const newSess = await api.createWorkflowSession(
          apiBaseUrl,
          `Session: ${finalJobId || 'Manual'}`,
          finalJobId || 'MANUAL',
          selectedProfileId || 1
        );
        currentSessId = newSess.session_id;
        setActiveSessionId(currentSessId);
      }

      const payload: any = {
        profile_id: selectedProfileId || 1,
      };

      if (isManual) {
        payload.job_id = 'MANUAL';
        payload.job_description_text = manualJobDescription;
      } else {
        payload.job_id = finalJobId;
      }

      const res = await api.runATSWorkflow(apiBaseUrl, currentSessId, payload);

      const updatedSession: WorkflowSession = {
        ...(activeSession || { session_id: currentSessId, title: 'Session' }),
        status: 'ATS_COMPLETED',
        total_tokens: res.total_tokens || 0,
        processing_time_seconds: res.processing_time_seconds || 0,
        job_id: finalJobId || 'MANUAL',
        generated_ats: res.generated_ats,
      };

      setActiveSession(updatedSession);
      setSessions((prev) =>
        prev.map((s) => (s.session_id === currentSessId ? updatedSession : s))
      );
      setPdfFilename(`candidate_${selectedProfileId || 1}_job_${finalJobId || 'manual'}`);
    } catch (err: any) {
      setErrorMsg(err.message || 'ATS workflow failed');
      Alert.alert('ATS Optimization Failed', err.message || 'Could not generate ATS data.');
    } finally {
      setRunningATS(false);
    }
  };

  // --- SAVE MODIFIED JSON ---
  const handleSaveModifiedJson = async () => {
    if (!activeSessionId) return;
    try {
      const parsed = JSON.parse(jsonEditText);
      await api.updateATSData(apiBaseUrl, activeSessionId, parsed);
      if (activeSession) {
        setActiveSession({
          ...activeSession,
          generated_ats: {
            ...activeSession.generated_ats,
            ats_data_parsed: parsed,
          },
        });
      }
      setShowJsonEditor(false);
      Alert.alert('Saved', 'Modified ATS JSON saved successfully. PDF generation will now use this updated resume data.');
    } catch (e: any) {
      Alert.alert('Invalid JSON', e.message);
    }
  };

  // --- GENERATE PDFS ---
  const handleGeneratePDFs = async () => {
    if (!activeSessionId) {
      Alert.alert('Session Required', 'Please run or select an ATS session first.');
      return;
    }
    if (!pdfFilename.trim()) {
      Alert.alert('Filename Required', 'Please enter a filename for your PDF.');
      return;
    }

    setGeneratingPDF(true);
    setErrorMsg(null);
    try {
      const res = await api.generatePDFs(
        apiBaseUrl,
        activeSessionId,
        pdfFilename.trim()
      );

      const links: PdfLink[] = res.pdf_links || [];
      if (links.length === 0) {
        throw new Error('Server completed request but returned no generated PDF links.');
      }

      const updated: WorkflowSession = {
        ...(activeSession || { session_id: activeSessionId, title: 'Session' }),
        status: 'PDF_COMPLETED',
        pdf_filename: pdfFilename,
        pdf_links: links,
      };

      setActiveSession(updated);
      setSessions((prev) =>
        prev.map((s) => (s.session_id === activeSessionId ? updated : s))
      );
      Alert.alert('PDFs Generated', `Successfully compiled ${links.length} styled ATS resume PDFs.`);
    } catch (err: any) {
      setErrorMsg(err.message || 'PDF generation failed');
      Alert.alert('PDF Generation Failed', err.message);
    } finally {
      setGeneratingPDF(false);
    }
  };

  const handleOpenPdf = async (rawUrl?: string) => {
    if (!rawUrl) {
      Alert.alert('PDF Unavailable', 'No PDF link is available for this template.');
      return;
    }

    // Resolve relative paths (/output/...) into absolute URLs using apiBaseUrl
    let fullUrl = rawUrl.trim();
    if (!fullUrl.startsWith('http://') && !fullUrl.startsWith('https://')) {
      const base = (apiBaseUrl || '').trim().replace(/\/+$/, '');
      const cleanPath = rawUrl.replace(/^\/+/, '');
      fullUrl = base ? `${base}/${cleanPath}` : `http://10.0.2.2:8000/${cleanPath}`;
    }

    // Fallback scheme safety
    if (!fullUrl.startsWith('http://') && !fullUrl.startsWith('https://')) {
      fullUrl = `http://${fullUrl}`;
    }

    try {
      if (Platform.OS === 'android') {
        // Try Chrome-specific intent if installed on Android device
        const chromeIntentUrl = `googlechrome://navigate?url=${encodeURIComponent(fullUrl)}`;
        const canOpenChrome = await Linking.canOpenURL(chromeIntentUrl).catch(() => false);
        if (canOpenChrome) {
          await Linking.openURL(chromeIntentUrl);
          return;
        }
      }
      // Standard openURL invokes the system default web browser (Chrome on Android)
      await Linking.openURL(fullUrl);
    } catch (err: any) {
      // Direct fallback attempt with Linking
      try {
        await Linking.openURL(fullUrl);
      } catch (finalErr: any) {
        Alert.alert(
          'Cannot Open PDF in Browser',
          `Could not open PDF at:\n${fullUrl}\n\nError: ${finalErr?.message || finalErr}`
        );
      }
    }
  };

  const handleCreateNewSession = () => {
    const newSessId = `session_${Date.now()}`;
    const newSess: WorkflowSession = {
      session_id: newSessId,
      title: `ATS Workflow #${sessions.length + 1}`,
      status: 'CREATED',
    };
    setSessions((prev) => [newSess, ...prev]);
    setActiveSessionId(newSessId);
    setActiveSession(newSess);
    setTargetWorkflowJob(null);
    setActiveTab('single');
  };

  // Active batch data
  const currentBatch = batches.find((b) => b.batch_id === activeBatchId);
  const batchSessions = sessions.filter((s) => s.batch_id === activeBatchId);
  const totalBatchCount = batchSessions.length || (currentBatch ? currentBatch.total_jobs : 0);
  const completedBatchCount = batchSessions.filter(
    (s) => s.status === 'ATS_COMPLETED' || s.status === 'PDF_GENERATING' || s.status === 'PDF_COMPLETED'
  ).length;
  const batchProgressPct = totalBatchCount > 0 ? Math.round((completedBatchCount / totalBatchCount) * 100) : 0;
  const totalBatchTokens = batchSessions.reduce((acc, s) => acc + (s.total_tokens || 0), 0);
  const totalBatchTime = batchSessions.reduce((acc, s) => acc + (s.processing_time_seconds || 0), 0);
  const failedBatchSessions = batchSessions.filter((s) => s.status === 'FAILED');
  const failedBatchCount = failedBatchSessions.length;

  // ATS & Interview Data for active session
  const atsData = activeSession?.generated_ats?.ats_data_parsed;
  const interviewGuide = atsData?.personal_details?.points_to_user;

  const getStatusBadgeStyle = (st: string) => {
    switch (st) {
      case 'ATS_COMPLETED':
      case 'PDF_COMPLETED':
        return styles.badgeSuccess;
      case 'ATS_GENERATING':
      case 'PDF_GENERATING':
      case 'QUEUED':
        return styles.badgeWarning;
      case 'FAILED':
        return styles.badgeDanger;
      default:
        return styles.badgeDefault;
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Error Banner */}
      {errorMsg && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>⚠️ API Error: {errorMsg}</Text>
          <TouchableOpacity style={styles.inlineRetryBtn} onPress={loadInitialData}>
            <Text style={styles.inlineRetryBtnText}>🔄 Retry Loading Backend Data</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Top Header Card */}
      <View style={styles.sessionCard}>
        <View style={styles.sessionHeaderRow}>
          <View style={styles.sessionTitleGroup}>
            <Text style={styles.sessionLabel}>ATS WORKFLOW SUITE</Text>
            <Text style={styles.sessionTitle} numberOfLines={1}>
              {activeSession?.title || activeSessionId || 'New Workflow Session'}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.newSessionBtn}
            onPress={handleCreateNewSession}
            activeOpacity={0.8}
          >
            <Text style={styles.newSessionBtnText}>➕ New Run</Text>
          </TouchableOpacity>
        </View>

        {/* Status Metrics Bar */}
        <View style={styles.metricsRow}>
          <View style={[styles.statusBadge, getStatusBadgeStyle(activeSession?.status || 'CREATED')]}>
            <Text style={styles.statusBadgeText}>
              {activeSession?.status || 'READY'}
            </Text>
          </View>

          {activeSession?.total_tokens ? (
            <View style={styles.metricItem}>
              <Text style={styles.metricText}>
                ⚡ {activeSession.total_tokens.toLocaleString()} tokens
              </Text>
            </View>
          ) : null}

          {activeSession?.processing_time_seconds ? (
            <View style={styles.metricItem}>
              <Text style={styles.metricText}>
                ⏱️ {activeSession.processing_time_seconds}s
              </Text>
            </View>
          ) : null}
        </View>
      </View>

      {/* Sub-Tab Mode Switcher (Batch / Single / Manual) */}
      <View style={styles.tabSwitcher}>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'batch' && styles.tabBtnActive]}
          onPress={() => setActiveTab('batch')}
          activeOpacity={0.8}
        >
          <Text style={[styles.tabBtnText, activeTab === 'batch' && styles.tabBtnTextActive]}>
            ⚡ Batch Workflow {selectedJobs.length > 0 ? `(${selectedJobs.length})` : batches.length > 0 ? `(${batches.length})` : ''}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'single' && styles.tabBtnActive]}
          onPress={() => setActiveTab('single')}
          activeOpacity={0.8}
        >
          <Text style={[styles.tabBtnText, activeTab === 'single' && styles.tabBtnTextActive]}>
            🎯 Single Job ATS
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'manual' && styles.tabBtnActive]}
          onPress={() => setActiveTab('manual')}
          activeOpacity={0.8}
        >
          <Text style={[styles.tabBtnText, activeTab === 'manual' && styles.tabBtnTextActive]}>
            ✍️ Manual Input
          </Text>
        </TouchableOpacity>
      </View>

      {/* ========================================================================= */}
      {/* OPTION A: BATCH WORKFLOW PROCESSING WORKSPACE                             */}
      {/* ========================================================================= */}
      {activeTab === 'batch' && (
        <View style={styles.stepCard}>
          <View style={styles.stepTitleRow}>
            <View style={[styles.stepNumberBadge, styles.stepBadgePurple]}>
              <Text style={styles.stepNumberText}>⚡</Text>
            </View>
            <View style={styles.stepTitleGroup}>
              <Text style={styles.stepTitle}>Batch ATS Processing Workspace</Text>
              <Text style={styles.stepSubtitle}>
                Run concurrent ATS optimization across your selected job list
              </Text>
            </View>
          </View>

          {/* Section 1: Launch New Batch (if user selected jobs from search / saved jobs) */}
          {selectedJobs && selectedJobs.length > 0 ? (
            <View style={styles.launchBatchBox}>
              <View style={styles.launchBatchHeader}>
                <Text style={styles.launchBatchTitle}>
                  🚀 Launch Batch for {selectedJobs.length} Selected Jobs
                </Text>
              </View>

              {/* Selected Jobs Summary Preview Chips */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.selectedChipsScroll}>
                {selectedJobs.map((j) => (
                  <View key={j.jobId} style={styles.selectedJobChip}>
                    <Text style={styles.selectedChipId}>ID: {j.jobId}</Text>
                    <Text style={styles.selectedChipTitle} numberOfLines={1}>
                      {j.title || j.company || 'Job'}
                    </Text>
                  </View>
                ))}
              </ScrollView>

              {/* Candidate Profile Picker */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Select Candidate Resume Profile:</Text>
                <View style={styles.profilePickerRow}>
                  {profiles.map((p) => {
                    const isSelected = (batchProfileId || selectedProfileId) === p.id;
                    return (
                      <TouchableOpacity
                        key={p.id}
                        style={[styles.profilePill, isSelected && styles.profilePillActive]}
                        onPress={() => {
                          setBatchProfileId(p.id);
                          setSelectedProfileId(p.id);
                        }}
                      >
                        <Text style={[styles.profilePillText, isSelected && styles.profilePillTextActive]}>
                          {p.profile_name}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {/* Action Button */}
              <TouchableOpacity
                style={styles.processBatchButton}
                onPress={handleStartBatchWorkflow}
                disabled={runningBatchATS}
                activeOpacity={0.85}
              >
                {runningBatchATS ? (
                  <View style={styles.loadingRow}>
                    <ActivityIndicator size="small" color={COLORS.white} />
                    <Text style={styles.processBatchButtonText}>
                      Starting Batch ({selectedJobs.length} Jobs)...
                    </Text>
                  </View>
                ) : (
                  <Text style={styles.processBatchButtonText}>
                    ⚡ Process Batch ({selectedJobs.length} Jobs) in ATS
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          ) : null}

          {/* Section 2: Batch Runs Selector */}
          {batches.length > 0 ? (
            <View style={styles.batchSelectorSection}>
              <View style={styles.batchSelectorHeader}>
                <Text style={styles.batchSelectorLabel}>Select Batch Run to Inspect:</Text>
                <TouchableOpacity onPress={loadInitialData} style={styles.refreshIconBtn}>
                  <Text style={styles.refreshIconText}>🔄 Refresh Batches</Text>
                </TouchableOpacity>
              </View>

              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.batchRunsScroll}>
                {batches.map((b) => {
                  const isSelected = activeBatchId === b.batch_id;
                  return (
                    <TouchableOpacity
                      key={b.batch_id}
                      style={[styles.batchRunPill, isSelected && styles.batchRunPillActive]}
                      onPress={() => {
                        setActiveBatchId(b.batch_id);
                        const bSessions = sessions.filter((s) => s.batch_id === b.batch_id);
                        if (bSessions.length > 0) {
                          setActiveSessionId(bSessions[0].session_id);
                        }
                      }}
                    >
                      <Text style={[styles.batchRunPillTitle, isSelected && styles.textWhite]} numberOfLines={1}>
                        {b.batch_title}
                      </Text>
                      <Text style={[styles.batchRunPillMeta, isSelected && styles.textWhiteMuted]}>
                        {b.completed_jobs}/{b.total_jobs} Ready • {b.total_tokens || 0} tok
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          ) : null}

          {/* Section 3: Active Batch Progress & Metrics Dashboard */}
          {activeBatchId ? (
            <View style={styles.batchDashboard}>
              {/* Stat Boxes Grid */}
              <View style={styles.statGrid}>
                <View style={styles.statCard}>
                  <Text style={styles.statLabel}>COMPLETED JOBS</Text>
                  <Text style={styles.statValue}>
                    {completedBatchCount} of {totalBatchCount} Ready
                  </Text>
                </View>

                <View style={styles.statCard}>
                  <Text style={styles.statLabel}>TOTAL TOKEN USAGE</Text>
                  <Text style={styles.statValue}>
                    {totalBatchTokens.toLocaleString()} tokens
                  </Text>
                </View>

                <View style={styles.statCard}>
                  <Text style={styles.statLabel}>PROCESSING TIME</Text>
                  <Text style={styles.statValue}>
                    {totalBatchTime.toFixed(1)}s
                  </Text>
                </View>
              </View>

              {/* Progress Bar */}
              <View style={styles.progressContainer}>
                <View style={styles.progressHeader}>
                  <Text style={styles.progressLabel}>Batch ATS Workflow Progress</Text>
                  <Text style={styles.progressPct}>{batchProgressPct}%</Text>
                </View>
                <View style={styles.progressBarTrack}>
                  <View style={[styles.progressBarFill, { width: `${batchProgressPct}%` }]} />
                </View>
              </View>

              {/* Batch Failure Warning Notice & Batch Retry Button */}
              {failedBatchCount > 0 && (
                <View style={styles.batchFailureNotice}>
                  <View style={styles.batchFailureTextGroup}>
                    <Text style={styles.batchFailureNoticeText}>
                      ⚠️ {failedBatchCount} job{failedBatchCount > 1 ? 's' : ''} failed in this batch run.
                    </Text>
                    <Text style={styles.batchFailureSubtext}>
                      Review the specific error details on the job cards below or retry all.
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.batchRetryAllBtn}
                    onPress={handleRetryAllFailedInBatch}
                    disabled={runningBatchATS}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.batchRetryAllBtnText}>
                      🔄 Retry {failedBatchCount} Failed
                    </Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* Jobs in This Batch Cards List */}
              <Text style={styles.batchJobsTitle}>
                Jobs in this Batch (Tap any job card to inspect its ATS data & generate PDF):
              </Text>

              <View style={styles.batchJobsList}>
                {batchSessions.map((s) => {
                  const isCurrent = activeSessionId === s.session_id;
                  const isDone = s.status === 'ATS_COMPLETED' || s.status === 'PDF_COMPLETED';
                  const isFailed = s.status === 'FAILED';
                  return (
                    <TouchableOpacity
                      key={s.session_id}
                      style={[
                        styles.batchJobCard,
                        isCurrent && styles.batchJobCardSelected,
                        isFailed && styles.batchJobCardFailed,
                      ]}
                      onPress={() => setActiveSessionId(s.session_id)}
                      activeOpacity={0.8}
                    >
                      <View style={styles.batchJobCardTop}>
                        <View style={styles.idChip}>
                          <Text style={styles.idChipText}>ID: {s.job_id}</Text>
                        </View>
                        <View style={[styles.jobStatusPill, getStatusBadgeStyle(s.status)]}>
                          <Text style={styles.jobStatusPillText}>{s.status}</Text>
                        </View>
                      </View>

                      <Text style={styles.batchJobTitle} numberOfLines={2}>
                        {s.title}
                      </Text>

                      {/* Error Banner on Failed Job Card */}
                      {isFailed && (
                        <View style={styles.jobErrorBox}>
                          <Text style={styles.jobErrorText} numberOfLines={2}>
                            ⚠️ Error: {s.error_message || 'Workflow processing failed on server'}
                          </Text>
                          <TouchableOpacity
                            style={styles.retryJobBtn}
                            onPress={() => handleRetrySession(s)}
                            disabled={runningBatchATS}
                            activeOpacity={0.75}
                          >
                            <Text style={styles.retryJobBtnText}>🔄 Retry This Job</Text>
                          </TouchableOpacity>
                        </View>
                      )}

                      <View style={styles.batchJobCardMeta}>
                        <Text style={styles.batchJobMetaText}>
                          ⚡ {s.total_tokens ? `${s.total_tokens} tok` : '0 tok'}
                        </Text>
                        <Text style={styles.batchJobMetaText}>
                          ⏱️ {s.processing_time_seconds ? `${s.processing_time_seconds}s` : '0s'}
                        </Text>
                        {s.job_source && (
                          <Text style={styles.batchJobPlatformText}>
                            {s.job_source}
                          </Text>
                        )}
                        {isDone && (
                          <Text style={styles.batchInspectBadge}>
                            {isCurrent ? '👉 Active' : 'View ATS ↗'}
                          </Text>
                        )}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          ) : !selectedJobs.length && !batches.length ? (
            <View style={styles.emptyBatchBox}>
              <Text style={styles.emptyBatchIcon}>📂</Text>
              <Text style={styles.emptyBatchTitle}>No Active Batches Found</Text>
              <Text style={styles.emptyBatchSubtitle}>
                Add multiple jobs to your Selected Drawer from Search or Saved Jobs, then tap "Process Batch" to run concurrent ATS optimization.
              </Text>
            </View>
          ) : null}
        </View>
      )}

      {/* ========================================================================= */}
      {/* OPTION B: SINGLE JOB ATS WORKFLOW                                         */}
      {/* ========================================================================= */}
      {activeTab === 'single' && (
        <View style={styles.stepCard}>
          <View style={styles.stepTitleRow}>
            <View style={styles.stepNumberBadge}>
              <Text style={styles.stepNumberText}>1</Text>
            </View>
            <View style={styles.stepTitleGroup}>
              <Text style={styles.stepTitle}>Configure Profile & Target Job</Text>
              <Text style={styles.stepSubtitle}>Select candidate and target job posting</Text>
            </View>
          </View>

          {/* Candidate Profile Picker */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Candidate Resume Profile:</Text>
            <View style={styles.profilePickerRow}>
              {profiles.map((p) => {
                const isSelected = selectedProfileId === p.id;
                return (
                  <TouchableOpacity
                    key={p.id}
                    style={[styles.profilePill, isSelected && styles.profilePillActive]}
                    onPress={() => setSelectedProfileId(p.id)}
                  >
                    <Text style={[styles.profilePillText, isSelected && styles.profilePillTextActive]}>
                      {p.profile_name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Job Selection Dropdown / Custom Entry */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Select Target Job ID:</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.jobPickerScroll}>
              {savedJobs.slice(0, 10).map((j) => {
                const isSelected = selectedJobId === j.job_id;
                return (
                  <TouchableOpacity
                    key={j.job_id}
                    style={[styles.jobPill, isSelected && styles.jobPillActive]}
                    onPress={() => {
                      setSelectedJobId(j.job_id);
                      setPdfFilename(`resume_job_${j.job_id}`);
                    }}
                  >
                    <Text style={[styles.jobPillId, isSelected && styles.jobPillTextActive]}>
                      ID: {j.job_id}
                    </Text>
                    <Text style={[styles.jobPillCompany, isSelected && styles.jobPillTextActive]} numberOfLines={1}>
                      {j.company_name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
              <TouchableOpacity
                style={[styles.jobPill, selectedJobId === 'custom' && styles.jobPillActive]}
                onPress={() => setSelectedJobId('custom')}
              >
                <Text style={[styles.jobPillId, selectedJobId === 'custom' && styles.jobPillTextActive]}>
                  ✏️ Custom Job ID
                </Text>
              </TouchableOpacity>
            </ScrollView>

            {selectedJobId === 'custom' && (
              <TextInput
                style={styles.input}
                placeholder="Enter LinkedIn Job ID (e.g. 4123456789)"
                placeholderTextColor={COLORS.textLight}
                value={customJobId}
                onChangeText={setCustomJobId}
              />
            )}
          </View>

          {/* Run ATS Workflow Button */}
          <TouchableOpacity
            style={styles.runAtsBtn}
            onPress={handleRunSingleATS}
            disabled={runningATS}
            activeOpacity={0.85}
          >
            {runningATS ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator color={COLORS.white} size="small" />
                <Text style={styles.runAtsBtnText}>Analyzing Job & Optimizing ATS...</Text>
              </View>
            ) : (
              <Text style={styles.runAtsBtnText}>⚡ Run ATS Resume Optimization</Text>
            )}
          </TouchableOpacity>
        </View>
      )}

      {/* ========================================================================= */}
      {/* OPTION C: MANUAL JOB DESCRIPTION INPUT                                    */}
      {/* ========================================================================= */}
      {activeTab === 'manual' && (
        <View style={styles.stepCard}>
          <View style={styles.stepTitleRow}>
            <View style={styles.stepNumberBadge}>
              <Text style={styles.stepNumberText}>1</Text>
            </View>
            <View style={styles.stepTitleGroup}>
              <Text style={styles.stepTitle}>Manual Job Description Input</Text>
              <Text style={styles.stepSubtitle}>Paste any custom job description to optimize for</Text>
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Candidate Resume Profile:</Text>
            <View style={styles.profilePickerRow}>
              {profiles.map((p) => {
                const isSelected = selectedProfileId === p.id;
                return (
                  <TouchableOpacity
                    key={p.id}
                    style={[styles.profilePill, isSelected && styles.profilePillActive]}
                    onPress={() => setSelectedProfileId(p.id)}
                  >
                    <Text style={[styles.profilePillText, isSelected && styles.profilePillTextActive]}>
                      {p.profile_name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Job Title:</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Senior Full Stack AI Engineer"
              placeholderTextColor={COLORS.textLight}
              value={manualJobTitle}
              onChangeText={setManualJobTitle}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Job Description Body:</Text>
            <TextInput
              style={styles.textArea}
              placeholder="Paste full job description requirements, responsibilities, and qualifications..."
              placeholderTextColor={COLORS.textLight}
              multiline
              numberOfLines={8}
              value={manualJobDescription}
              onChangeText={setManualJobDescription}
            />
          </View>

          <TouchableOpacity
            style={styles.runAtsBtn}
            onPress={handleRunSingleATS}
            disabled={runningATS}
            activeOpacity={0.85}
          >
            {runningATS ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator color={COLORS.white} size="small" />
                <Text style={styles.runAtsBtnText}>Optimizing Resume for Description...</Text>
              </View>
            ) : (
              <Text style={styles.runAtsBtnText}>⚡ Optimize ATS for Description</Text>
            )}
          </TouchableOpacity>
        </View>
      )}

      {/* ========================================================================= */}
      {/* STEP 2: GENERATED ATS RESUME DATA & INTERVIEW PREPARATION GUIDE           */}
      {/* ========================================================================= */}
      {atsData && (
        <View style={styles.stepCardSuccess}>
          <View style={styles.stepTitleRow}>
            <View style={[styles.stepNumberBadge, styles.stepBadgeGreen]}>
              <Text style={styles.stepNumberText}>2</Text>
            </View>
            <View style={styles.stepTitleGroup}>
              <Text style={styles.stepTitle}>ATS Optimized Resume Data</Text>
              <Text style={styles.stepSubtitle}>
                Target Job ID: {activeSession?.job_id || 'Selected Job'}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.jsonToggleBtn}
              onPress={() => setShowJsonEditor(!showJsonEditor)}
            >
              <Text style={styles.jsonToggleBtnText}>
                {showJsonEditor ? '✕ Close JSON' : '✏️ Edit JSON'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Actionable Technical Interview Preparation Guide Highlight */}
          {interviewGuide ? (
            <View style={styles.interviewCard}>
              <View style={styles.interviewHeader}>
                <Text style={styles.interviewIcon}>🎯</Text>
                <Text style={styles.interviewTitle}>
                  Actionable Technical Interview Preparation Guide:
                </Text>
              </View>
              <Text style={styles.interviewText} selectable>
                {interviewGuide}
              </Text>
            </View>
          ) : null}

          {/* Summary Metrics */}
          <View style={styles.summaryGrid}>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>CANDIDATE</Text>
              <Text style={styles.summaryVal} numberOfLines={1}>
                {atsData.personal_details?.name || 'Candidate'}
              </Text>
            </View>

            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>EXPERIENCES</Text>
              <Text style={styles.summaryVal}>
                {atsData.experience?.length || 0} Positions
              </Text>
            </View>

            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>PROJECTS ALIGNED</Text>
              <Text style={styles.summaryVal}>
                {atsData.projects?.length || 0} Projects
              </Text>
            </View>

            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>SKILLS EXTRACTED</Text>
              <Text style={styles.summaryVal}>
                {Array.isArray(atsData.skills)
                  ? atsData.skills.length
                  : typeof atsData.skills === 'object'
                  ? Object.keys(atsData.skills).length
                  : 0}{' '}
                Categories
              </Text>
            </View>
          </View>

          {/* Raw JSON Code Editor */}
          {showJsonEditor && (
            <View style={styles.jsonEditorCard}>
              <View style={styles.jsonEditorHeader}>
                <Text style={styles.jsonEditorTitle}>JSON ATS Resume Data</Text>
                <TouchableOpacity
                  style={styles.saveJsonBtn}
                  onPress={handleSaveModifiedJson}
                >
                  <Text style={styles.saveJsonBtnText}>💾 Save Modified JSON</Text>
                </TouchableOpacity>
              </View>

              <TextInput
                style={styles.jsonInput}
                multiline
                numberOfLines={14}
                value={jsonEditText}
                onChangeText={setJsonEditText}
              />
            </View>
          )}
        </View>
      )}

      {/* ========================================================================= */}
      {/* STEP 3: RENDER & GENERATE RESUME PDFS                                     */}
      {/* ========================================================================= */}
      {atsData && (
        <View style={styles.stepCard}>
          <View style={styles.stepTitleRow}>
            <View style={styles.stepNumberBadge}>
              <Text style={styles.stepNumberText}>3</Text>
            </View>
            <View style={styles.stepTitleGroup}>
              <Text style={styles.stepTitle}>Render & Generate PDFs for All Templates</Text>
              <Text style={styles.stepSubtitle}>
                Compiles styled HTML resumes into downloadable PDF documents
              </Text>
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Output Generation Filename Prefix:</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. bilal_resume_deloitte_ai"
              placeholderTextColor={COLORS.textLight}
              value={pdfFilename}
              onChangeText={setPdfFilename}
              editable={!generatingPDF}
            />
          </View>

          <TouchableOpacity
            style={styles.generatePdfBtn}
            onPress={handleGeneratePDFs}
            disabled={generatingPDF || !pdfFilename.trim()}
            activeOpacity={0.85}
          >
            {generatingPDF ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator color={COLORS.white} size="small" />
                <Text style={styles.generatePdfBtnText}>Generating PDFs via Headless Engine...</Text>
              </View>
            ) : (
              <Text style={styles.generatePdfBtnText}>📄 Generate Multi-Template PDFs</Text>
            )}
          </TouchableOpacity>
        </View>
      )}

      {/* ========================================================================= */}
      {/* STEP 4: PREVIEW & DOWNLOAD GENERATED RESUME PDFS                          */}
      {/* ========================================================================= */}
      {activeSession?.pdf_links && activeSession.pdf_links.length > 0 && (
        <View style={styles.stepCardSuccess}>
          <View style={styles.stepTitleRow}>
            <View style={[styles.stepNumberBadge, styles.stepBadgeGreen]}>
              <Text style={styles.stepNumberText}>4</Text>
            </View>
            <View style={styles.stepTitleGroup}>
              <Text style={styles.stepTitle}>Preview & Download Resume PDFs</Text>
              <Text style={styles.stepSubtitle}>
                {activeSession.pdf_links.length} styled templates generated successfully
              </Text>
            </View>
          </View>

          {/* Template Sub-Tabs */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.templateTabsScroll}>
            {activeSession.pdf_links.map((link, idx) => {
              const isSelected = selectedPdfIndex === idx;
              return (
                <TouchableOpacity
                  key={idx}
                  style={[styles.templateTab, isSelected && styles.templateTabActive]}
                  onPress={() => setSelectedPdfIndex(idx)}
                >
                  <Text style={[styles.templateTabText, isSelected && styles.templateTabTextActive]}>
                    {link.template_name.replace(/_/g, ' ')}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Active PDF Template Card */}
          {activeSession.pdf_links[selectedPdfIndex] && (
            <View style={styles.pdfCard}>
              <View style={styles.pdfCardTop}>
                <Text style={styles.pdfFilename}>
                  {activeSession.pdf_links[selectedPdfIndex].filename}
                </Text>
                <Text style={styles.pdfTemplateTag}>
                  Template: {activeSession.pdf_links[selectedPdfIndex].template_name.replace(/_/g, ' ')}
                </Text>
              </View>

              <TouchableOpacity
                style={styles.openPdfBtn}
                onPress={() => {
                  const url = activeSession?.pdf_links?.[selectedPdfIndex]?.url;
                  handleOpenPdf(url);
                }}
                activeOpacity={0.8}
              >
                <Text style={styles.openPdfBtnText}>🌐 Open in Chrome / Browser ↗</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  content: {
    padding: SPACING.md,
    gap: SPACING.md,
    paddingBottom: SPACING.xxxl,
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
  sessionCard: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOWS.sm,
    gap: SPACING.sm,
  },
  sessionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sessionTitleGroup: {
    flex: 1,
    marginRight: SPACING.sm,
  },
  sessionLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: COLORS.textMuted,
    letterSpacing: 0.5,
  },
  sessionTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.textMain,
    marginTop: 2,
  },
  newSessionBtn: {
    backgroundColor: COLORS.primaryLight,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.primaryBorder,
  },
  newSessionBtnText: {
    color: COLORS.primary,
    fontSize: 11,
    fontWeight: '700',
  },
  metricsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    flexWrap: 'wrap',
  },
  statusBadge: {
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: RADIUS.pill,
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: COLORS.white,
  },
  badgeSuccess: {
    backgroundColor: COLORS.success,
  },
  badgeWarning: {
    backgroundColor: COLORS.warning,
  },
  badgeDanger: {
    backgroundColor: COLORS.danger,
  },
  badgeDefault: {
    backgroundColor: COLORS.primary,
  },
  metricItem: {
    backgroundColor: COLORS.bg,
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  metricText: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  tabSwitcher: {
    flexDirection: 'row',
    backgroundColor: '#E2E8F0',
    borderRadius: RADIUS.lg,
    padding: 3,
    gap: 4,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: RADIUS.md,
  },
  tabBtnActive: {
    backgroundColor: COLORS.primary,
    ...SHADOWS.sm,
  },
  tabBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textSecondary,
  },
  tabBtnTextActive: {
    color: COLORS.white,
  },
  stepCard: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOWS.sm,
    gap: SPACING.md,
  },
  stepCardSuccess: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.success,
    ...SHADOWS.sm,
    gap: SPACING.md,
  },
  stepTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  stepTitleGroup: {
    flex: 1,
  },
  stepNumberBadge: {
    width: 28,
    height: 28,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBadgePurple: {
    backgroundColor: COLORS.primary,
  },
  stepBadgeGreen: {
    backgroundColor: COLORS.success,
  },
  stepNumberText: {
    color: COLORS.white,
    fontSize: 13,
    fontWeight: '800',
  },
  stepTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.textMain,
  },
  stepSubtitle: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginTop: 1,
  },
  launchBatchBox: {
    backgroundColor: COLORS.primarySubtle,
    borderWidth: 1,
    borderColor: COLORS.primaryBorder,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    gap: SPACING.sm,
  },
  launchBatchHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  launchBatchTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: COLORS.primary,
  },
  selectedChipsScroll: {
    flexDirection: 'row',
    marginVertical: 4,
  },
  selectedJobChip: {
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.primaryBorder,
    borderRadius: RADIUS.md,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginRight: 8,
    maxWidth: 160,
  },
  selectedChipId: {
    fontSize: 9,
    fontFamily: 'monospace',
    color: COLORS.textMuted,
  },
  selectedChipTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textMain,
  },
  processBatchButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: 12,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOWS.sm,
  },
  processBatchButtonText: {
    color: COLORS.white,
    fontSize: 13,
    fontWeight: '800',
  },
  batchSelectorSection: {
    gap: SPACING.xs,
  },
  batchSelectorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  batchSelectorLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textMuted,
  },
  refreshIconBtn: {
    paddingVertical: 2,
    paddingHorizontal: 6,
  },
  refreshIconText: {
    fontSize: 11,
    color: COLORS.primary,
    fontWeight: '700',
  },
  batchRunsScroll: {
    flexDirection: 'row',
    marginVertical: 4,
  },
  batchRunPill: {
    backgroundColor: COLORS.bg,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginRight: 8,
    minWidth: 130,
  },
  batchRunPillActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  batchRunPillTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textMain,
  },
  batchRunPillMeta: {
    fontSize: 10,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  batchDashboard: {
    backgroundColor: COLORS.bg,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: SPACING.md,
  },
  statGrid: {
    flexDirection: 'row',
    gap: SPACING.xs,
  },
  statCard: {
    flex: 1,
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.md,
    padding: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  statLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: COLORS.textMuted,
    marginBottom: 2,
  },
  statValue: {
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.textMain,
  },
  progressContainer: {
    gap: 4,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  progressLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textMuted,
  },
  progressPct: {
    fontSize: 11,
    fontWeight: '800',
    color: COLORS.primary,
  },
  progressBarTrack: {
    height: 8,
    backgroundColor: '#E2E8F0',
    borderRadius: RADIUS.pill,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.pill,
  },
  batchFailureNotice: {
    backgroundColor: COLORS.dangerLight,
    borderWidth: 1,
    borderColor: COLORS.dangerBorder,
    borderRadius: RADIUS.md,
    padding: SPACING.sm,
    marginVertical: SPACING.xs,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  batchFailureTextGroup: {
    flex: 1,
  },
  batchFailureNoticeText: {
    fontSize: 11,
    color: COLORS.danger,
    fontWeight: '800',
  },
  batchFailureSubtext: {
    fontSize: 10,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  batchRetryAllBtn: {
    backgroundColor: COLORS.danger,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: RADIUS.sm,
  },
  batchRetryAllBtnText: {
    color: COLORS.white,
    fontSize: 11,
    fontWeight: '800',
  },
  batchJobsTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textMain,
  },
  batchJobsList: {
    gap: SPACING.sm,
  },
  batchJobCard: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.md,
    padding: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 4,
  },
  batchJobCardSelected: {
    borderColor: COLORS.primary,
    borderWidth: 2,
    backgroundColor: COLORS.primarySubtle,
  },
  batchJobCardFailed: {
    borderColor: COLORS.dangerBorder,
    backgroundColor: '#fff5f5',
  },
  jobErrorBox: {
    backgroundColor: '#fee2e2',
    borderWidth: 1,
    borderColor: COLORS.dangerBorder,
    borderRadius: RADIUS.sm,
    padding: SPACING.xs,
    marginTop: 4,
    gap: 4,
  },
  jobErrorText: {
    fontSize: 10,
    color: COLORS.danger,
    fontWeight: '600',
  },
  retryJobBtn: {
    backgroundColor: COLORS.danger,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: RADIUS.sm,
    alignSelf: 'flex-start',
  },
  retryJobBtnText: {
    color: COLORS.white,
    fontSize: 9,
    fontWeight: '800',
  },
  batchJobCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  jobStatusPill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: RADIUS.pill,
  },
  jobStatusPillText: {
    fontSize: 9,
    fontWeight: '800',
    color: COLORS.white,
  },
  batchJobTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textMain,
  },
  batchJobCardMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  batchJobMetaText: {
    fontSize: 10,
    color: COLORS.textMuted,
  },
  batchJobPlatformText: {
    fontSize: 10,
    color: COLORS.primary,
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  batchInspectBadge: {
    fontSize: 10,
    fontWeight: '800',
    color: COLORS.primary,
    marginLeft: 'auto',
  },
  emptyBatchBox: {
    alignItems: 'center',
    padding: SPACING.xl,
    gap: SPACING.xs,
  },
  emptyBatchIcon: {
    fontSize: 34,
  },
  emptyBatchTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textMain,
  },
  emptyBatchSubtitle: {
    fontSize: 11,
    color: COLORS.textMuted,
    textAlign: 'center',
    maxWidth: 260,
  },
  inputGroup: {
    gap: 6,
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textMain,
  },
  profilePickerRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  profilePill: {
    backgroundColor: COLORS.bg,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: RADIUS.pill,
  },
  profilePillActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  profilePillText: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  profilePillTextActive: {
    color: COLORS.white,
  },
  jobPickerScroll: {
    flexDirection: 'row',
    marginVertical: 4,
  },
  jobPill: {
    backgroundColor: COLORS.bg,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: RADIUS.md,
    marginRight: 6,
    maxWidth: 140,
  },
  jobPillActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  jobPillId: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.textMain,
  },
  jobPillCompany: {
    fontSize: 10,
    color: COLORS.textMuted,
  },
  jobPillTextActive: {
    color: COLORS.white,
  },
  input: {
    backgroundColor: COLORS.bg,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: 9,
    fontSize: 12,
    color: COLORS.textMain,
  },
  textArea: {
    backgroundColor: COLORS.bg,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: 9,
    fontSize: 12,
    color: COLORS.textMain,
    textAlignVertical: 'top',
    minHeight: 110,
  },
  runAtsBtn: {
    backgroundColor: COLORS.primary,
    paddingVertical: 12,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOWS.sm,
  },
  runAtsBtnText: {
    color: COLORS.white,
    fontSize: 13,
    fontWeight: '800',
  },
  interviewCard: {
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FCD34D',
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    gap: SPACING.xs,
  },
  interviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  interviewIcon: {
    fontSize: 16,
  },
  interviewTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#92400E',
  },
  interviewText: {
    fontSize: 12,
    lineHeight: 18,
    color: '#78350F',
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
  },
  summaryCard: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: COLORS.bg,
    borderRadius: RADIUS.md,
    padding: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  summaryLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: COLORS.textMuted,
  },
  summaryVal: {
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.textMain,
    marginTop: 2,
  },
  jsonToggleBtn: {
    backgroundColor: COLORS.primaryLight,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: RADIUS.sm,
  },
  jsonToggleBtnText: {
    color: COLORS.primary,
    fontSize: 11,
    fontWeight: '700',
  },
  jsonEditorCard: {
    backgroundColor: COLORS.darkCard,
    borderRadius: RADIUS.md,
    padding: SPACING.sm,
    gap: SPACING.sm,
  },
  jsonEditorHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  jsonEditorTitle: {
    color: COLORS.white,
    fontSize: 11,
    fontWeight: '700',
  },
  saveJsonBtn: {
    backgroundColor: COLORS.success,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: RADIUS.sm,
  },
  saveJsonBtnText: {
    color: COLORS.white,
    fontSize: 10,
    fontWeight: '700',
  },
  jsonInput: {
    color: '#E2E8F0',
    fontFamily: 'monospace',
    fontSize: 10,
    minHeight: 160,
    textAlignVertical: 'top',
  },
  generatePdfBtn: {
    backgroundColor: COLORS.success,
    paddingVertical: 12,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOWS.sm,
  },
  generatePdfBtnText: {
    color: COLORS.white,
    fontSize: 13,
    fontWeight: '800',
  },
  templateTabsScroll: {
    flexDirection: 'row',
  },
  templateTab: {
    backgroundColor: COLORS.bg,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: RADIUS.md,
    marginRight: 6,
  },
  templateTabActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  templateTabText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textSecondary,
    textTransform: 'capitalize',
  },
  templateTabTextActive: {
    color: COLORS.white,
  },
  pdfCard: {
    backgroundColor: COLORS.bg,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: SPACING.sm,
  },
  pdfCardTop: {
    gap: 2,
  },
  pdfFilename: {
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.textMain,
    fontFamily: 'monospace',
  },
  pdfTemplateTag: {
    fontSize: 11,
    color: COLORS.textMuted,
    textTransform: 'capitalize',
  },
  openPdfBtn: {
    backgroundColor: COLORS.primary,
    paddingVertical: 11,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOWS.sm,
  },
  openPdfBtnText: {
    color: COLORS.white,
    fontSize: 12,
    fontWeight: '800',
  },
  idChip: {
    backgroundColor: COLORS.bg,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: RADIUS.sm,
  },
  idChipText: {
    fontSize: 9,
    fontFamily: 'monospace',
    color: COLORS.textMuted,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  textWhite: {
    color: COLORS.white,
  },
  textWhiteMuted: {
    color: 'rgba(255,255,255,0.7)',
  },
});
