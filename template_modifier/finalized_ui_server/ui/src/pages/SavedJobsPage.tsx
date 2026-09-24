import React, { useState, useEffect, useRef } from 'react';

interface SavedJob {
  job_id: string;
  title: string;
  company_name: string;
  location: string;
  posted_time: string;
  num_applicants?: string;
  seniority_level?: string;
  employment_type?: string;
  job_function?: string;
  job_url?: string;
  minimal_description?: string;
  raw_description?: string;
  skills_required?: string[];
  created_at?: string;
}

interface SavedJobsPageProps {
  API_BASE_URL: string;
  onViewJob: (jobId: string) => void;
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

// Convert posted_time to relative numeric days for sorting
const parsePostedTimeDays = (rawTime?: string): number => {
  if (!rawTime) return 9999;
  const val = rawTime.trim().toLowerCase();
  if (val.includes('today') || val.includes('just now') || val.includes('minute')) return 0;
  if (val.includes('24h') || val.includes('1d') || val.includes('1 day')) return 1;

  const dayMatch = val.match(/(\d+)\s*d(ay|ays)?/);
  if (dayMatch) return parseInt(dayMatch[1], 10);

  const hourMatch = val.match(/(\d+)\s*h(our|ours)?/);
  if (hourMatch) return parseInt(hourMatch[1], 10) / 24;

  const monthMatch = val.match(/(\d+)\s*m(onth|onths)?/);
  if (monthMatch) return parseInt(monthMatch[1], 10) * 30;

  const d = new Date(rawTime);
  if (!isNaN(d.getTime())) {
    const diffDays = (Date.now() - d.getTime()) / (1000 * 60 * 60 * 24);
    return Math.max(0, diffDays);
  }
  return 999;
};

export const SavedJobsPage: React.FC<SavedJobsPageProps> = ({ API_BASE_URL, onViewJob }) => {
  const [savedJobs, setSavedJobs] = useState<SavedJob[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedCompany, setSelectedCompany] = useState<string>('All');
  const [companySearchText, setCompanySearchText] = useState<string>('');
  const [showCompanyDropdown, setShowCompanyDropdown] = useState<boolean>(false);
  const [showSeeMoreFilters, setShowSeeMoreFilters] = useState<boolean>(false);
  const [excludedCompanies, setExcludedCompanies] = useState<string>('');
  const [experienceFilter, setExperienceFilter] = useState<string>('All');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'posted-newest' | 'posted-oldest' | 'title' | 'company'>('newest');

  const dropdownRef = useRef<HTMLDivElement>(null);

  const fetchSavedJobs = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/linkedin/jobs/saved`);
      if (res.ok) {
        const data = await res.json();
        setSavedJobs(data.jobs || []);
      }
    } catch (err) {
      console.error("Failed to fetch saved jobs:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSavedJobs();
  }, [API_BASE_URL]);

  // Click outside to close searchable company dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowCompanyDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Compute unique list of companies with counts
  const allCompaniesList = Array.from(new Set(savedJobs.map(j => j.company_name).filter(Boolean))).sort();
  
  const filteredCompanyOptions = allCompaniesList.filter(comp =>
    comp.toLowerCase().includes(companySearchText.toLowerCase())
  );

  // Filter & Sort Logic
  const filteredJobs = savedJobs.filter(j => {
    const query = searchQuery.toLowerCase();
    const matchesQuery = !query ||
      j.title.toLowerCase().includes(query) ||
      j.company_name.toLowerCase().includes(query) ||
      j.job_id.includes(query) ||
      (j.skills_required && j.skills_required.some(s => s.toLowerCase().includes(query)));

    // Selected Company Filter
    const matchesSelectedCompany = selectedCompany === 'All' || j.company_name === selectedCompany;

    // Exclude Companies Filter
    const excludedList = excludedCompanies
      .split(',')
      .map(c => c.trim().toLowerCase())
      .filter(Boolean);

    const matchesExcluded = excludedList.length > 0 && excludedList.some(exc =>
      j.company_name.toLowerCase().includes(exc)
    );

    if (matchesExcluded) {
      return false;
    }

    const matchesExperience = experienceFilter === 'All' ||
      (j.seniority_level && j.seniority_level.toLowerCase().includes(experienceFilter.toLowerCase()));

    return matchesQuery && matchesSelectedCompany && matchesExperience;
  }).sort((a, b) => {
    if (sortBy === 'oldest') {
      return (a.created_at || '').localeCompare(b.created_at || '');
    }
    if (sortBy === 'posted-newest') {
      return parsePostedTimeDays(a.posted_time) - parsePostedTimeDays(b.posted_time);
    }
    if (sortBy === 'posted-oldest') {
      return parsePostedTimeDays(b.posted_time) - parsePostedTimeDays(a.posted_time);
    }
    if (sortBy === 'title') {
      return a.title.localeCompare(b.title);
    }
    if (sortBy === 'company') {
      return a.company_name.localeCompare(b.company_name);
    }
    // Default 'newest' (Saved Newest First)
    return (b.created_at || '').localeCompare(a.created_at || '');
  });

  return (
    <div className="d-flex flex-column gap-4 p-4">
      {/* Header Banner */}
      <div className="card-modern p-4 bg-purple-gradient text-white border-0 shadow-sm">
        <div className="d-flex align-items-center justify-content-between flex-wrap gap-3">
          <div>
            <h4 className="fw-bold mb-1">
              <i className="bi bi-bookmark-star-fill me-2 text-warning"></i> Browse Saved LinkedIn Jobs
            </h4>
            <p className="mb-0 text-white-50 fs-7">
              Filter, search, inspect full descriptions, and manage saved jobs in your database.
            </p>
          </div>
          <button onClick={fetchSavedJobs} className="btn btn-light text-purple fw-bold shadow-sm d-flex align-items-center gap-2">
            <i className={`bi bi-arrow-clockwise ${loading ? 'spin' : ''}`}></i>
            <span>Refresh Saved List</span>
          </button>
        </div>
      </div>

      {/* Filter & Search Controls Bar */}
      <div className="card-modern p-4">
        <div className="row g-3 align-items-end">
          {/* Search Box */}
          <div className="col-md-4">
            <label className="fs-8 fw-bold text-muted mb-1 d-block">Search Jobs:</label>
            <div className="input-group">
              <span className="input-group-text bg-light border-end-0">
                <i className="bi bi-search text-muted"></i>
              </span>
              <input
                type="text"
                className="form-control border-start-0 fs-7"
                placeholder="Title, company, skills, or Job ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          {/* Searchable Company Dropdown */}
          <div className="col-md-3 position-relative" ref={dropdownRef}>
            <label className="fs-8 fw-bold text-muted mb-1 d-block">Filter Company:</label>
            <button
              type="button"
              onClick={() => {
                setShowCompanyDropdown(!showCompanyDropdown);
                if (!showCompanyDropdown) setCompanySearchText('');
              }}
              className="btn btn-outline-purple w-100 fs-7 d-flex align-items-center justify-content-between text-truncate bg-white"
              style={{ height: '38px' }}
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

            {/* Custom Searchable Dropdown Popup */}
            {showCompanyDropdown && (
              <div
                className="position-absolute top-100 start-0 w-100 mt-1 p-2 bg-white border shadow-lg rounded-3"
                style={{ zIndex: 1050, maxHeight: '280px', display: 'flex', flexDirection: 'column' }}
              >
                <div className="p-1 mb-2 border-bottom">
                  <div className="input-group input-group-sm">
                    <span className="input-group-text bg-light border-end-0">
                      <i className="bi bi-search text-muted"></i>
                    </span>
                    <input
                      type="text"
                      className="form-control border-start-0 fs-7"
                      placeholder="Type to filter company list..."
                      value={companySearchText}
                      onChange={(e) => setCompanySearchText(e.target.value)}
                      autoFocus
                    />
                    {companySearchText && (
                      <button
                        className="btn btn-outline-secondary btn-sm"
                        type="button"
                        onClick={() => setCompanySearchText('')}
                      >
                        <i className="bi bi-x"></i>
                      </button>
                    )}
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
                    <span className="d-flex align-items-center gap-2">
                      {selectedCompany === 'All' && <i className="bi bi-check2"></i>}
                      All Companies
                    </span>
                    <span className={`badge ${selectedCompany === 'All' ? 'bg-white text-purple' : 'bg-light text-muted'}`}>
                      {savedJobs.length}
                    </span>
                  </div>

                  {filteredCompanyOptions.map((comp) => {
                    const count = savedJobs.filter(j => j.company_name === comp).length;
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
                        <span className="text-truncate d-flex align-items-center gap-2" style={{ maxWidth: '180px' }}>
                          {isSelected && <i className="bi bi-check2"></i>}
                          {comp}
                        </span>
                        <span className={`badge ${isSelected ? 'bg-white text-purple' : 'bg-light text-muted'}`}>
                          {count}
                        </span>
                      </div>
                    );
                  })}

                  {filteredCompanyOptions.length === 0 && (
                    <div className="p-2 text-center text-muted fs-8">No companies match "{companySearchText}"</div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Experience Filter */}
          <div className="col-md-2">
            <label className="fs-8 fw-bold text-muted mb-1 d-block">Experience:</label>
            <select
              className="form-select fs-7"
              value={experienceFilter}
              onChange={(e) => setExperienceFilter(e.target.value)}
            >
              <option value="All">All Levels</option>
              <option value="Entry">Entry Level</option>
              <option value="Mid">Mid-Senior Level</option>
              <option value="Executive">Executive / Lead</option>
            </select>
          </div>

          {/* Sort By Dropdown & See More Toggle */}
          <div className="col-md-3">
            <div className="d-flex align-items-center justify-content-between gap-2">
              <div className="flex-grow-1">
                <label className="fs-8 fw-bold text-muted mb-1 d-block">Sort By:</label>
                <select
                  className="form-select fs-7"
                  value={sortBy}
                  onChange={(e: any) => setSortBy(e.target.value)}
                >
                  <option value="newest">Newest Saved</option>
                  <option value="oldest">Oldest Saved</option>
                  <option value="posted-newest">Posted Date (Newest)</option>
                  <option value="posted-oldest">Posted Date (Oldest)</option>
                  <option value="title">Title (A-Z)</option>
                  <option value="company">Company (A-Z)</option>
                </select>
              </div>

              {/* See More Filters Toggle Button */}
              <div className="pt-4">
                <button
                  type="button"
                  onClick={() => setShowSeeMoreFilters(!showSeeMoreFilters)}
                  className={`btn btn-sm ${showSeeMoreFilters ? 'btn-purple' : 'btn-outline-purple'} text-nowrap d-flex align-items-center gap-1`}
                  style={{ height: '38px' }}
                  title="Toggle Advanced Filters"
                >
                  <i className="bi bi-sliders"></i>
                  <span>{showSeeMoreFilters ? 'Hide More' : 'See More'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* See More Advanced Filters Panel (Contains Exclude Companies) */}
        {showSeeMoreFilters && (
          <div className="mt-4 pt-3 border-top bg-light p-3 rounded-3">
            <div className="row g-3 align-items-center">
              {/* Exclude Companies Input */}
              <div className="col-md-6">
                <label className="fs-8 fw-bold text-danger mb-1 d-block">
                  <i className="bi bi-slash-circle me-1"></i> Exclude Companies:
                </label>
                <div className="input-group">
                  <span className="input-group-text bg-white border-end-0">
                    <i className="bi bi-x-circle text-danger"></i>
                  </span>
                  <input
                    type="text"
                    className="form-control border-start-0 fs-7"
                    placeholder="Exclude company names (comma-separated, e.g. Meta, Amazon)..."
                    value={excludedCompanies}
                    onChange={(e) => setExcludedCompanies(e.target.value)}
                  />
                </div>
              </div>

              {/* Clear Advanced Filters Button */}
              <div className="col-md-6 text-md-end pt-3">
                {(excludedCompanies || selectedCompany !== 'All' || searchQuery || experienceFilter !== 'All') && (
                  <button
                    onClick={() => {
                      setExcludedCompanies('');
                      setSelectedCompany('All');
                      setSearchQuery('');
                      setExperienceFilter('All');
                    }}
                    className="btn btn-sm btn-outline-secondary"
                  >
                    <i className="bi bi-x-lg me-1"></i> Reset All Filters
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Active Filter Badges */}
      {(selectedCompany !== 'All' || excludedCompanies.trim()) && (
        <div className="d-flex flex-wrap align-items-center gap-2 px-1">
          <span className="fs-8 text-muted fw-bold">Active Filters:</span>
          {selectedCompany !== 'All' && (
            <span className="badge bg-purple-subtle text-purple border border-purple-light fs-8 d-inline-flex align-items-center gap-1">
              <i className="bi bi-building"></i>
              <span>Company: {selectedCompany}</span>
              <button
                onClick={() => setSelectedCompany('All')}
                className="btn-close btn-close-sm ms-1"
                style={{ fontSize: '0.65rem' }}
              ></button>
            </span>
          )}
          {excludedCompanies.trim() && (
            <span className="badge bg-danger-subtle text-danger border border-danger-subtle fs-8 d-inline-flex align-items-center gap-1">
              <i className="bi bi-slash-circle"></i>
              <span>Excluding: {excludedCompanies}</span>
              <button
                onClick={() => setExcludedCompanies('')}
                className="btn-close btn-close-sm ms-1"
                style={{ fontSize: '0.65rem' }}
              ></button>
            </span>
          )}
        </div>
      )}

      {/* Job Cards Grid */}
      {loading ? (
        <div className="text-center py-5">
          <div className="spinner-border text-purple mb-3" role="status" style={{ width: '3rem', height: '3rem' }}></div>
          <p className="text-muted fw-bold">Loading saved jobs from MySQL database...</p>
        </div>
      ) : filteredJobs.length === 0 ? (
        <div className="card-modern p-5 text-center">
          <i className="bi bi-folder-x fs-1 text-muted mb-3 d-block"></i>
          <h5 className="fw-bold text-dark">No saved jobs match your filters</h5>
          <p className="text-muted fs-7 mb-0">
            {selectedCompany !== 'All'
              ? `No jobs found for selected company "${selectedCompany}".`
              : excludedCompanies
              ? `Some jobs were hidden because they matched excluded company "${excludedCompanies}".`
              : 'Try clearing your search query or adjusting experience filters.'}
          </p>
        </div>
      ) : (
        <div className="row g-4">
          {filteredJobs.map((job) => (
            <div key={job.job_id} className="col-md-6 col-lg-4">
              <div className="card-modern p-4 h-100 d-flex flex-column justify-content-between shadow-sm hover-shadow transition">
                <div>
                  {/* Job ID & Date Header */}
                  <div className="d-flex align-items-center justify-content-between mb-2">
                    <span className="badge badge-purple font-monospace">Job ID: {job.job_id}</span>
                    <span className="badge bg-light text-purple border border-purple-light fs-8">
                      <i className="bi bi-clock-history me-1"></i>
                      {formatPostedDate(job.posted_time)}
                    </span>
                  </div>

                  {/* Title & Company */}
                  <h6 className="fw-bold text-dark mb-1 text-truncate" title={job.title}>
                    {job.title}
                  </h6>
                  <p className="text-muted fs-7 mb-3 text-truncate">
                    <i className="bi bi-building me-1 text-purple"></i>
                    <strong>{job.company_name || 'LinkedIn Posting'}</strong>
                  </p>

                  {/* Metadata Badges */}
                  <div className="d-flex flex-wrap gap-2 mb-3">
                    <span className="badge badge-warning-subtle fs-8">
                      <i className="bi bi-award-fill me-1"></i> {job.seniority_level || 'Mid-Senior'}
                    </span>
                    {job.num_applicants && (
                      <span className="badge badge-success-subtle fs-8">
                        <i className="bi bi-people-fill me-1"></i> {job.num_applicants}
                      </span>
                    )}
                  </div>

                  {/* Skills Tags */}
                  {job.skills_required && Array.isArray(job.skills_required) && job.skills_required.length > 0 && (
                    <div className="mb-3">
                      <small className="text-muted fw-bold d-block mb-1 fs-9">KEY SKILLS:</small>
                      <div className="d-flex flex-wrap gap-1" style={{ maxHeight: '60px', overflow: 'hidden' }}>
                        {job.skills_required.slice(0, 4).map((sk, idx) => (
                          <span key={idx} className="badge bg-light text-purple border border-purple-light fs-9">
                            {sk}
                          </span>
                        ))}
                        {job.skills_required.length > 4 && (
                          <span className="badge bg-purple-subtle text-purple fs-9">
                            +{job.skills_required.length - 4} more
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="pt-3 border-top d-flex gap-2">
                  <button
                    onClick={() => onViewJob(job.job_id)}
                    className="btn btn-sm btn-purple flex-grow-1 font-semibold d-flex align-items-center justify-content-center gap-1"
                  >
                    <i className="bi bi-eye-fill"></i>
                    <span>Read Description</span>
                  </button>
                  {job.job_url && (
                    <a
                      href={job.job_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-sm btn-outline-purple"
                      title="View on LinkedIn"
                    >
                      <i className="bi bi-box-arrow-up-right"></i>
                    </a>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

