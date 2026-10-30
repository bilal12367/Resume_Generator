import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  FlatList,
  Modal,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useJobs } from '../context/JobsContext';
import { api } from '../services/api';
import { SearchJobItem, JobSource } from '../types';
import { JobCard } from '../components/JobCard';
import { JobDetailsModal } from '../components/JobDetailsModal';
import { STATIC_TARGET_COMPANIES } from '../constants/companies';
import { COLORS, SPACING, RADIUS, SHADOWS } from '../constants/theme';
import { AppStorage, STORAGE_KEYS } from '../utils/storage';

interface SearchJobsScreenProps {
  onNavigateToWorkflow: (jobId: string) => void;
}

const AVAILABLE_CITIES = [
  'Hyderabad',
  'Chennai',
  'Bangalore',
  'Pune',
  'Remote',
  'Mumbai',
  'Delhi NCR',
  'Noida',
  'Gurgaon',
];

const SEARCH_LIMIT_OPTIONS = [10, 20, 30, 40, 50];

const INITIAL_KEYWORD_SUGGESTIONS = [
  'Software Engineer',
  'Senior Python Developer',
  'Full Stack Engineer',
  'React Native Developer',
  'AI Agent Engineer',
  'FastAPI Backend Developer',
  'Cloud Solutions Architect',
  'Machine Learning Engineer',
  'DevOps Engineer',
  'Data Scientist',
];

