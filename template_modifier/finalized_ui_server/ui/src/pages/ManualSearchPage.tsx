import React, { useState, useEffect, useRef } from 'react';
import type { SelectedJob } from '../types';

const STATIC_TARGET_COMPANIES = [
  'Google', 'Microsoft', 'Amazon', 'Adobe', 'Oracle', 'Salesforce', 'SAP', 'VMware',
  'ServiceNow', 'Cisco', 'Intel', 'Qualcomm', 'IBM', 'Accenture', 'Tata Consultancy Services',
  'LTIMindtree', 'Cognizant', 'Capgemini', 'HCLTech', 'Tech Mahindra', 'Deloitte', 'PwC',
  'EY', 'KPMG', 'JPMorgan Chase', 'Morgan Stanley', 'Goldman Sachs', 'Barclays', 'Wells Fargo',
  'PayPal', 'American Express'
];

interface SearchJobItem {
  job_id: string;
  title: string;
  company_name: string;
  location: string;
  posted_date?: string;
  posted_time?: string;
  experience_level?: string;
  experience?: string;
  job_url?: string;
  job_source?: string;
}

interface ManualSearchPageProps {
  API_BASE_URL: string;
  onViewJob: (jobId: string, jobSource?: string, jobUrl?: string) => void;
  selectedJobs: SelectedJob[];
  onToggleAddToList: (job: SelectedJob) => void;
  onStartWorkflow?: (jobId: string) => void;
}

const formatPostedDate = (rawTime?: string): string => {
  if (!rawTime) return 'Recently posted';
  const val = rawTime.trim();
  if (val.toLowerCase().includes('ago')) return val;
  if (val.toLowerCase().includes('24h') || val.toLowerCase() === '1d') return '1 day ago';
  if (val.toLowerCase() === 'today' || val.toLowerCase() === 'just now') return 'Today';

  const numMatch = val.match(/^(\d+)\s*d(ays?)?$/i);
  if (numMatch) return `${numMatch[1]} day${numMatch[1] === '1' ? '' : 's'} ago`;

  const hourMatch = val.match(/^(\d+)\s*h(ours?)?$/i);
  if (hourMatch) return `${hourMatch[1]} hour${hourMatch[1] === '1' ? '' : 's'} ago`;

  const d = new Date(val);
  if (!isNaN(d.getTime())) {
    const diffMs = Date.now() - d.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays <= 0) return 'Today';
    if (diffDays === 1) return '1 day ago';
    return `${diffDays} days ago`;
  }
  return val;
};

