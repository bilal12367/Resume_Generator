import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  Switch,
  RefreshControl,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { api } from '../services/api';
import { UserProfile, SystemPrompt } from '../types';
import { AppStorage, STORAGE_KEYS } from '../utils/storage';
import { COLORS, SPACING, RADIUS, SHADOWS } from '../constants/theme';

const DEFAULT_SAMPLE_RESUME_JSON = {
  personal_details: {
    name: 'Shaik Mohammed Bilal',
    title: 'Senior AI & Full Stack Developer',
    location: 'Hyderabad, Telangana, India',
    phone: '+91 7981266312',
    email: 'sk.bilal.md@gmail.com',
    linkedin: 'https://www.linkedin.com/in/shaik-mohammed-bilal-2b4472155/',
    github: 'https://github.com/bilal12367',
    points_to_user: 'Review full stack architectural patterns, FastAPI microservices, and distributed systems design.',
  },
  cover_letter: {
    salutation: 'Dear Hiring Manager,',
    objective:
      'Results-driven AI and Full Stack Developer with 4+ years of experience architecting end-to-end web applications, generative AI workflows, and machine learning integrations.',
  },
  experience: [
    {
      role: 'AI & Full Stack Developer',
      company: 'DataMind Automation',
      location: 'Hyderabad, India',
      dates: '2023 – Present',
      highlights: [
        'Architected document processing pipelines and LLM agents using Python, FastAPI, and SiliconFlow.',
        'Built cross-platform responsive mobile applications with React Native and TypeScript.',
        'Optimized database queries and API endpoints reducing latency by 35%.',
      ],
    },
  ],
  projects: [
    {
      name: 'AI Resume & ATS Optimization Engine',
      tech_stack: 'Python, FastAPI, MySQL, Jinja2, React Native, TypeScript',
      highlights: [
        'Automated Jinja2 HTML template rendering and headless PDF generation.',
        'Engineered concurrent batch processing for multiple job applications.',
      ],
    },
  ],
  skills: [
    {
      category: 'Programming & Frameworks',
      items: ['Python', 'FastAPI', 'React Native', 'TypeScript', 'SQLAlchemy', 'Asyncio'],
    },
    {
      category: 'AI & Automation',
      items: ['LlamaIndex', 'SiliconFlow', 'Playwright', 'Centrifugo', 'MySQL'],
    },
  ],
  education: [
    {
      degree: 'B.Tech in Computer Science & Engineering',
      institution: 'JNTU Hyderabad',
      dates: '2019 – 2023',
    },
  ],
  certifications: ['AWS Certified Developer', 'Azure AI Fundamentals'],
};