export const SearchJobsScreen: React.FC<SearchJobsScreenProps> = ({
  onNavigateToWorkflow,
}) => {
  const { apiBaseUrl } = useAuth();
  const { setTargetWorkflowJob } = useJobs();

  // Platform state
  const [platform, setPlatform] = useState<JobSource>('linkedin');

  // Query fields
  const [keywords, setKeywords] = useState('Software Engineer');
  const [limit, setLimit] = useState<number>(20);

  // Cached search keywords & suggestions
  const [searchHistory, setSearchHistory] = useState<string[]>(INITIAL_KEYWORD_SUGGESTIONS);
  const [showSuggestions, setShowSuggestions] = useState<boolean>(false);

  // Cities Multiselect State (Default: ONLY Hyderabad!)
  const [selectedCities, setSelectedCities] = useState<string[]>(['Hyderabad']);
  const [showCityModal, setShowCityModal] = useState<boolean>(false);
  const [citySearchText, setCitySearchText] = useState<string>('');

  // Target Companies Multiselect State (Remembered and populated)
  const [selectedCompanies, setSelectedCompanies] = useState<string[]>([]);
  const [showCompanyModal, setShowCompanyModal] = useState<boolean>(false);
  const [companySearch, setCompanySearch] = useState<string>('');

  // Experience level & date posted
  const [experienceLevel, setExperienceLevel] = useState<string>('');
  const [postedWithin, setPostedWithin] = useState<string>('');

  // Results & UI State
  const [searchResults, setSearchResults] = useState<SearchJobItem[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState<boolean>(false);

  // In-Memory Filter & Sort
  const [filterQuery, setFilterQuery] = useState<string>('');
  const [sortBy, setSortBy] = useState<'newest' | 'title' | 'company'>('newest');

  // Job Details Modal
  const [selectedModalJob, setSelectedModalJob] = useState<any>(null);
  const [modalLoading, setModalLoading] = useState<boolean>(false);
  const [showModal, setShowModal] = useState<boolean>(false);

  const handlePlatformChange = (p: JobSource) => {
    setPlatform(p);
  };

  const executeSearch = async (
    overrideKw?: string,
    overrideCities?: string[],
    overrideCompanies?: string[]
  ) => {
    setLoading(true);
    setErrorMsg(null);
    setHasSearched(true);
    setShowSuggestions(false);

    const activeKw = overrideKw !== undefined ? overrideKw : keywords;
    const activeCities = overrideCities !== undefined ? overrideCities : selectedCities;
    const activeCompanies = overrideCompanies !== undefined ? overrideCompanies : selectedCompanies;

    // Save keyword to search history cache (deduplicated at top) & persist
    const trimmedKw = activeKw.trim();
    if (trimmedKw) {
      setSearchHistory((prev) => {
        const updated = [
          trimmedKw,
          ...prev.filter((item) => item.toLowerCase() !== trimmedKw.toLowerCase()),
        ].slice(0, 25);
        AppStorage.setItem(STORAGE_KEYS.SEARCH_HISTORY, JSON.stringify(updated)).catch(() => {});
        return updated;
      });
      AppStorage.setItem(STORAGE_KEYS.LAST_KEYWORD, trimmedKw).catch(() => {});
    }

    // Persist active city and company selections
    AppStorage.setItem(STORAGE_KEYS.SELECTED_CITIES, JSON.stringify(activeCities)).catch(() => {});
    AppStorage.setItem(STORAGE_KEYS.SELECTED_COMPANIES, JSON.stringify(activeCompanies)).catch(() => {});

    let finalKeywords = trimmedKw || 'Software Engineer';
    if (activeCompanies.length > 0) {
      finalKeywords = `${finalKeywords} ${activeCompanies.join(', ')}`;
    }

    const locationQuery = activeCities.length > 0 ? activeCities.join(', ') : 'Hyderabad';

    try {
      const results = await api.searchJobs(apiBaseUrl, platform, {
        keywords: finalKeywords,
        location: locationQuery,
        experienceLevel: experienceLevel || undefined,
        postedWithin: postedWithin || undefined,
        limit: limit,
      });
      setSearchResults(results);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to search jobs');
      setSearchResults([]);
    } finally {
      setLoading(false);
    }
  };

  // Restore all saved preferences on mount and run initial search
  useEffect(() => {
    const restoreSavedPreferences = async () => {
      try {
        const [savedKw, savedHistory, savedCitiesJson, savedCompaniesJson] = await Promise.all([
          AppStorage.getItem(STORAGE_KEYS.LAST_KEYWORD),
          AppStorage.getItem(STORAGE_KEYS.SEARCH_HISTORY),
          AppStorage.getItem(STORAGE_KEYS.SELECTED_CITIES),
          AppStorage.getItem(STORAGE_KEYS.SELECTED_COMPANIES),
        ]);

        let kwToUse = 'Software Engineer';
        if (savedKw && savedKw.trim()) {
          kwToUse = savedKw.trim();
          setKeywords(kwToUse);
        }

        if (savedHistory) {
          try {
            const parsedHist = JSON.parse(savedHistory);
            if (Array.isArray(parsedHist) && parsedHist.length > 0) {
              setSearchHistory(parsedHist);
            }
          } catch (e) {}
        }

        // Default ONLY Hyderabad if not found in storage or if old 4-cities preset was saved
        let citiesToUse = ['Hyderabad'];
        if (savedCitiesJson) {
          try {
            const parsedCities = JSON.parse(savedCitiesJson);
            if (Array.isArray(parsedCities) && parsedCities.length > 0) {
              const isOldFourPreset =
                parsedCities.length === 4 &&
                ['Hyderabad', 'Chennai', 'Bangalore', 'Pune'].every((c: string) => parsedCities.includes(c));

              if (isOldFourPreset) {
                citiesToUse = ['Hyderabad'];
                AppStorage.setItem(STORAGE_KEYS.SELECTED_CITIES, JSON.stringify(['Hyderabad'])).catch(() => {});
              } else {
                citiesToUse = parsedCities;
              }
              setSelectedCities(citiesToUse);
            }
          } catch (e) {}
        } else {
          AppStorage.setItem(STORAGE_KEYS.SELECTED_CITIES, JSON.stringify(['Hyderabad'])).catch(() => {});
        }

        let companiesToUse: string[] = [];
        if (savedCompaniesJson) {
          try {
            const parsedCompanies = JSON.parse(savedCompaniesJson);
            if (Array.isArray(parsedCompanies) && parsedCompanies.length > 0) {
              companiesToUse = parsedCompanies;
              setSelectedCompanies(companiesToUse);
            }
          } catch (e) {}
        }

        executeSearch(kwToUse, citiesToUse, companiesToUse);
      } catch (err) {
        executeSearch(keywords, ['Hyderabad'], []);
      }
    };

    restoreSavedPreferences();
  }, []);

  const handleViewJobDetails = async (job: SearchJobItem) => {
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
      console.warn('Error loading job details:', err);
      setSelectedModalJob({
        ...job,
        error: err.message || 'Failed to fetch job details from server',
      });
    } finally {
      setModalLoading(false);
    }
  };

  const handleStartWorkflow = (jobId: string) => {
    const jobItem = searchResults.find((j) => String(j.job_id) === String(jobId));
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

  const toggleTargetCompany = (comp: string) => {
    setSelectedCompanies((prev) => {
      const next = prev.includes(comp) ? prev.filter((c) => c !== comp) : [...prev, comp];
      AppStorage.setItem(STORAGE_KEYS.SELECTED_COMPANIES, JSON.stringify(next)).catch(() => {});
      return next;
    });
  };

  const clearTargetCompanies = () => {
    setSelectedCompanies([]);
    AppStorage.setItem(STORAGE_KEYS.SELECTED_COMPANIES, JSON.stringify([])).catch(() => {});
  };

  const selectAllTargetCompanies = () => {
    setSelectedCompanies([...STATIC_TARGET_COMPANIES]);
    AppStorage.setItem(STORAGE_KEYS.SELECTED_COMPANIES, JSON.stringify(STATIC_TARGET_COMPANIES)).catch(() => {});
  };

  const toggleCity = (city: string) => {
    setSelectedCities((prev) => {
      const next = prev.includes(city) ? prev.filter((c) => c !== city) : [...prev, city];
      const finalCities = next.length > 0 ? next : ['Hyderabad'];
      AppStorage.setItem(STORAGE_KEYS.SELECTED_CITIES, JSON.stringify(finalCities)).catch(() => {});
      return finalCities;
    });
  };

  const selectHyderabadOnly = () => {
    const hyd = ['Hyderabad'];
    setSelectedCities(hyd);
    AppStorage.setItem(STORAGE_KEYS.SELECTED_CITIES, JSON.stringify(hyd)).catch(() => {});
  };

  const selectAllCities = () => {
    setSelectedCities([...AVAILABLE_CITIES]);
    AppStorage.setItem(STORAGE_KEYS.SELECTED_CITIES, JSON.stringify(AVAILABLE_CITIES)).catch(() => {});
  };

  const selectKeywordItem = (item: string) => {
    setKeywords(item);
    setShowSuggestions(false);
    AppStorage.setItem(STORAGE_KEYS.LAST_KEYWORD, item).catch(() => {});
    executeSearch(item);
  };

  // Filter autocomplete & previous search suggestions matching typed keyword
  const trimmedKw = keywords.trim().toLowerCase();
  const matchingSuggestions = searchHistory.filter((item) => {
    if (!trimmedKw) return true;
    return item.toLowerCase().includes(trimmedKw);
  });

  // Filter & sort results in memory
  const filteredResults = searchResults
    .filter((j) => {
      const q = filterQuery.trim().toLowerCase();
      if (!q) return true;
      return (
        j.title.toLowerCase().includes(q) ||
        j.company_name.toLowerCase().includes(q) ||
        j.location.toLowerCase().includes(q) ||
        String(j.job_id).toLowerCase().includes(q)
      );
    })
    .sort((a, b) => {
      if (sortBy === 'title') return a.title.localeCompare(b.title);
      if (sortBy === 'company') return a.company_name.localeCompare(b.company_name);
      return (b.posted_date || '').localeCompare(a.posted_date || '');
    });

  const filteredTargetCompanies = STATIC_TARGET_COMPANIES.filter((c) =>
    c.toLowerCase().includes(companySearch.toLowerCase())
  );

  const filteredCities = AVAILABLE_CITIES.filter((c) =>
    c.toLowerCase().includes(citySearchText.toLowerCase())
  );

  return (
    <View style={styles.container}>
      {/* Search Header Form & Job Results List */}
      <FlatList
        data={filteredResults}
        keyExtractor={(item) => `${item.job_source}-${item.job_id}`}
        contentContainerStyle={styles.listContent}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View style={styles.headerComponent}>
            {/* Platform Selector Toggle */}
            <View style={styles.platformSelector}>
              <TouchableOpacity
                style={[
                  styles.platformBtn,
                  platform === 'linkedin' && styles.platformBtnActiveLinkedIn,
                ]}
                onPress={() => handlePlatformChange('linkedin')}
                activeOpacity={0.8}
              >
                <Text
                  style={[
                    styles.platformBtnText,
                    platform === 'linkedin' && styles.platformBtnTextActive,
                  ]}
                >
                  💼 LinkedIn Jobs
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.platformBtn,
                  platform === 'naukri' && styles.platformBtnActiveNaukri,
                ]}
                onPress={() => handlePlatformChange('naukri')}
                activeOpacity={0.8}
              >
                <Text
                  style={[
                    styles.platformBtnText,
                    platform === 'naukri' && styles.platformBtnTextActive,
                  ]}
                >
                  🚀 Naukri.com Jobs
                </Text>
              </TouchableOpacity>
            </View>

            {/* Inputs Card */}
            <View style={styles.searchCard}>
              {/* Keywords Input with Autocomplete & Previous Searches */}
              <View style={styles.inputRow}>
                <View style={styles.labelRow}>
                  <Text style={styles.inputLabel}>Job Keywords / Title</Text>
                  <View style={styles.historyBtnGroup}>
                    {searchHistory.length > 0 && (
                      <TouchableOpacity
                        style={styles.historyToggleBtn}
                        onPress={() => setShowSuggestions(!showSuggestions)}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.historyToggleText}>
                          🕒 Previous Searches ({searchHistory.length}) {showSuggestions ? '▲' : '▼'}
                        </Text>
                      </TouchableOpacity>
                    )}
                    {keywords.length > 0 && (
                      <TouchableOpacity
                        onPress={() => {
                          setKeywords('');
                          setShowSuggestions(true);
                        }}
                      >
                        <Text style={styles.clearFieldText}>Clear</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>

                <TextInput
                  style={styles.input}
                  placeholder="e.g. Software Engineer, Python, React"
                  placeholderTextColor={COLORS.textLight}
                  value={keywords}
                  onChangeText={(text) => {
                    setKeywords(text);
                    setShowSuggestions(true);
                  }}
                  onFocus={() => setShowSuggestions(true)}
                />

                {/* Autocomplete / Previous Searches Dropdown */}
                {showSuggestions && searchHistory.length > 0 && (
                  <View style={styles.suggestionsBox}>
                    <View style={styles.suggestionsHeaderRow}>
                      <Text style={styles.suggestionsHeader}>
                        {trimmedKw && matchingSuggestions.length > 0
                          ? `Matching Previous Searches (${matchingSuggestions.length}):`
                          : 'Previous Searched Keywords (Tap to Select):'}
                      </Text>
                      <TouchableOpacity
                        onPress={() => setShowSuggestions(false)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Text style={styles.closeSuggestionsText}>✕ Close</Text>
                      </TouchableOpacity>
                    </View>
                    {(matchingSuggestions.length > 0 ? matchingSuggestions : searchHistory)
                      .slice(0, 8)
                      .map((item, idx) => {
                        const isCurrent = keywords.trim().toLowerCase() === item.toLowerCase();
                        return (
                          <TouchableOpacity
                            key={idx}
                            style={[styles.suggestionItem, isCurrent && styles.suggestionItemActive]}
                            onPress={() => selectKeywordItem(item)}
                            activeOpacity={0.7}
                          >
                            <View style={styles.suggestionLeft}>
                              <Text style={styles.suggestionIcon}>🕒</Text>
                              <Text
                                style={[
                                  styles.suggestionText,
                                  isCurrent && styles.suggestionTextActive,
                                ]}
                                numberOfLines={1}
                              >
                                {item}
                              </Text>
                            </View>
                            <View
                              style={[styles.selectBadge, isCurrent && styles.selectBadgeActive]}
                            >
                              <Text
                                style={[
                                  styles.selectBadgeText,
                                  isCurrent && styles.selectBadgeTextActive,
                                ]}
                              >
                                {isCurrent ? 'Selected ✓' : 'Select ↗'}
                              </Text>
                            </View>
                          </TouchableOpacity>
                        );
                      })}
                  </View>
                )}

                {/* Cached Recent Searches Chips Row */}
                {searchHistory.length > 0 && (
                  <View style={styles.recentSearchesSection}>
                    <Text style={styles.recentSearchesTitle}>
                      🕒 Previous Searches (Tap to select & search):
                    </Text>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.recentSearchesRow}
                      keyboardShouldPersistTaps="handled"
                    >
                      {searchHistory.slice(0, 10).map((item, idx) => {
                        const isActive = keywords.trim().toLowerCase() === item.toLowerCase();
                        return (
                          <TouchableOpacity
                            key={idx}
                            style={[
                              styles.recentChip,
                              isActive && styles.recentChipActive,
                            ]}
                            onPress={() => selectKeywordItem(item)}
                            activeOpacity={0.75}
                          >
                            <Text
                              style={[
                                styles.recentChipText,
                                isActive && styles.recentChipTextActive,
                              ]}
                              numberOfLines={1}
                            >
                              {isActive ? '✓ ' : ''}{item}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>
                  </View>
                )}
              </View>

              {/* Cities Multiselect Dropdown (Default: Hyderabad Only) */}
              <View style={styles.inputRow}>
                <View style={styles.labelRow}>
                  <Text style={styles.inputLabel}>
                    Target Location ({selectedCities.length})
                  </Text>
                  <TouchableOpacity
                    style={[
                      styles.quickPresetPill,
                      selectedCities.length === 1 &&
                        selectedCities[0] === 'Hyderabad' &&
                        styles.quickPresetPillActive,
                    ]}
                    onPress={selectHyderabadOnly}
                    activeOpacity={0.8}
                  >
                    <Text
                      style={[
                        styles.quickPresetLink,
                        selectedCities.length === 1 &&
                          selectedCities[0] === 'Hyderabad' &&
                          styles.quickPresetLinkActive,
                      ]}
                    >
                      📍 Hyderabad Only
                    </Text>
                  </TouchableOpacity>
                </View>

                <TouchableOpacity
                  style={styles.selectDropdownBtn}
                  onPress={() => setShowCityModal(true)}
                  activeOpacity={0.8}
                >
                  <View style={styles.dropdownBtnContent}>
                    <Text style={styles.dropdownBtnIcon}>📍</Text>
                    <Text style={styles.dropdownBtnText} numberOfLines={1}>
                      {selectedCities.length === 0
                        ? 'Hyderabad (Default)'
                        : selectedCities.join(', ')}
                    </Text>
                  </View>
                  <Text style={styles.chevron}>▾</Text>
                </TouchableOpacity>

                {/* Selected Cities Removable Chips */}
                {selectedCities.length > 0 && (
                  <View style={styles.chipsRow}>
                    {selectedCities.map((city) => (
                      <TouchableOpacity
                        key={city}
                        style={styles.cityChip}
                        onPress={() => toggleCity(city)}
                      >
                        <Text style={styles.cityChipText}>📍 {city}</Text>
                        <Text style={styles.chipX}>✕</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>

              {/* Target Companies Multiselect (Remembered and populated) */}
              <View style={styles.inputRow}>
                <View style={styles.labelRow}>
                  <Text style={styles.inputLabel}>
                    Target Companies{' '}
                    {selectedCompanies.length > 0
                      ? `(${selectedCompanies.length})`
                      : '(Optional)'}
                  </Text>
                  {selectedCompanies.length > 0 && (
                    <TouchableOpacity onPress={clearTargetCompanies}>
                      <Text style={styles.clearFieldText}>Clear All</Text>
                    </TouchableOpacity>
                  )}
                </View>
                <TouchableOpacity
                  style={styles.selectDropdownBtn}
                  onPress={() => setShowCompanyModal(true)}
                  activeOpacity={0.8}
                >
                  <View style={styles.dropdownBtnContent}>
                    <Text style={styles.dropdownBtnIcon}>🏢</Text>
                    <Text style={styles.dropdownBtnText} numberOfLines={1}>
                      {selectedCompanies.length === 0
                        ? 'All Companies (MNC & Startups)'
                        : `${selectedCompanies.length} Selected: ${selectedCompanies.join(', ')}`}
                    </Text>
                  </View>
                  <Text style={styles.chevron}>▾</Text>
                </TouchableOpacity>

                {/* Company Chips */}
                {selectedCompanies.length > 0 && (
                  <View style={styles.chipsRow}>
                    {selectedCompanies.map((c) => (
                      <TouchableOpacity
                        key={c}
                        style={styles.companyChip}
                        onPress={() => toggleTargetCompany(c)}
                      >
                        <Text style={styles.companyChipText}>{c}</Text>
                        <Text style={styles.chipX}>✕</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>

              {/* Job Limit Selector Dropdown (10 - 50 Jobs) */}
              <View style={styles.inputRow}>
                <View style={styles.labelRow}>
                  <Text style={styles.inputLabel}>Search Results Limit (10 - 50 Jobs)</Text>
                  <Text style={styles.activeLimitBadge}>{limit} Jobs</Text>
                </View>

                <View style={styles.limitPillRow}>
                  {SEARCH_LIMIT_OPTIONS.map((opt) => {
                    const isSelected = limit === opt;
                    return (
                      <TouchableOpacity
                        key={opt}
                        style={[styles.limitPill, isSelected && styles.limitPillActive]}
                        onPress={() => setLimit(opt)}
                        activeOpacity={0.8}
                      >
                        <Text
                          style={[
                            styles.limitPillText,
                            isSelected && styles.limitPillTextActive,
                          ]}
                        >
                          {opt} Jobs
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {/* Search Button */}
              <TouchableOpacity
                style={[
                  styles.searchBtn,
                  platform === 'naukri' ? styles.searchBtnNaukri : styles.searchBtnPurple,
                ]}
                onPress={() => executeSearch()}
                disabled={loading}
                activeOpacity={0.85}
              >
                {loading ? (
                  <View style={styles.loadingRow}>
                    <ActivityIndicator color={COLORS.white} size="small" />
                    <Text style={styles.searchBtnText}>
                      Searching {limit} {platform === 'naukri' ? 'Naukri' : 'LinkedIn'} Jobs...
                    </Text>
                  </View>
                ) : (
                  <Text style={styles.searchBtnText}>
                    🔍 Search {limit} {platform === 'naukri' ? 'Naukri' : 'LinkedIn'} Jobs
                  </Text>
                )}
              </TouchableOpacity>
            </View>

            {/* Error Banner */}
            {errorMsg && (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>⚠️ API Error: {errorMsg}</Text>
                <TouchableOpacity style={styles.inlineRetryBtn} onPress={() => executeSearch()}>
                  <Text style={styles.inlineRetryBtnText}>🔄 Retry Request</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* In-Memory Filter & Sort Bar */}
            {searchResults.length > 0 && !loading && (
              <View style={styles.filterBar}>
                <TextInput
                  style={styles.filterInput}
                  placeholder="Filter results by title, company, or city..."
                  placeholderTextColor={COLORS.textLight}
                  value={filterQuery}
                  onChangeText={setFilterQuery}
                />
                <View style={styles.sortRow}>
                  <Text style={styles.resultCountText}>
                    Showing <Text style={styles.bold}>{filteredResults.length}</Text> of{' '}
                    {searchResults.length} jobs
                  </Text>
                  <TouchableOpacity
                    onPress={() =>
                      setSortBy((prev) =>
                        prev === 'newest'
                          ? 'title'
                          : prev === 'title'
                          ? 'company'
                          : 'newest'
                      )
                    }
                    style={styles.sortBtn}
                  >
                    <Text style={styles.sortBtnText}>
                      Sort: {sortBy.toUpperCase()} ⇕
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        }
        renderItem={({ item }) => (
          <JobCard
            job={item}
            onViewDetails={(j) => handleViewJobDetails(j as SearchJobItem)}
            onStartWorkflow={(j) => handleStartWorkflow(String(j.job_id))}
          />
        )}
        ListEmptyComponent={
          !loading ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyIcon}>{errorMsg ? '⚠️' : '🔍'}</Text>
              <Text style={[styles.emptyTitle, errorMsg ? styles.textErrorTitle : null]}>
                {errorMsg
                  ? 'Job Search Failed'
                  : hasSearched
                  ? 'No matching jobs found'
                  : 'Ready to search jobs'}
              </Text>
              <Text style={styles.emptySubtitle}>
                {errorMsg
                  ? errorMsg
                  : hasSearched
                  ? 'Try modifying keywords or selecting more cities.'
                  : 'Enter criteria above and tap Search to retrieve live listings.'}
              </Text>
              {errorMsg && (
                <TouchableOpacity style={styles.emptyRetryBtn} onPress={() => executeSearch()}>
                  <Text style={styles.emptyRetryBtnText}>🔄 Retry Job Search</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : undefined
        }
      />

      {/* Cities Multiselect Modal */}
      <Modal
        visible={showCityModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowCityModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>📍 Select Target Cities</Text>
                <Text style={styles.modalSubtitle}>
                  Choose cities in India or Worldwide
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setShowCityModal(false)}
                style={styles.closeBtn}
              >
                <Text style={styles.closeBtnText}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* Quick Action Presets */}
            <View style={styles.modalQuickActionsRow}>
              <TouchableOpacity
                style={[
                  styles.modalQuickActionBtn,
                  selectedCities.length === 1 &&
                    selectedCities[0] === 'Hyderabad' &&
                    styles.modalQuickActionActive,
                ]}
                onPress={selectHyderabadOnly}
              >
                <Text
                  style={[
                    styles.modalQuickActionText,
                    selectedCities.length === 1 &&
                      selectedCities[0] === 'Hyderabad' &&
                      styles.modalQuickActionTextActive,
                  ]}
                >
                  📍 Hyderabad Only
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalQuickActionBtn}
                onPress={selectAllCities}
              >
                <Text style={styles.modalQuickActionText}>Select All</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalQuickActionBtn, styles.clearBtn]}
                onPress={selectHyderabadOnly}
              >
                <Text style={styles.clearBtnText}>Reset to Hyd</Text>
              </TouchableOpacity>
            </View>

            <TextInput
              style={styles.modalSearchInput}
              placeholder="Search city name..."
              placeholderTextColor={COLORS.textLight}
              value={citySearchText}
              onChangeText={setCitySearchText}
            />

            <ScrollView style={styles.modalList}>
              {filteredCities.map((city) => {
                const isChecked = selectedCities.includes(city);
                return (
                  <TouchableOpacity
                    key={city}
                    style={[styles.modalRow, isChecked && styles.modalRowChecked]}
                    onPress={() => toggleCity(city)}
                  >
                    <Text
                      style={[
                        styles.modalRowText,
                        isChecked && styles.modalRowTextChecked,
                      ]}
                    >
                      {isChecked ? '☑️' : '☐'} {city}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.modalDoneBtn}
                onPress={() => setShowCityModal(false)}
              >
                <Text style={styles.modalDoneBtnText}>
                  Done ({selectedCities.length} Cities Selected)
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Target Company Selector Modal */}
      <Modal
        visible={showCompanyModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowCompanyModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>🏢 Select Target Companies</Text>
                <Text style={styles.modalSubtitle}>Filter by Top Tech Employers</Text>
              </View>
              <TouchableOpacity
                onPress={() => setShowCompanyModal(false)}
                style={styles.closeBtn}
              >
                <Text style={styles.closeBtnText}>✕</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.modalQuickActionsRow}>
              <TouchableOpacity
                style={styles.modalQuickActionBtn}
                onPress={selectAllTargetCompanies}
              >
                <Text style={styles.modalQuickActionText}>Select All</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalQuickActionBtn, styles.clearBtn]}
                onPress={clearTargetCompanies}
              >
                <Text style={styles.clearBtnText}>Clear All</Text>
              </TouchableOpacity>
            </View>

            <TextInput
              style={styles.modalSearchInput}
              placeholder="Filter company name..."
              placeholderTextColor={COLORS.textLight}
              value={companySearch}
              onChangeText={setCompanySearch}
            />

            <ScrollView style={styles.modalList}>
              {filteredTargetCompanies.map((c) => {
                const isChecked = selectedCompanies.includes(c);
                return (
                  <TouchableOpacity
                    key={c}
                    style={[styles.modalRow, isChecked && styles.modalRowChecked]}
                    onPress={() => toggleTargetCompany(c)}
                  >
                    <Text
                      style={[
                        styles.modalRowText,
                        isChecked && styles.modalRowTextChecked,
                      ]}
                    >
                      {isChecked ? '☑️' : '☐'} {c}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.modalDoneBtn}
                onPress={() => setShowCompanyModal(false)}
              >
                <Text style={styles.modalDoneBtnText}>
                  Done ({selectedCompanies.length} Companies Selected)
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Reusable Job Details Modal */}
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
  headerComponent: {
    marginBottom: SPACING.md,
  },
  platformSelector: {
    flexDirection: 'row',
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.md,
    padding: 4,
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOWS.sm,
  },
  platformBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: RADIUS.sm,
  },
  platformBtnActiveLinkedIn: {
    backgroundColor: COLORS.linkedin,
  },
  platformBtnActiveNaukri: {
    backgroundColor: COLORS.naukriNavy,
  },
  platformBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textMuted,
  },
  platformBtnTextActive: {
    color: COLORS.white,
  },
  searchCard: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: SPACING.md,
    ...SHADOWS.sm,
  },
  inputRow: {
    gap: 4,
    position: 'relative',
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.primary,
    textTransform: 'uppercase',
  },
  clearFieldText: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textMuted,
  },
  historyBtnGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  historyToggleBtn: {
    backgroundColor: COLORS.primaryLight,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.primaryBorder,
  },
  historyToggleText: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.primary,
  },
  quickPresetPill: {
    backgroundColor: COLORS.infoLight,
    borderWidth: 1,
    borderColor: '#bae6fd',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: RADIUS.pill,
  },
  quickPresetPillActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  quickPresetLink: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.info,
  },
  quickPresetLinkActive: {
    color: COLORS.white,
    fontWeight: '800',
  },
  activeLimitBadge: {
    fontSize: 11,
    fontWeight: '800',
    color: COLORS.primary,
  },
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: 9,
    fontSize: 13,
    color: COLORS.textMain,
    backgroundColor: COLORS.bg,
  },
  suggestionsBox: {
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.primaryBorder,
    borderRadius: RADIUS.md,
    marginTop: 4,
    padding: SPACING.xs,
    ...SHADOWS.md,
    zIndex: 10,
  },
  suggestionsHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  suggestionsHeader: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.textMuted,
    textTransform: 'uppercase',
  },
  closeSuggestionsText: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.textMuted,
  },
  suggestionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    paddingHorizontal: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  suggestionItemActive: {
    backgroundColor: COLORS.primaryLight,
  },
  suggestionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
    marginRight: 8,
  },
  suggestionIcon: {
    fontSize: 12,
  },
  suggestionText: {
    fontSize: 12,
    color: COLORS.textMain,
    fontWeight: '600',
  },
  suggestionTextActive: {
    color: COLORS.primary,
    fontWeight: '800',
  },
  selectBadge: {
    backgroundColor: COLORS.bg,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: RADIUS.sm,
  },
  selectBadgeActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  selectBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.textSecondary,
  },
  selectBadgeTextActive: {
    color: COLORS.white,
    fontWeight: '800',
  },
  recentSearchesSection: {
    marginTop: 4,
    gap: 4,
  },
  recentSearchesTitle: {
    fontSize: 10,
    fontWeight: '600',
    color: COLORS.textMuted,
  },
  recentSearchesRow: {
    flexDirection: 'row',
    gap: 6,
    paddingVertical: 2,
  },
  recentChip: {
    backgroundColor: COLORS.bg,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: RADIUS.pill,
  },
  recentChipActive: {
    backgroundColor: COLORS.primaryLight,
    borderColor: COLORS.primary,
  },
  recentChipText: {
    fontSize: 11,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
  recentChipTextActive: {
    color: COLORS.primary,
    fontWeight: '700',
  },
  selectDropdownBtn: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: 10,
    backgroundColor: COLORS.bg,
  },
  dropdownBtnContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
    marginRight: 6,
  },
  dropdownBtnIcon: {
    fontSize: 13,
  },
  dropdownBtnText: {
    fontSize: 13,
    color: COLORS.textMain,
    fontWeight: '600',
    flex: 1,
  },
  chevron: {
    fontSize: 14,
    color: COLORS.textMuted,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 6,
  },
  cityChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.infoLight,
    borderWidth: 1,
    borderColor: '#bae6fd',
    borderRadius: RADIUS.pill,
    paddingHorizontal: 9,
    paddingVertical: 4,
    gap: 5,
  },
  cityChipText: {
    fontSize: 11,
    color: COLORS.info,
    fontWeight: '700',
  },
  companyChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primaryLight,
    borderWidth: 1,
    borderColor: COLORS.primaryBorder,
    borderRadius: RADIUS.pill,
    paddingHorizontal: 8,
    paddingVertical: 4,
    gap: 4,
  },
  companyChipText: {
    fontSize: 11,
    color: COLORS.primary,
    fontWeight: '700',
  },
  chipX: {
    fontSize: 10,
    color: COLORS.textMuted,
    fontWeight: 'bold',
  },
  limitPillRow: {
    flexDirection: 'row',
    gap: 6,
  },
  limitPill: {
    flex: 1,
    backgroundColor: COLORS.bg,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingVertical: 8,
    borderRadius: RADIUS.md,
    alignItems: 'center',
  },
  limitPillActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  limitPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textSecondary,
  },
  limitPillTextActive: {
    color: COLORS.white,
    fontWeight: '800',
  },
  searchBtn: {
    paddingVertical: 13,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
    ...SHADOWS.sm,
  },
  searchBtnPurple: {
    backgroundColor: COLORS.primary,
  },
  searchBtnNaukri: {
    backgroundColor: COLORS.naukriNavy,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  searchBtnText: {
    color: COLORS.white,
    fontSize: 13,
    fontWeight: '800',
  },
  errorBox: {
    backgroundColor: COLORS.dangerLight,
    padding: SPACING.sm,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.dangerBorder,
    marginTop: SPACING.sm,
  },
  errorText: {
    color: COLORS.danger,
    fontSize: 12,
    fontWeight: '600',
  },
  filterBar: {
    marginTop: SPACING.md,
    backgroundColor: COLORS.white,
    padding: SPACING.sm,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 6,
  },
  filterInput: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 6,
    fontSize: 12,
    color: COLORS.textMain,
    backgroundColor: COLORS.bg,
  },
  sortRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 2,
  },
  resultCountText: {
    fontSize: 11,
    color: COLORS.textMuted,
    fontWeight: '600',
  },
  bold: {
    fontWeight: '800',
    color: COLORS.primary,
  },
  sortBtn: {
    paddingVertical: 2,
    paddingHorizontal: 6,
  },
  sortBtnText: {
    fontSize: 11,
    color: COLORS.primary,
    fontWeight: '700',
  },
  emptyContainer: {
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: COLORS.white,
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    maxHeight: '82%',
    padding: SPACING.md,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.textMain,
  },
  modalSubtitle: {
    fontSize: 11,
    color: COLORS.textMuted,
  },
  closeBtn: {
    padding: 6,
  },
  closeBtnText: {
    fontSize: 14,
    color: COLORS.textMuted,
    fontWeight: 'bold',
  },
  modalQuickActionsRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: SPACING.sm,
  },
  modalQuickActionBtn: {
    backgroundColor: COLORS.bg,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: RADIUS.pill,
  },
  modalQuickActionActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  modalQuickActionText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.primary,
  },
  modalQuickActionTextActive: {
    color: COLORS.white,
    fontWeight: '800',
  },
  clearBtn: {
    backgroundColor: COLORS.dangerLight,
    borderColor: COLORS.dangerBorder,
  },
  clearBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.danger,
  },
  modalSearchInput: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: 8,
    fontSize: 13,
    marginBottom: SPACING.sm,
    backgroundColor: COLORS.bg,
  },
  modalList: {
    maxHeight: 280,
  },
  modalRow: {
    paddingVertical: 11,
    paddingHorizontal: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  modalRowChecked: {
    backgroundColor: COLORS.primarySubtle,
  },
  modalRowText: {
    fontSize: 13,
    color: COLORS.textMain,
  },
  modalRowTextChecked: {
    color: COLORS.primary,
    fontWeight: '700',
  },
  modalFooter: {
    marginTop: SPACING.sm,
    paddingTop: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  modalDoneBtn: {
    backgroundColor: COLORS.primary,
    paddingVertical: 12,
    borderRadius: RADIUS.md,
    alignItems: 'center',
  },
  modalDoneBtnText: {
    color: COLORS.white,
    fontSize: 13,
    fontWeight: '800',
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