export const ManualSearchPage: React.FC<ManualSearchPageProps> = ({
  API_BASE_URL,
  onViewJob,
  selectedJobs,
  onToggleAddToList,
  onStartWorkflow,
}) => {
  // Platform selection state (LinkedIn vs Naukri)
  const [platform, setPlatform] = useState<'linkedin' | 'naukri'>('linkedin');

  // Input parameters state
  const [keywords, setKeywords] = useState<string>('Software Engineer');
  const [location, setLocation] = useState<string>('Remote');
  const [experienceLevel, setExperienceLevel] = useState<string>('');
  const [postedWithin, setPostedWithin] = useState<string>('');
  const [pageNo, setPageNo] = useState<number>(1);
  const [limit, setLimit] = useState<number>(10);

  // Target Companies Multi-select State
  const [selectedTargetCompanies, setSelectedTargetCompanies] = useState<string[]>([]);
  const [showTargetCompanyDropdown, setShowTargetCompanyDropdown] = useState<boolean>(false);
  const [targetCompanySearchText, setTargetCompanySearchText] = useState<string>('');
  const targetCompanyDropdownRef = useRef<HTMLDivElement>(null);

  // Search Results State
  const [searchResults, setSearchResults] = useState<SearchJobItem[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState<boolean>(false);

  // Local Filter & Sort inside results
  const [resultQuery, setResultQuery] = useState<string>('');
  const [selectedCompany, setSelectedCompany] = useState<string>('All');
  const [companySearchText, setCompanySearchText] = useState<string>('');
  const [showCompanyDropdown, setShowCompanyDropdown] = useState<boolean>(false);
  const [sortBy, setSortBy] = useState<'newest' | 'title' | 'company'>('newest');

  const companyDropdownRef = useRef<HTMLDivElement>(null);

  // Switch default location when changing platform if location is default
  const handlePlatformChange = (newPlatform: 'linkedin' | 'naukri') => {
    setPlatform(newPlatform);
    if (newPlatform === 'naukri' && (location === 'Remote' || !location)) {
      setLocation('Bangalore');
    } else if (newPlatform === 'linkedin' && (location === 'Bangalore' || !location)) {
      setLocation('Remote');
    }
  };

  // Click outside to close target companies dropdown & result company dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (companyDropdownRef.current && !companyDropdownRef.current.contains(event.target as Node)) {
        setShowCompanyDropdown(false);
      }
      if (targetCompanyDropdownRef.current && !targetCompanyDropdownRef.current.contains(event.target as Node)) {
        setShowTargetCompanyDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleTargetCompany = (comp: string) => {
    setSelectedTargetCompanies((prev) =>
      prev.includes(comp) ? prev.filter((c) => c !== comp) : [...prev, comp]
    );
  };

  const handleSearchSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setLoading(true);
    setErrorMsg(null);
    setHasSearched(true);

    // Concatenate base keywords with selected target companies
    let finalKeywords = keywords.trim() || 'Software Engineer';
    if (selectedTargetCompanies.length > 0) {
      finalKeywords = `${finalKeywords} ${selectedTargetCompanies.join(', ')}`;
    }

    try {
      if (platform === 'naukri') {
        const payload = {
          keywords: finalKeywords,
          location: location.trim() || 'Bangalore',
          experience: experienceLevel,
          pageNo: pageNo,
          offset: 0,
          limit: limit,
        };

        const res = await fetch(`${API_BASE_URL}/api/naukri/search`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          const errorData = await res.json().catch(() => ({}));
          throw new Error(errorData.detail || `Server returned status ${res.status}`);
        }

        const data = await res.json();
        const naukriJobs = (data.jobs || []).map((j: any) => ({
          ...j,
          job_source: 'naukri',
        }));
        setSearchResults(naukriJobs);
      } else {
        const payload = {
          keywords: finalKeywords,
          locations: location.trim() || 'Remote',
          experience_level: experienceLevel,
          posted_within: postedWithin || null,
          offset: 0,
          limit: limit,
        };

        const res = await fetch(`${API_BASE_URL}/api/linkedin/search`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          const errorData = await res.json().catch(() => ({}));
          throw new Error(errorData.detail || `Server returned status ${res.status}`);
        }

        const data = await res.json();
        const linkedinJobs = (data.jobs || []).map((j: any) => ({
          ...j,
          job_source: 'linkedin',
        }));
        setSearchResults(linkedinJobs);
      }
    } catch (err: any) {
      console.error(`${platform === 'naukri' ? 'Naukri' : 'LinkedIn'} Manual Search error:`, err);
      setErrorMsg(err.message || `Failed to search jobs on ${platform === 'naukri' ? 'Naukri' : 'LinkedIn'}. Make sure the backend server is active.`);
    } finally {
      setLoading(false);
    }
  };

  // Run initial default search on mount
  useEffect(() => {
    handleSearchSubmit();
  }, []);

  const handleResetFilters = () => {
    setKeywords('Software Engineer');
    setLocation(platform === 'naukri' ? 'Bangalore' : 'Remote');
    setExperienceLevel('');
    setPostedWithin('');
    setPageNo(1);
    setLimit(10);
    setSelectedTargetCompanies([]);
    setResultQuery('');
    setSelectedCompany('All');
  };

  // Filter static companies by user search text
  const filteredTargetCompanies = STATIC_TARGET_COMPANIES.filter((comp) =>
    comp.toLowerCase().includes(targetCompanySearchText.toLowerCase())
  );

  // Compute unique company options from actual search results
  const allCompaniesList = Array.from(
    new Set(searchResults.map((j) => j.company_name).filter(Boolean))
  ).sort();

  const filteredCompanyOptions = allCompaniesList.filter((comp) =>
    comp.toLowerCase().includes(companySearchText.toLowerCase())
  );

  // Filter & sort search results in memory
  const filteredResults = searchResults
    .filter((j) => {
      const q = resultQuery.trim().toLowerCase();
      const matchesQuery =
        !q ||
        j.title.toLowerCase().includes(q) ||
        j.company_name.toLowerCase().includes(q) ||
        j.location.toLowerCase().includes(q) ||
        j.job_id.toLowerCase().includes(q);

      const matchesCompany = selectedCompany === 'All' || j.company_name === selectedCompany;

      return matchesQuery && matchesCompany;
    })
    .sort((a, b) => {
      if (sortBy === 'title') return a.title.localeCompare(b.title);
      if (sortBy === 'company') return a.company_name.localeCompare(b.company_name);
      return (b.posted_date || b.posted_time || '').localeCompare(a.posted_date || a.posted_time || '');
    });

  return (
    <div className="d-flex flex-column gap-4 p-4">
      {/* Header Banner */}
      <div className={`card-modern p-4 text-white border-0 shadow-sm ${platform === 'naukri' ? 'bg-gradient-danger' : 'bg-purple-gradient'}`} style={platform === 'naukri' ? { background: 'linear-gradient(135deg, #1e3c72 0%, #2a5298 50%, #e52d27 100%)' } : {}}>
        <div className="d-flex align-items-center justify-content-between flex-wrap gap-3">
          <div>
            <h4 className="fw-bold mb-1 d-flex align-items-center gap-2">
              <i className={`bi ${platform === 'naukri' ? 'bi-briefcase-fill text-warning' : 'bi-search text-warning'} fs-3`}></i>
              Manual {platform === 'naukri' ? 'Naukri.com' : 'LinkedIn'} Job Search
            </h4>
            <p className="mb-0 text-white-50 fs-7">
              Specify search criteria (keywords, target companies, location, experience level) to query live {platform === 'naukri' ? 'Naukri.com' : 'LinkedIn'} job postings.
            </p>
          </div>
          <div className="d-flex align-items-center gap-2">
            <span className="badge bg-white text-dark fs-7 fw-bold px-3 py-2 shadow-sm rounded-pill">
              <i className="bi bi-stack me-1"></i> {selectedJobs.length} Jobs in Selected List
            </span>
          </div>
        </div>
      </div>

      {/* Job Search Input Controls Card */}
      <div className="card-modern p-4">
        <form onSubmit={handleSearchSubmit}>
          <div className="row g-3">
            {/* Platform Selector Dropdown */}
            <div className="col-md-3">
              <label className="fs-8 fw-bold text-purple mb-1 d-block">
                <i className="bi bi-globe2 me-1 text-primary"></i> Job Platform / Source:
              </label>
              <select
                className="form-select fs-7 fw-bold border-purple-light"
                value={platform}
                onChange={(e) => handlePlatformChange(e.target.value as 'linkedin' | 'naukri')}
              >
                <option value="linkedin">LinkedIn Jobs</option>
                <option value="naukri">Naukri.com Jobs</option>
              </select>
            </div>

            {/* Keywords Input */}
            <div className="col-md-3">
              <label className="fs-8 fw-bold text-purple mb-1 d-block">
                <i className="bi bi-search me-1"></i> Job Keywords / Title:
              </label>
              <div className="input-group">
                <span className="input-group-text bg-light border-end-0">
                  <i className="bi bi-briefcase text-muted"></i>
                </span>
                <input
                  type="text"
                  className="form-control border-start-0 fs-7"
                  placeholder="e.g. Software Engineer, Python, React..."
                  value={keywords}
                  onChange={(e) => setKeywords(e.target.value)}
                  required
                />
              </div>
            </div>

            {/* Target Companies Multiselect Dropdown */}
            <div className="col-md-3 position-relative" ref={targetCompanyDropdownRef}>
              <label className="fs-8 fw-bold text-purple mb-1 d-block">
                <i className="bi bi-building-add me-1 text-success"></i> Target Companies (Optional):
              </label>
              <button
                type="button"
                onClick={() => setShowTargetCompanyDropdown(!showTargetCompanyDropdown)}
                className="btn btn-outline-purple btn-sm w-100 fs-7 d-flex align-items-center justify-content-between text-truncate bg-white"
                style={{ height: '38px' }}
              >
                <span className="text-truncate d-flex align-items-center gap-1">
                  <i className="bi bi-buildings text-purple"></i>
                  <span className="fw-semibold text-dark">
                    {selectedTargetCompanies.length === 0
                      ? 'All Companies'
                      : `${selectedTargetCompanies.length} Selected`}
                  </span>
                </span>
                <i className={`bi bi-chevron-${showTargetCompanyDropdown ? 'up' : 'down'}`}></i>
              </button>

              {showTargetCompanyDropdown && (
                <div
                  className="position-absolute top-100 start-0 w-100 mt-1 p-2 bg-white border shadow-lg rounded-3"
                  style={{ zIndex: 1060, maxHeight: '280px', display: 'flex', flexDirection: 'column' }}
                >
                  <div className="p-1 mb-2 border-bottom">
                    <div className="input-group input-group-sm">
                      <span className="input-group-text bg-light border-end-0">
                        <i className="bi bi-search text-muted"></i>
                      </span>
                      <input
                        type="text"
                        className="form-control border-start-0 fs-7"
                        placeholder="Search target company..."
                        value={targetCompanySearchText}
                        onChange={(e) => setTargetCompanySearchText(e.target.value)}
                        autoFocus
                      />
                    </div>
                    <div className="d-flex justify-content-between align-items-center pt-2 px-1">
                      <button
                        type="button"
                        className="btn btn-link p-0 fs-8 text-purple text-decoration-none fw-bold"
                        onClick={() => setSelectedTargetCompanies([...STATIC_TARGET_COMPANIES])}
                      >
                        Select All
                      </button>
                      <button
                        type="button"
                        className="btn btn-link p-0 fs-8 text-danger text-decoration-none fw-bold"
                        onClick={() => setSelectedTargetCompanies([])}
                      >
                        Clear All
                      </button>
                    </div>
                  </div>

                  <div className="overflow-auto flex-grow-1 d-flex flex-column gap-1">
                    {filteredTargetCompanies.map((comp) => {
                      const isSelected = selectedTargetCompanies.includes(comp);
                      return (
                        <label
                          key={comp}
                          className={`p-2 rounded cursor-pointer fs-7 d-flex align-items-center gap-2 m-0 ${
                            isSelected ? 'bg-purple-subtle text-purple fw-bold' : 'hover-bg-light text-dark'
                          }`}
                          onClick={(e) => {
                            e.preventDefault();
                            toggleTargetCompany(comp);
                          }}
                        >
                          <input
                            type="checkbox"
                            className="form-check-input mt-0 cursor-pointer"
                            checked={isSelected}
                            onChange={() => {}}
                          />
                          <span className="text-truncate">{comp}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Location Input */}
            <div className="col-md-3">
              <label className="fs-8 fw-bold text-purple mb-1 d-block">
                <i className="bi bi-geo-alt-fill me-1 text-danger"></i> Location:
              </label>
              <div className="input-group">
                <span className="input-group-text bg-light border-end-0">
                  <i className="bi bi-pin-map text-muted"></i>
                </span>
                <input
                  type="text"
                  className="form-control border-start-0 fs-7"
                  placeholder={platform === 'naukri' ? 'e.g. Bangalore, Delhi, Remote...' : 'e.g. Remote, San Francisco, India...'}
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                />
              </div>
            </div>

            {/* Selected Company Chips Row */}
            {selectedTargetCompanies.length > 0 && (
              <div className="col-12 d-flex flex-wrap align-items-center gap-1">
                <span className="fs-8 text-muted me-1 fw-bold">Target Companies Concatenated:</span>
                {selectedTargetCompanies.map((comp) => (
                  <span key={comp} className="badge bg-purple-subtle text-purple border border-purple-light fs-8 d-inline-flex align-items-center gap-1">
                    {comp}
                    <i
                      className="bi bi-x-circle-fill cursor-pointer text-purple hover-text-danger ms-1"
                      onClick={() => toggleTargetCompany(comp)}
                      title={`Remove ${comp}`}
                    ></i>
                  </span>
                ))}
              </div>
            )}

            {/* Experience Level Dropdown */}
            <div className="col-md-3">
              <label className="fs-8 fw-bold text-purple mb-1 d-block">
                <i className="bi bi-award-fill me-1 text-warning"></i> Experience Level:
              </label>
              {platform === 'naukri' ? (
                <select
                  className="form-select fs-7"
                  value={experienceLevel}
                  onChange={(e) => setExperienceLevel(e.target.value)}
                >
                  <option value="">Any Experience</option>
                  <option value="0">Fresher / 0 Years</option>
                  <option value="1">1 Year</option>
                  <option value="2">2 Years</option>
                  <option value="3">3 Years</option>
                  <option value="5">5 Years</option>
                  <option value="8">8 Years</option>
                  <option value="10">10+ Years</option>
                </select>
              ) : (
                <select
                  className="form-select fs-7"
                  value={experienceLevel}
                  onChange={(e) => setExperienceLevel(e.target.value)}
                >
                  <option value="">All Experience Levels</option>
                  <option value="Internship">Internship</option>
                  <option value="Entry level">Entry Level</option>
                  <option value="Associate">Associate</option>
                  <option value="Mid-Senior level">Mid-Senior Level</option>
                  <option value="Director">Director</option>
                  <option value="Executive">Executive</option>
                </select>
              )}
            </div>

            {/* Platform specific controls: Posted Within (LinkedIn) vs Page No (Naukri) */}
            {platform === 'linkedin' ? (
              <div className="col-md-3">
                <label className="fs-8 fw-bold text-purple mb-1 d-block">
                  <i className="bi bi-clock-history me-1 text-info"></i> Posted Within:
                </label>
                <select
                  className="form-select fs-7"
                  value={postedWithin}
                  onChange={(e) => setPostedWithin(e.target.value)}
                >
                  <option value="">Any Time</option>
                  <option value="24h">Past 24 Hours</option>
                  <option value="1d">Past 1 Day</option>
                  <option value="7d">Past Week (7d)</option>
                  <option value="30d">Past Month (30d)</option>
                </select>
              </div>
            ) : (
              <div className="col-md-3">
                <label className="fs-8 fw-bold text-purple mb-1 d-block">
                  <i className="bi bi-file-earmark-text me-1 text-info"></i> Page Number:
                </label>
                <select
                  className="form-select fs-7"
                  value={pageNo}
                  onChange={(e) => setPageNo(Number(e.target.value))}
                >
                  <option value={1}>Page 1</option>
                  <option value={2}>Page 2</option>
                  <option value={3}>Page 3</option>
                  <option value={4}>Page 4</option>
                  <option value={5}>Page 5</option>
                </select>
              </div>
            )}

            {/* Limit & Action Buttons Row */}
            <div className="col-12 pt-2 border-top d-flex align-items-center justify-content-between flex-wrap gap-2">
              <div className="d-flex align-items-center gap-2">
                <label className="fs-8 fw-bold text-muted text-nowrap">Results Limit:</label>
                <select
                  className="form-select form-select-sm fs-8 style-sm"
                  style={{ width: '100px' }}
                  value={limit}
                  onChange={(e) => setLimit(Number(e.target.value))}
                >
                  <option value={10}>10 jobs</option>
                  <option value={20}>20 jobs</option>
                  <option value={30}>30 jobs</option>
                  <option value={50}>50 jobs</option>
                </select>
              </div>

              <div className="d-flex align-items-center gap-2">
                <button
                  type="button"
                  onClick={handleResetFilters}
                  className="btn btn-sm btn-outline-secondary px-3"
                  disabled={loading}
                >
                  <i className="bi bi-x-circle me-1"></i> Reset
                </button>
                <button
                  type="submit"
                  className={`btn px-4 fw-bold shadow-sm d-flex align-items-center gap-2 ${platform === 'naukri' ? 'btn-danger' : 'btn-purple'}`}
                  disabled={loading}
                >
                  {loading ? (
                    <>
                      <span className="spinner-border spinner-border-sm" role="status"></span>
                      <span>Searching {platform === 'naukri' ? 'Naukri' : 'LinkedIn'}...</span>
                    </>
                  ) : (
                    <>
                      <i className="bi bi-search"></i>
                      <span>Search Jobs</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </form>
      </div>

      {/* Error Alert */}
      {errorMsg && (
        <div className="alert alert-danger border-danger-subtle d-flex align-items-center justify-content-between">
          <div className="d-flex align-items-center gap-2">
            <i className="bi bi-exclamation-triangle-fill fs-5 text-danger"></i>
            <span className="fs-7 font-semibold">{errorMsg}</span>
          </div>
          <button className="btn-close" onClick={() => setErrorMsg(null)}></button>
        </div>
      )}

      {/* Results Header & In-Memory Filters Bar */}
      {hasSearched && !loading && searchResults.length > 0 && (
        <div className="card-modern p-4">
          <div className="row g-3 align-items-center">
            <div className="col-md-4">
              <label className="fs-8 fw-bold text-muted mb-1 d-block">Filter Results:</label>
              <div className="input-group input-group-sm">
                <span className="input-group-text bg-light border-end-0">
                  <i className="bi bi-funnel text-muted"></i>
                </span>
                <input
                  type="text"
                  className="form-control border-start-0 fs-7"
                  placeholder="Title, company, location, or Job ID..."
                  value={resultQuery}
                  onChange={(e) => setResultQuery(e.target.value)}
                />
              </div>
            </div>

            {/* Searchable Company Dropdown */}
            <div className="col-md-4 position-relative" ref={companyDropdownRef}>
              <label className="fs-8 fw-bold text-muted mb-1 d-block">Filter Company:</label>
              <button
                type="button"
                onClick={() => {
                  setShowCompanyDropdown(!showCompanyDropdown);
                  if (!showCompanyDropdown) setCompanySearchText('');
                }}
                className="btn btn-outline-purple btn-sm w-100 fs-7 d-flex align-items-center justify-content-between text-truncate bg-white"
                style={{ height: '34px' }}
              >
                <span className="text-truncate d-flex align-items-center gap-2">
                  <i className="bi bi-building text-purple"></i>
                  <span className="fw-semibold text-dark">
                    {selectedCompany === 'All' ? 'All Companies' : selectedCompany}
                  </span>
                </span>
                <span className="d-flex align-items-center gap-1">
                  {selectedCompany !== 'All' && (
                    <i
                      className="bi bi-x-circle-fill text-muted hover-text-danger me-1 fs-8"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedCompany('All');
                      }}
                      title="Clear selected company"
                    />
                  )}
                  <i className={`bi bi-chevron-${showCompanyDropdown ? 'up' : 'down'}`}></i>
                </span>
              </button>

              {showCompanyDropdown && (
                <div
                  className="position-absolute top-100 start-0 w-100 mt-1 p-2 bg-white border shadow-lg rounded-3"
                  style={{ zIndex: 1050, maxHeight: '250px', display: 'flex', flexDirection: 'column' }}
                >
                  <div className="p-1 mb-2 border-bottom">
                    <div className="input-group input-group-sm">
                      <span className="input-group-text bg-light border-end-0">
                        <i className="bi bi-search text-muted"></i>
                      </span>
                      <input
                        type="text"
                        className="form-control border-start-0 fs-7"
                        placeholder="Search company..."
                        value={companySearchText}
                        onChange={(e) => setCompanySearchText(e.target.value)}
                        autoFocus
                      />
                    </div>
                  </div>

                  <div className="overflow-auto flex-grow-1 d-flex flex-column gap-1">
                    <div
                      onClick={() => {
                        setSelectedCompany('All');
                        setShowCompanyDropdown(false);
                      }}
                      className={`p-2 rounded cursor-pointer fs-7 d-flex justify-content-between align-items-center ${
                        selectedCompany === 'All' ? 'bg-purple text-white fw-bold' : 'hover-bg-light text-dark'
                      }`}
                    >
                      <span>All Companies</span>
                      <span className={`badge ${selectedCompany === 'All' ? 'bg-white text-purple' : 'bg-light text-muted'}`}>
                        {searchResults.length}
                      </span>
                    </div>

                    {filteredCompanyOptions.map((comp) => {
                      const count = searchResults.filter((j) => j.company_name === comp).length;
                      const isSelected = selectedCompany === comp;
                      return (
                        <div
                          key={comp}
                          onClick={() => {
                            setSelectedCompany(comp);
                            setShowCompanyDropdown(false);
                          }}
                          className={`p-2 rounded cursor-pointer fs-7 d-flex justify-content-between align-items-center ${
                            isSelected ? 'bg-purple text-white fw-bold' : 'hover-bg-light text-dark'
                          }`}
                        >
                          <span className="text-truncate">{comp}</span>
                          <span className={`badge ${isSelected ? 'bg-white text-purple' : 'bg-light text-muted'}`}>
                            {count}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Sort Dropdown */}
            <div className="col-md-4">
              <label className="fs-8 fw-bold text-muted mb-1 d-block">Sort By:</label>
              <select
                className="form-select form-select-sm fs-7"
                value={sortBy}
                onChange={(e: any) => setSortBy(e.target.value)}
              >
                <option value="newest">Posted Date (Newest)</option>
                <option value="title">Title (A-Z)</option>
                <option value="company">Company (A-Z)</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Grid Results Section */}
      {loading ? (
        <div className="text-center py-5">
          <div className={`spinner-border ${platform === 'naukri' ? 'text-danger' : 'text-purple'} mb-3`} role="status" style={{ width: '3.5rem', height: '3.5rem' }}></div>
          <h6 className="fw-bold text-dark mb-1">Querying {platform === 'naukri' ? 'Naukri.com' : 'LinkedIn'} Search Engine...</h6>
          <p className="text-muted fs-7">Fetching real-time job cards matching keywords.</p>
        </div>
      ) : filteredResults.length === 0 ? (
        <div className="card-modern p-5 text-center">
          <i className="bi bi-search-heart fs-1 text-muted mb-3 d-block"></i>
          <h5 className="fw-bold text-dark">
            {hasSearched ? `No matching ${platform === 'naukri' ? 'Naukri' : 'LinkedIn'} jobs found` : `Ready to search ${platform === 'naukri' ? 'Naukri' : 'LinkedIn'}`}
          </h5>
          <p className="text-muted fs-7 mb-3">
            {hasSearched
              ? 'Try modifying your search keywords, broadening location, or clearing experience level filters.'
              : 'Enter job keywords and click "Search Jobs" to retrieve active listings.'}
          </p>
          {hasSearched && (
            <button onClick={handleResetFilters} className={`btn ${platform === 'naukri' ? 'btn-danger' : 'btn-purple'} btn-sm fw-bold`}>
              Reset Search Criteria
            </button>
          )}
        </div>
      ) : (
        <div className="d-flex flex-column gap-3">
          <div className="d-flex align-items-center justify-content-between px-1">
            <span className="fs-7 fw-bold text-muted">
              Showing <strong className={platform === 'naukri' ? 'text-danger' : 'text-purple'}>{filteredResults.length}</strong> of {searchResults.length} {platform === 'naukri' ? 'Naukri.com' : 'LinkedIn'} job postings
            </span>
          </div>

          <div className="row g-4">
            {filteredResults.map((job) => {
              const isAdded = selectedJobs.some((j) => j.jobId === String(job.job_id));

              return (
                <div key={job.job_id} className="col-md-6 col-lg-4">
                  <div className="card-modern p-4 h-100 d-flex flex-column justify-content-between shadow-sm hover-shadow transition">
                    <div>
                      {/* Job ID, Platform & Posted Badge Header */}
                      <div className="d-flex align-items-center justify-content-between mb-2">
                        <div className="d-flex align-items-center gap-1">
                          {job.job_source === 'naukri' ? (
                            <span className="badge bg-danger text-white font-monospace">
                              <i className="bi bi-briefcase-fill me-1"></i> Naukri
                            </span>
                          ) : (
                            <span className="badge bg-primary text-white font-monospace">
                              <i className="bi bi-linkedin me-1"></i> LinkedIn
                            </span>
                          )}
                          <span className="badge badge-purple font-monospace">ID: {job.job_id}</span>
                        </div>
                        <span className="badge bg-light text-purple border border-purple-light fs-8">
                          <i className="bi bi-clock-history me-1"></i>
                          {formatPostedDate(job.posted_date || job.posted_time)}
                        </span>
                      </div>

                      {/* Job Title */}
                      <h6 className="fw-bold text-dark mb-1 text-truncate" title={job.title}>
                        {job.title}
                      </h6>

                      {/* Company Name */}
                      <p className="text-muted fs-7 mb-2 text-truncate">
                        <i className="bi bi-building me-1 text-purple"></i>
                        <strong>{job.company_name || 'Employer'}</strong>
                      </p>

                      {/* Location & Experience Badges */}
                      <div className="d-flex flex-wrap gap-2 mb-3">
                        <span className="badge bg-light text-dark border fs-8 text-truncate" style={{ maxWidth: '100%' }}>
                          <i className="bi bi-geo-alt-fill text-danger me-1"></i>
                          {job.location || 'Location Not Specified'}
                        </span>
                        {(job.experience || job.experience_level || experienceLevel) && (
                          <span className="badge badge-warning-subtle fs-8">
                            <i className="bi bi-award-fill me-1"></i> {job.experience || job.experience_level || experienceLevel}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Actions Row (Read Description, Add to List, Process ATS) */}
                    <div className="pt-3 border-top d-flex flex-column gap-2">
                      <div className="d-flex gap-2">
                        {/* Read Description Button */}
                        <button
                          onClick={() => onViewJob(job.job_id, job.job_source || platform, job.job_url)}
                          className={`btn btn-sm ${job.job_source === 'naukri' ? 'btn-danger' : 'btn-purple'} flex-grow-1 font-semibold d-flex align-items-center justify-content-center gap-1`}
                        >
                          <i className="bi bi-eye-fill"></i>
                          <span>Read Description</span>
                        </button>

                        {/* Direct Link */}
                        {job.job_url && (
                          <a
                            href={job.job_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn btn-sm btn-outline-purple"
                            title={`View on ${job.job_source === 'naukri' ? 'Naukri' : 'LinkedIn'}`}
                          >
                            <i className="bi bi-box-arrow-up-right"></i>
                          </a>
                        )}
                      </div>

                      <div className="d-flex gap-2">
                        {/* Add to Selected Jobs List Toggle Button */}
                        <button
                          onClick={() =>
                            onToggleAddToList({
                              jobId: String(job.job_id),
                              title: job.title,
                              company: job.company_name,
                              location: job.location,
                            })
                          }
                          className={`btn btn-sm flex-grow-1 font-semibold d-flex align-items-center justify-content-center gap-1 ${
                            isAdded ? 'btn-success text-white' : 'btn-outline-purple'
                          }`}
                        >
                          <i className={`bi ${isAdded ? 'bi-check-circle-fill' : 'bi-plus-circle'}`}></i>
                          <span>{isAdded ? 'In List' : 'Add to List'}</span>
                        </button>

                        {/* Process ATS Workflow Button */}
                        {onStartWorkflow && (
                          <button
                            onClick={() => onStartWorkflow(String(job.job_id))}
                            className="btn btn-sm btn-purple-subtle text-purple border border-purple-light font-semibold d-flex align-items-center justify-content-center gap-1"
                            title="Process job through ATS Workflow"
                          >
                            <i className="bi bi-gear-wide-connected"></i>
                            <span>Process</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default ManualSearchPage;