export const ProfileScreen: React.FC = () => {
  const { user, apiBaseUrl, logout } = useAuth();
  const { theme, isDark, toggleTheme } = useTheme();

  // Navigation Sub-Tabs
  const [activeTab, setActiveTab] = useState<'profiles' | 'prompts'>('profiles');

  // Candidate Profiles State
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [loadingProfiles, setLoadingProfiles] = useState<boolean>(true);
  const [activeProfileId, setActiveProfileId] = useState<number | null>(null);

  // Profile Editor Form State
  const [isEditingProfile, setIsEditingProfile] = useState<boolean>(false);
  const [editingProfileId, setEditingProfileId] = useState<number | null>(null);
  const [profileNameInput, setProfileNameInput] = useState<string>('');
  const [userDataInput, setUserDataInput] = useState<string>('');
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [savingProfile, setSavingProfile] = useState<boolean>(false);

  // System Prompts State
  const [prompts, setPrompts] = useState<SystemPrompt[]>([]);
  const [loadingPrompts, setLoadingPrompts] = useState<boolean>(true);

  // Prompt Editor Form State
  const [isEditingPrompt, setIsEditingPrompt] = useState<boolean>(false);
  const [editingPromptId, setEditingPromptId] = useState<number | null>(null);
  const [promptNameInput, setPromptNameInput] = useState<string>('');
  const [promptTextInput, setPromptTextInput] = useState<string>('');
  const [promptIsDefaultInput, setPromptIsDefaultInput] = useState<boolean>(false);
  const [savingPrompt, setSavingPrompt] = useState<boolean>(false);

  // Refreshing State
  const [refreshing, setRefreshing] = useState<boolean>(false);

  // 1. Initial Load
  useEffect(() => {
    loadAllData();
  }, [apiBaseUrl]);

  const loadAllData = async () => {
    await Promise.all([loadProfiles(), loadPrompts(), loadSavedActiveProfile()]);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadAllData();
    setRefreshing(false);
  };

  const loadSavedActiveProfile = async () => {
    try {
      const saved = await AppStorage.getItem(STORAGE_KEYS.ACTIVE_PROFILE_ID);
      if (saved) {
        setActiveProfileId(parseInt(saved, 10));
      }
    } catch {
      // ignore
    }
  };

  // --- CANDIDATE PROFILES HANDLERS ---
  const loadProfiles = async () => {
    setLoadingProfiles(true);
    try {
      const data = await api.getUserProfiles(apiBaseUrl);
      setProfiles(data);
      if (data.length > 0 && activeProfileId === null) {
        const firstId = data[0].id;
        setActiveProfileId(firstId);
        await AppStorage.setItem(STORAGE_KEYS.ACTIVE_PROFILE_ID, String(firstId));
      }
    } catch (err: any) {
      console.warn('Failed to load user profiles:', err);
    } finally {
      setLoadingProfiles(false);
    }
  };

  const handleSelectActiveProfile = async (id: number, name: string) => {
    setActiveProfileId(id);
    await AppStorage.setItem(STORAGE_KEYS.ACTIVE_PROFILE_ID, String(id));
    Alert.alert('Active Profile Set', `"${name}" is now the active profile for ATS resume generation.`);
  };

  const handleStartNewProfile = () => {
    setEditingProfileId(null);
    setProfileNameInput('My Candidate Profile');
    setUserDataInput(JSON.stringify(DEFAULT_SAMPLE_RESUME_JSON, null, 2));
    setJsonError(null);
    setIsEditingProfile(true);
  };

  const handleEditProfile = (p: UserProfile) => {
    setEditingProfileId(p.id);
    setProfileNameInput(p.profile_name);
    let strData = '';
    if (typeof p.user_data === 'string') {
      try {
        const parsed = JSON.parse(p.user_data);
        strData = JSON.stringify(parsed, null, 2);
      } catch {
        strData = p.user_data;
      }
    } else {
      strData = JSON.stringify(p.user_data, null, 2);
    }
    setUserDataInput(strData);
    setJsonError(null);
    setIsEditingProfile(true);
  };

  const handleFormatJSON = () => {
    try {
      const parsed = JSON.parse(userDataInput);
      setUserDataInput(JSON.stringify(parsed, null, 2));
      setJsonError(null);
      Alert.alert('JSON Valid', 'JSON was validated and formatted successfully.');
    } catch (e: any) {
      setJsonError(`Invalid JSON format: ${e.message}`);
      Alert.alert('Invalid JSON', e.message);
    }
  };

  const handleLoadSampleJSON = () => {
    setUserDataInput(JSON.stringify(DEFAULT_SAMPLE_RESUME_JSON, null, 2));
    setJsonError(null);
  };

  const handleSaveProfile = async () => {
    if (!profileNameInput.trim()) {
      Alert.alert('Profile Name Required', 'Please provide a name for this profile.');
      return;
    }

    let parsedPayload: any = userDataInput.trim();
    try {
      parsedPayload = JSON.parse(userDataInput);
      setJsonError(null);
    } catch {
      // Allowed if plain text
    }

    setSavingProfile(true);
    try {
      if (editingProfileId) {
        await api.updateUserProfile(apiBaseUrl, editingProfileId, profileNameInput.trim(), parsedPayload);
        Alert.alert('Profile Updated', `"${profileNameInput}" has been updated.`);
      } else {
        const res = await api.createUserProfile(apiBaseUrl, profileNameInput.trim(), parsedPayload);
        if (res.profile_id) {
          setActiveProfileId(res.profile_id);
          await AppStorage.setItem(STORAGE_KEYS.ACTIVE_PROFILE_ID, String(res.profile_id));
        }
        Alert.alert('Profile Created', `"${profileNameInput}" created and marked as active.`);
      }
      setIsEditingProfile(false);
      await loadProfiles();
    } catch (err: any) {
      Alert.alert('Save Failed', err.message || 'Could not save candidate profile.');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleDeleteProfile = async (id: number, name: string) => {
    Alert.alert(
      'Delete Profile',
      `Are you sure you want to delete profile "${name}"? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.deleteUserProfile(apiBaseUrl, id);
              if (editingProfileId === id) {
                setIsEditingProfile(false);
              }
              if (activeProfileId === id) {
                setActiveProfileId(null);
                await AppStorage.removeItem(STORAGE_KEYS.ACTIVE_PROFILE_ID);
              }
              await loadProfiles();
              Alert.alert('Deleted', `Profile "${name}" was removed.`);
            } catch (err: any) {
              Alert.alert('Delete Failed', err.message || 'Could not delete profile.');
            }
          },
        },
      ]
    );
  };

  // --- SYSTEM PROMPTS HANDLERS ---
  const loadPrompts = async () => {
    setLoadingPrompts(true);
    try {
      const data = await api.getSystemPrompts(apiBaseUrl);
      setPrompts(data);
    } catch (err: any) {
      console.warn('Failed to load system prompts:', err);
    } finally {
      setLoadingPrompts(false);
    }
  };

  const handleStartNewPrompt = () => {
    setEditingPromptId(null);
    setPromptNameInput('');
    setPromptTextInput('');
    setPromptIsDefaultInput(false);
    setIsEditingPrompt(true);
  };

  const handleEditPrompt = (sp: SystemPrompt) => {
    setEditingPromptId(sp.id);
    setPromptNameInput(sp.name);
    setPromptTextInput(sp.prompt_text);
    setPromptIsDefaultInput(sp.is_default);
    setIsEditingPrompt(true);
  };

  const handleSavePrompt = async () => {
    if (!promptNameInput.trim() || !promptTextInput.trim()) {
      Alert.alert('Fields Required', 'Please provide both prompt name and instruction text.');
      return;
    }

    setSavingPrompt(true);
    try {
      if (editingPromptId) {
        await api.updateSystemPrompt(
          apiBaseUrl,
          editingPromptId,
          promptNameInput.trim(),
          promptTextInput.trim(),
          promptIsDefaultInput
        );
        Alert.alert('Prompt Updated', `"${promptNameInput}" updated successfully.`);
      } else {
        await api.createSystemPrompt(
          apiBaseUrl,
          promptNameInput.trim(),
          promptTextInput.trim(),
          promptIsDefaultInput
        );
        Alert.alert('Prompt Created', `"${promptNameInput}" created successfully.`);
      }
      setIsEditingPrompt(false);
      await loadPrompts();
    } catch (err: any) {
      Alert.alert('Save Failed', err.message || 'Could not save system prompt.');
    } finally {
      setSavingPrompt(false);
    }
  };

  const handleSetDefaultPrompt = async (id: number, name: string) => {
    try {
      await api.setDefaultSystemPrompt(apiBaseUrl, id);
      await loadPrompts();
      Alert.alert('Default Set', `"${name}" is now the active default system prompt.`);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Could not set default prompt.');
    }
  };

  const handleDeletePrompt = async (id: number, name: string) => {
    Alert.alert(
      'Delete Prompt',
      `Are you sure you want to delete prompt "${name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.deleteSystemPrompt(apiBaseUrl, id);
              if (editingPromptId === id) {
                setIsEditingPrompt(false);
              }
              await loadPrompts();
              Alert.alert('Deleted', `Prompt "${name}" deleted.`);
            } catch (err: any) {
              Alert.alert('Delete Failed', err.message || 'Could not delete prompt.');
            }
          },
        },
      ]
    );
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.bg }]}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}
    >
      {/* 1. Account Info Card */}
      <View style={[styles.accountCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <View style={styles.accountHeaderRow}>
          <View style={[styles.avatarCircle, { backgroundColor: theme.primary }]}>
            <Text style={styles.avatarText}>{user?.name ? user.name[0].toUpperCase() : 'U'}</Text>
          </View>
          <View style={styles.accountInfo}>
            <Text style={[styles.accountName, { color: theme.textMain }]}>{user?.name || 'Applicant User'}</Text>
            <Text style={[styles.accountEmail, { color: theme.textMuted }]}>{user?.email || 'Logged in'}</Text>
            <View style={[styles.serverPill, { backgroundColor: theme.bg, borderColor: theme.border }]}>
              <Text style={styles.serverDot}>🟢</Text>
              <Text style={[styles.serverHostText, { color: theme.textSecondary }]} numberOfLines={1}>
                {apiBaseUrl}
              </Text>
            </View>
          </View>
          <TouchableOpacity style={styles.logoutBtn} onPress={logout} activeOpacity={0.8}>
            <Text style={styles.logoutBtnText}>Logout</Text>
          </TouchableOpacity>
        </View>

        {/* Preferences / Dark Mode Toggle */}
        <View style={[styles.settingsRow, { borderTopColor: theme.border }]}>
          <View style={styles.settingsLabelGroup}>
            <Text style={[styles.settingsIcon]}>{isDark ? '🌙' : '☀️'}</Text>
            <View>
              <Text style={[styles.settingsTitle, { color: theme.textMain }]}>Dark Mode</Text>
              <Text style={[styles.settingsSubtitle, { color: theme.textMuted }]}>
                {isDark ? 'Dark theme active' : 'Light theme active'}
              </Text>
            </View>
          </View>
          <Switch
            value={isDark}
            onValueChange={toggleTheme}
            trackColor={{ false: theme.border, true: theme.primary }}
            thumbColor={COLORS.white}
          />
        </View>
      </View>

      {/* 2. Top Navigation Tabs (Candidate Profiles vs System Prompts) */}
      <View style={[styles.tabSwitcher, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <TouchableOpacity
          style={[
            styles.switchTab,
            activeTab === 'profiles' && { backgroundColor: theme.primary },
          ]}
          onPress={() => setActiveTab('profiles')}
          activeOpacity={0.8}
        >
          <Text
            style={[
              styles.switchTabText,
              { color: activeTab === 'profiles' ? COLORS.white : theme.textMuted },
            ]}
          >
            👤 Candidate Profiles ({profiles.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.switchTab,
            activeTab === 'prompts' && { backgroundColor: theme.primary },
          ]}
          onPress={() => setActiveTab('prompts')}
          activeOpacity={0.8}
        >
          <Text
            style={[
              styles.switchTabText,
              { color: activeTab === 'prompts' ? COLORS.white : theme.textMuted },
            ]}
          >
            🤖 System Prompts ({prompts.length})
          </Text>
        </TouchableOpacity>
      </View>

      {/* ========================================================================= */}
      {/* TAB 1: CANDIDATE RESUME PROFILES                                          */}
      {/* ========================================================================= */}
      {activeTab === 'profiles' && (
        <View style={styles.sectionContainer}>
          {/* Header & Create Button */}
          <View style={styles.sectionHeaderRow}>
            <View>
              <Text style={[styles.sectionTitle, { color: theme.textMain }]}>Resume Candidate Data</Text>
              <Text style={[styles.sectionSubtitle, { color: theme.textMuted }]}>
                Select the active profile or customize resume schema for ATS optimization
              </Text>
            </View>
            <TouchableOpacity
              style={[styles.createBtn, { backgroundColor: theme.primary }]}
              onPress={handleStartNewProfile}
              activeOpacity={0.8}
            >
              <Text style={styles.createBtnText}>+ New Profile</Text>
            </TouchableOpacity>
          </View>

          {/* Profile Editor Modal / Inline Box */}
          {isEditingProfile && (
            <View style={[styles.editorBox, { backgroundColor: theme.card, borderColor: theme.primary }]}>
              <View style={styles.editorHeaderRow}>
                <Text style={[styles.editorTitle, { color: theme.textMain }]}>
                  {editingProfileId ? '✏️ Edit Profile' : '✨ New Candidate Profile'}
                </Text>
                <TouchableOpacity onPress={() => setIsEditingProfile(false)}>
                  <Text style={[styles.closeEditorText, { color: theme.textMuted }]}>✕ Close</Text>
                </TouchableOpacity>
              </View>

              <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Profile Display Name</Text>
              <TextInput
                style={[
                  styles.textInput,
                  {
                    backgroundColor: theme.inputBg,
                    borderColor: theme.inputBorder,
                    color: theme.textMain,
                  },
                ]}
                placeholder="e.g. Senior AI Engineer Resume"
                placeholderTextColor={theme.textMuted}
                value={profileNameInput}
                onChangeText={setProfileNameInput}
              />

              <View style={styles.jsonHeaderRow}>
                <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Resume Data (JSON / Schema)</Text>
                <View style={styles.jsonToolRow}>
                  <TouchableOpacity
                    style={[styles.toolBtn, { backgroundColor: theme.primaryLight }]}
                    onPress={handleLoadSampleJSON}
                  >
                    <Text style={[styles.toolBtnText, { color: theme.primary }]}>📋 Sample</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.toolBtn, { backgroundColor: theme.primaryLight }]}
                    onPress={handleFormatJSON}
                  >
                    <Text style={[styles.toolBtnText, { color: theme.primary }]}>✨ Format</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {jsonError && <Text style={styles.jsonErrorText}>⚠️ {jsonError}</Text>}

              <TextInput
                style={[
                  styles.jsonTextArea,
                  {
                    backgroundColor: theme.codeBg,
                    borderColor: theme.inputBorder,
                    color: theme.codeText,
                  },
                ]}
                multiline
                numberOfLines={14}
                value={userDataInput}
                onChangeText={(t) => {
                  setUserDataInput(t);
                  setJsonError(null);
                }}
                autoCapitalize="none"
                autoCorrect={false}
                placeholder="Enter valid candidate JSON..."
                placeholderTextColor={theme.textMuted}
              />

              <View style={styles.editorActionsRow}>
                <TouchableOpacity
                  style={[styles.cancelBtn, { backgroundColor: theme.surface, borderColor: theme.border }]}
                  onPress={() => setIsEditingProfile(false)}
                  disabled={savingProfile}
                >
                  <Text style={[styles.cancelBtnText, { color: theme.textSecondary }]}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.saveBtn, { backgroundColor: theme.primary }]}
                  onPress={handleSaveProfile}
                  disabled={savingProfile}
                  activeOpacity={0.8}
                >
                  {savingProfile ? (
                    <ActivityIndicator size="small" color={COLORS.white} />
                  ) : (
                    <Text style={styles.saveBtnText}>💾 Save Profile</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Profiles Card List */}
          {loadingProfiles ? (
            <View style={styles.loaderBox}>
              <ActivityIndicator size="small" color={theme.primary} />
              <Text style={[styles.loaderText, { color: theme.textMuted }]}>Loading candidate profiles...</Text>
            </View>
          ) : profiles.length === 0 ? (
            <View style={[styles.emptyBox, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <Text style={styles.emptyIcon}>👤</Text>
              <Text style={[styles.emptyTitle, { color: theme.textMain }]}>No Profiles Found</Text>
              <Text style={[styles.emptySubtitle, { color: theme.textMuted }]}>
                Tap "+ New Profile" above to create your first resume schema.
              </Text>
            </View>
          ) : (
            profiles.map((p) => {
              const isActive = activeProfileId === p.id;
              let detailsSnippet = '';
              try {
                const parsed = typeof p.user_data === 'string' ? JSON.parse(p.user_data) : p.user_data;
                detailsSnippet = parsed?.personal_details?.title || parsed?.personal_details?.name || 'Resume Data';
              } catch {
                detailsSnippet = 'Raw Profile Schema';
              }

              return (
                <View
                  key={p.id}
                  style={[
                    styles.profileCard,
                    {
                      backgroundColor: isActive ? theme.cardActive : theme.card,
                      borderColor: isActive ? theme.primary : theme.border,
                    },
                  ]}
                >
                  <View style={styles.profileCardTop}>
                    <View style={styles.profileTitleGroup}>
                      <View style={styles.profileNameRow}>
                        <Text style={[styles.profileName, { color: theme.textMain }]}>{p.profile_name}</Text>
                        {isActive && (
                          <View style={[styles.activeBadge, { backgroundColor: theme.primary }]}>
                            <Text style={styles.activeBadgeText}>ACTIVE FOR ATS</Text>
                          </View>
                        )}
                      </View>
                      <Text style={[styles.profileSnippet, { color: theme.textSecondary }]}>💼 {detailsSnippet}</Text>
                      {p.updated_at && (
                        <Text style={[styles.profileDate, { color: theme.textMuted }]}>
                          Updated: {new Date(p.updated_at).toLocaleDateString()}
                        </Text>
                      )}
                    </View>
                  </View>

                  <View style={[styles.profileActionsRow, { borderTopColor: theme.border }]}>
                    {!isActive ? (
                      <TouchableOpacity
                        style={[
                          styles.setActiveBtn,
                          { backgroundColor: theme.primaryLight, borderColor: theme.primaryBorder },
                        ]}
                        onPress={() => handleSelectActiveProfile(p.id, p.profile_name)}
                        activeOpacity={0.8}
                      >
                        <Text style={[styles.setActiveBtnText, { color: theme.primary }]}>⭐ Set as Active</Text>
                      </TouchableOpacity>
                    ) : (
                      <View style={[styles.currentActivePill, { backgroundColor: 'rgba(16, 185, 129, 0.15)' }]}>
                        <Text style={[styles.currentActivePillText, { color: theme.success }]}>✓ Currently Active</Text>
                      </View>
                    )}

                    <View style={styles.editDeleteGroup}>
                      <TouchableOpacity
                        style={[styles.actionBtnEdit, { backgroundColor: theme.surface, borderColor: theme.border }]}
                        onPress={() => handleEditProfile(p)}
                        activeOpacity={0.75}
                      >
                        <Text style={[styles.actionBtnEditText, { color: theme.textSecondary }]}>✏️ Edit</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.actionBtnDelete}
                        onPress={() => handleDeleteProfile(p.id, p.profile_name)}
                        activeOpacity={0.75}
                      >
                        <Text style={styles.actionBtnDeleteText}>🗑️ Delete</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              );
            })
          )}
        </View>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: SYSTEM PROMPTS                                                     */}
      {/* ========================================================================= */}
      {activeTab === 'prompts' && (
        <View style={styles.sectionContainer}>
          {/* Header & Create Button */}
          <View style={styles.sectionHeaderRow}>
            <View>
              <Text style={[styles.sectionTitle, { color: theme.textMain }]}>Agent System Prompts</Text>
              <Text style={[styles.sectionSubtitle, { color: theme.textMuted }]}>
                Control LLM persona, ATS keyword priorities, and bypassing instructions
              </Text>
            </View>
            <TouchableOpacity
              style={[styles.createBtn, { backgroundColor: theme.primary }]}
              onPress={handleStartNewPrompt}
              activeOpacity={0.8}
            >
              <Text style={styles.createBtnText}>+ New Prompt</Text>
            </TouchableOpacity>
          </View>

          {/* Prompt Editor Box */}
          {isEditingPrompt && (
            <View style={[styles.editorBox, { backgroundColor: theme.card, borderColor: theme.primary }]}>
              <View style={styles.editorHeaderRow}>
                <Text style={[styles.editorTitle, { color: theme.textMain }]}>
                  {editingPromptId ? '✏️ Edit System Prompt' : '✨ New System Prompt'}
                </Text>
                <TouchableOpacity onPress={() => setIsEditingPrompt(false)}>
                  <Text style={[styles.closeEditorText, { color: theme.textMuted }]}>✕ Close</Text>
                </TouchableOpacity>
              </View>

              <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Prompt Name</Text>
              <TextInput
                style={[
                  styles.textInput,
                  {
                    backgroundColor: theme.inputBg,
                    borderColor: theme.inputBorder,
                    color: theme.textMain,
                  },
                ]}
                placeholder="e.g. Aggressive ATS Keyword Bypasser"
                placeholderTextColor={theme.textMuted}
                value={promptNameInput}
                onChangeText={setPromptNameInput}
              />

              <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Instructions / System Prompt Text</Text>
              <TextInput
                style={[
                  styles.promptTextArea,
                  {
                    backgroundColor: theme.codeBg,
                    borderColor: theme.inputBorder,
                    color: theme.codeText,
                  },
                ]}
                multiline
                numberOfLines={10}
                value={promptTextInput}
                onChangeText={setPromptTextInput}
                placeholder="Enter prompt instructions for LLM..."
                placeholderTextColor={theme.textMuted}
              />

              <View style={styles.switchRow}>
                <Text style={[styles.switchLabel, { color: theme.textMain }]}>Set as Default System Prompt</Text>
                <Switch
                  value={promptIsDefaultInput}
                  onValueChange={setPromptIsDefaultInput}
                  trackColor={{ false: theme.border, true: theme.primary }}
                  thumbColor={COLORS.white}
                />
              </View>

              <View style={styles.editorActionsRow}>
                <TouchableOpacity
                  style={[styles.cancelBtn, { backgroundColor: theme.surface, borderColor: theme.border }]}
                  onPress={() => setIsEditingPrompt(false)}
                  disabled={savingPrompt}
                >
                  <Text style={[styles.cancelBtnText, { color: theme.textSecondary }]}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.saveBtn, { backgroundColor: theme.primary }]}
                  onPress={handleSavePrompt}
                  disabled={savingPrompt}
                  activeOpacity={0.8}
                >
                  {savingPrompt ? (
                    <ActivityIndicator size="small" color={COLORS.white} />
                  ) : (
                    <Text style={styles.saveBtnText}>💾 Save Prompt</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Prompts Card List */}
          {loadingPrompts ? (
            <View style={styles.loaderBox}>
              <ActivityIndicator size="small" color={theme.primary} />
              <Text style={[styles.loaderText, { color: theme.textMuted }]}>Loading system prompts...</Text>
            </View>
          ) : prompts.length === 0 ? (
            <View style={[styles.emptyBox, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <Text style={styles.emptyIcon}>🤖</Text>
              <Text style={[styles.emptyTitle, { color: theme.textMain }]}>No System Prompts</Text>
              <Text style={[styles.emptySubtitle, { color: theme.textMuted }]}>
                Tap "+ New Prompt" to add a custom LLM instruction set.
              </Text>
            </View>
          ) : (
            prompts.map((p) => {
              return (
                <View
                  key={p.id}
                  style={[
                    styles.profileCard,
                    {
                      backgroundColor: p.is_default ? theme.cardActive : theme.card,
                      borderColor: p.is_default ? theme.primary : theme.border,
                    },
                  ]}
                >
                  <View style={styles.profileCardTop}>
                    <View style={styles.profileTitleGroup}>
                      <View style={styles.profileNameRow}>
                        <Text style={[styles.profileName, { color: theme.textMain }]}>{p.name}</Text>
                        {p.is_default && (
                          <View style={[styles.defaultBadge, { backgroundColor: theme.success }]}>
                            <Text style={styles.defaultBadgeText}>DEFAULT PROMPT</Text>
                          </View>
                        )}
                      </View>
                      <Text style={[styles.promptSnippet, { color: theme.textSecondary }]} numberOfLines={3}>
                        {p.prompt_text}
                      </Text>
                    </View>
                  </View>

                  <View style={[styles.profileActionsRow, { borderTopColor: theme.border }]}>
                    {!p.is_default ? (
                      <TouchableOpacity
                        style={[
                          styles.setActiveBtn,
                          { backgroundColor: theme.primaryLight, borderColor: theme.primaryBorder },
                        ]}
                        onPress={() => handleSetDefaultPrompt(p.id, p.name)}
                        activeOpacity={0.8}
                      >
                        <Text style={[styles.setActiveBtnText, { color: theme.primary }]}>⭐ Set Default</Text>
                      </TouchableOpacity>
                    ) : (
                      <View style={[styles.currentActivePill, { backgroundColor: 'rgba(16, 185, 129, 0.15)' }]}>
                        <Text style={[styles.currentActivePillText, { color: theme.success }]}>✓ Active Default</Text>
                      </View>
                    )}

                    <View style={styles.editDeleteGroup}>
                      <TouchableOpacity
                        style={[styles.actionBtnEdit, { backgroundColor: theme.surface, borderColor: theme.border }]}
                        onPress={() => handleEditPrompt(p)}
                        activeOpacity={0.75}
                      >
                        <Text style={[styles.actionBtnEditText, { color: theme.textSecondary }]}>✏️ Edit</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.actionBtnDelete}
                        onPress={() => handleDeletePrompt(p.id, p.name)}
                        activeOpacity={0.75}
                      >
                        <Text style={styles.actionBtnDeleteText}>🗑️ Delete</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              );
            })
          )}
        </View>
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: SPACING.md,
    paddingBottom: SPACING.xxl,
  },

  // Account Card
  accountCard: {
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    borderWidth: 1,
    ...SHADOWS.sm,
  },
  accountHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.md,
  },
  avatarText: {
    fontSize: 20,
    fontWeight: '800',
    color: COLORS.white,
  },
  accountInfo: {
    flex: 1,
  },
  accountName: {
    fontSize: 16,
    fontWeight: '700',
  },
  accountEmail: {
    fontSize: 12,
    marginTop: 2,
  },
  serverPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    marginTop: 6,
    alignSelf: 'flex-start',
  },
  serverDot: {
    fontSize: 8,
    marginRight: 4,
  },
  serverHostText: {
    fontSize: 10,
    fontWeight: '600',
    maxWidth: 180,
  },
  logoutBtn: {
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: RADIUS.md,
  },
  logoutBtnText: {
    color: COLORS.danger,
    fontSize: 12,
    fontWeight: '700',
  },

  // Settings / Dark Mode
  settingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    paddingTop: SPACING.md,
    marginTop: SPACING.md,
  },
  settingsLabelGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  settingsIcon: {
    fontSize: 20,
  },
  settingsTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  settingsSubtitle: {
    fontSize: 11,
    marginTop: 1,
  },

  // Tab Switcher
  tabSwitcher: {
    flexDirection: 'row',
    borderRadius: RADIUS.lg,
    padding: 4,
    marginBottom: SPACING.md,
    borderWidth: 1,
  },
  switchTab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: RADIUS.md,
  },
  switchTabText: {
    fontSize: 13,
    fontWeight: '700',
  },

  // Section Header
  sectionContainer: {
    marginBottom: SPACING.lg,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  sectionSubtitle: {
    fontSize: 11,
    marginTop: 2,
    maxWidth: 240,
  },
  createBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: RADIUS.md,
    ...SHADOWS.sm,
  },
  createBtnText: {
    color: COLORS.white,
    fontSize: 12,
    fontWeight: '700',
  },

  // Profile Card
  profileCard: {
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    borderWidth: 1,
    ...SHADOWS.sm,
  },
  profileCardTop: {
    marginBottom: SPACING.sm,
  },
  profileTitleGroup: {
    flex: 1,
  },
  profileNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  profileName: {
    fontSize: 15,
    fontWeight: '700',
  },
  activeBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: RADIUS.sm,
  },
  activeBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: COLORS.white,
  },
  defaultBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: RADIUS.sm,
  },
  defaultBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: COLORS.white,
  },
  profileSnippet: {
    fontSize: 12,
    marginTop: 4,
  },
  promptSnippet: {
    fontSize: 12,
    marginTop: 6,
    fontStyle: 'italic',
    lineHeight: 16,
  },
  profileDate: {
    fontSize: 10,
    marginTop: 4,
  },
  profileActionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    paddingTop: SPACING.sm,
    marginTop: 4,
  },
  setActiveBtn: {
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: RADIUS.sm,
  },
  setActiveBtnText: {
    fontSize: 11,
    fontWeight: '700',
  },
  currentActivePill: {
    borderWidth: 1,
    borderColor: 'transparent',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: RADIUS.sm,
  },
  currentActivePillText: {
    fontSize: 11,
    fontWeight: '700',
  },
  editDeleteGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  actionBtnEdit: {
    borderWidth: 1,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: RADIUS.sm,
  },
  actionBtnEditText: {
    fontSize: 11,
    fontWeight: '600',
  },
  actionBtnDelete: {
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.25)',
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: RADIUS.sm,
  },
  actionBtnDeleteText: {
    color: COLORS.danger,
    fontSize: 11,
    fontWeight: '600',
  },

  // Editor Box
  editorBox: {
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    borderWidth: 1.5,
    ...SHADOWS.md,
  },
  editorHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  editorTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  closeEditorText: {
    fontSize: 12,
    fontWeight: '700',
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 8,
    marginBottom: 4,
  },
  textInput: {
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: 8,
    fontSize: 13,
    borderWidth: 1,
  },
  jsonHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 4,
  },
  jsonToolRow: {
    flexDirection: 'row',
    gap: 6,
  },
  toolBtn: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: RADIUS.sm,
  },
  toolBtnText: {
    fontSize: 10,
    fontWeight: '600',
  },
  jsonErrorText: {
    fontSize: 11,
    color: COLORS.danger,
    marginBottom: 4,
  },
  jsonTextArea: {
    borderRadius: RADIUS.md,
    padding: SPACING.sm,
    fontSize: 11,
    fontFamily: 'monospace',
    borderWidth: 1,
    minHeight: 180,
    textAlignVertical: 'top',
  },
  promptTextArea: {
    borderRadius: RADIUS.md,
    padding: SPACING.sm,
    fontSize: 12,
    borderWidth: 1,
    minHeight: 140,
    textAlignVertical: 'top',
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: SPACING.md,
    paddingVertical: 4,
  },
  switchLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  editorActionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: SPACING.md,
  },
  cancelBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: RADIUS.md,
    borderWidth: 1,
  },
  cancelBtnText: {
    fontSize: 12,
    fontWeight: '600',
  },
  saveBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: RADIUS.md,
  },
  saveBtnText: {
    color: COLORS.white,
    fontSize: 12,
    fontWeight: '700',
  },

  // Helpers
  loaderBox: {
    padding: SPACING.lg,
    alignItems: 'center',
  },
  loaderText: {
    fontSize: 12,
    marginTop: 6,
  },
  emptyBox: {
    padding: SPACING.xl,
    alignItems: 'center',
    borderRadius: RADIUS.lg,
    borderWidth: 1,
  },
  emptyIcon: {
    fontSize: 32,
    marginBottom: 8,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  emptySubtitle: {
    fontSize: 12,
    textAlign: 'center',
    marginTop: 4,
    maxWidth: 240,
  },
});
