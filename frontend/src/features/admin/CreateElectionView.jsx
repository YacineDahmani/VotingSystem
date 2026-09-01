import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowUpRight,
  Check,
  Clock,
  Copy,
  FileText,
  Plus,
  Trash2,
  UploadCloud,
  Users,
} from 'lucide-react';
import { createElection, updateElectionStatus } from '../../lib/api';
import { useToast } from '../../components/ui/useToast';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import { getSession, isAdminSession } from '../../store/session';

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function parseDelimitedLine(line, delimiter = ',') {
  const values = [];
  let current = '';
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];

    if (char === '"') {
      if (inQuotes && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === delimiter && !inQuotes) {
      values.push(current.trim());
      current = '';
      continue;
    }

    current += char;
  }

  values.push(current.trim());
  return values;
}

function detectDelimitedTextFormat(content) {
  const sample = (content || '').split(/\r?\n/).find((line) => line.trim());
  if (!sample) {
    return ',';
  }

  const commaCount = (sample.match(/,/g) || []).length;
  const tabCount = (sample.match(/\t/g) || []).length;
  const semicolonCount = (sample.match(/;/g) || []).length;

  if (tabCount > commaCount && tabCount >= semicolonCount) {
    return '\t';
  }

  if (semicolonCount > commaCount) {
    return ';';
  }

  return ',';
}

function parseStructuredRecords(parsed) {
  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed?.records)) return parsed.records;
  if (Array.isArray(parsed?.voters)) return parsed.voters;
  if (Array.isArray(parsed?.candidates)) return parsed.candidates;
  return [];
}

function parseFileRecords(content, fileName) {
  const normalizedName = normalizeText(fileName).toLowerCase();
  const isJson = normalizedName.endsWith('.json');
  const isNdjson = normalizedName.endsWith('.ndjson');

  if (isNdjson) {
    return content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  }

  if (isJson) {
    return parseStructuredRecords(JSON.parse(content));
  }

  try {
    return parseStructuredRecords(JSON.parse(content));
  } catch {
    const delimiter = detectDelimitedTextFormat(content);
    const rows = content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => parseDelimitedLine(line, delimiter));

    if (rows.length < 2) {
      return [];
    }

    const headers = rows[0].map((header) => normalizeText(header).toLowerCase());
    return rows.slice(1).map((row) => {
      const item = {};
      headers.forEach((header, index) => {
        item[header] = row[index] ?? '';
      });
      return item;
    });
  }
}

function normalizeCandidateImport(records) {
  return (Array.isArray(records) ? records : [])
    .map((record) => {
      if (!record || typeof record !== 'object') return null;
      const name = normalizeText(record.name ?? record.candidate ?? record.title);
      if (!name) return null;
      const description = normalizeText(record.description ?? record.summary ?? record.statement);
      return { name, description };
    })
    .filter(Boolean);
}

function normalizeVoterRulesImport(records) {
  return (Array.isArray(records) ? records : [])
    .map((record) => {
      if (!record || typeof record !== 'object') return null;
      const name = normalizeText(record.name ?? record.full_name ?? record.fullName);
      const id = normalizeText(record.id ?? record.identifier ?? record.voterId ?? record.voter_id ?? record.code);
      const birthdate = normalizeText(record.birthdate ?? record.birthday ?? record.dob ?? record.date_of_birth);

      const normalizedBirthdate = /^\d{4}-\d{2}-\d{2}$/.test(birthdate) ? birthdate : '';
      if (!name && !id && !normalizedBirthdate) return null;

      return {
        name: name || null,
        identifier: id || null,
        birthdate: normalizedBirthdate || null,
      };
    })
    .filter(Boolean);
}

export default function CreateElectionView() {
  const navigate = useNavigate();
  const session = useMemo(() => getSession(), []);
  const { pushToast } = useToast();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [maxVoters, setMaxVoters] = useState('');
  const [candidates, setCandidates] = useState([
    { name: '', description: '' },
    { name: '', description: '' },
  ]);
  const [voterRules, setVoterRules] = useState([]);
  const [candidateImportReplace, setCandidateImportReplace] = useState(false);
  const [voterImportReplace, setVoterImportReplace] = useState(true);
  const [candidateImportPreview, setCandidateImportPreview] = useState([]);
  const [voterImportPreview, setVoterImportPreview] = useState([]);
  const [candidateImportFileName, setCandidateImportFileName] = useState('');
  const [voterImportFileName, setVoterImportFileName] = useState('');
  const [openImmediately, setOpenImmediately] = useState(true);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createdSession, setCreatedSession] = useState(null);
  const [replacePrompt, setReplacePrompt] = useState(null);

  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const buildPayload = () => {
    const trimmedTitle = title.trim();
    const validCandidates = candidates
      .map((c) => ({ name: c.name.trim(), description: c.description.trim() }))
      .filter((c) => c.name);
    const parsedMaxVoters = maxVoters.trim()
      ? Number.parseInt(maxVoters.trim(), 10)
      : null;

    return {
      title: trimmedTitle,
      description: description.trim(),
      candidates: validCandidates,
      voter_rules: voterRules,
      start_date: startDate ? new Date(startDate).toISOString() : null,
      end_date: endDate ? new Date(endDate).toISOString() : null,
      max_voters: Number.isNaN(parsedMaxVoters) ? null : parsedMaxVoters,
    };
  };

  const handleCandidateFileImport = async (file) => {
    if (!file) return;

    try {
      const content = await file.text();
      const imported = normalizeCandidateImport(parseFileRecords(content, file.name));

      if (!imported.length) {
        setError('No valid candidate records found in the selected file.');
        return;
      }

      setCandidates((current) => {
        if (candidateImportReplace) {
          return imported;
        }
        return [...current.filter((c) => c.name.trim()), ...imported];
      });
      setCandidateImportPreview(imported.slice(0, 5));
      setCandidateImportFileName(file.name);

      setError('');
      pushToast({
        type: 'success',
        title: 'Candidates Imported',
        message: `${imported.length} candidate records loaded.`,
      });
    } catch (err) {
      setError(err.message || 'Unable to import candidate file.');
    }
  };

  const handleVoterFileImport = async (file) => {
    if (!file) return;

    try {
      const content = await file.text();
      const imported = normalizeVoterRulesImport(parseFileRecords(content, file.name));

      if (!imported.length) {
        setError('No valid voter records found in the selected file.');
        return;
      }

      setVoterRules((current) => (voterImportReplace ? imported : [...current, ...imported]));
      setVoterImportPreview(imported.slice(0, 5));
      setVoterImportFileName(file.name);
      setError('');
      pushToast({
        type: 'success',
        title: 'Voter Rules Imported',
        message: `${imported.length} voter rule records loaded.`,
      });
    } catch (err) {
      setError(err.message || 'Unable to import voter file.');
    }
  };

  const submitElection = async (payload, { replaceExisting = false } = {}) => {
    const response = await createElection({
      ...payload,
      replace_existing: replaceExisting,
    });
    const electionId = response?.election?.id;

    if (!electionId) {
      throw new Error('Election creation returned an invalid response.');
    }

    if (openImmediately) {
      await updateElectionStatus(electionId, 'open');
    }

    setCreatedSession({
      id: electionId,
      title: response.election.title,
      code: response.election.code,
      joinUrl: `${window.location.origin}/?code=${response.election.code}`,
    });

    if (replaceExisting && Array.isArray(response?.replaced) && response.replaced.length) {
      pushToast({
        type: 'success',
        title: 'Session Replaced',
        message: `Replaced ${response.replaced.length} existing matching session(s).`,
      });
      return;
    }

    pushToast({
      type: 'success',
      title: 'Session Created',
      message: `Election "${response.election.title}" is ready.`,
    });
  };

  const addCandidate = () => {
    setCandidates([...candidates, { name: '', description: '' }]);
  };

  const updateCandidate = (index, field, value) => {
    const nextCandidates = [...candidates];
    nextCandidates[index][field] = value;
    setCandidates(nextCandidates);
  };

  const removeCandidate = (index) => {
    if (candidates.length <= 1) return;
    setCandidates(candidates.filter((_, i) => i !== index));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!isAdminSession(session)) {
      setError('Admin authentication is required to create an election.');
      return;
    }

    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError('Election title is required.');
      return;
    }

    const validCandidates = candidates
      .map((c) => ({ name: c.name.trim(), description: c.description.trim() }))
      .filter((c) => c.name);

    if (validCandidates.length < 2) {
      setError('Add at least 2 valid candidates.');
      return;
    }

    if (startDate && endDate && new Date(endDate) <= new Date(startDate)) {
      setError('End date must be after start date.');
      return;
    }

    if (maxVoters.trim()) {
      const parsedMaxVoters = Number.parseInt(maxVoters.trim(), 10);
      if (Number.isNaN(parsedMaxVoters) || parsedMaxVoters < 1) {
        setError('Maximum voters must be empty or a positive number.');
        return;
      }
    }

    setError('');
    setIsSubmitting(true);

    try {
      const payload = buildPayload();
      await submitElection(payload);
    } catch (err) {
      if (err?.status === 409) {
        setReplacePrompt({
          payload: buildPayload(),
          duplicateSession: err?.data?.duplicateSession || null,
        });
        setError(err.message || 'A matching session already exists.');
        return;
      }

      const message = err.message || 'Unable to create election';
      setError(message);
      pushToast({
        type: 'error',
        title: 'Creation Failed',
        message,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const copySessionCode = async () => {
    if (!createdSession?.code) return;
    try {
      await navigator.clipboard.writeText(createdSession.code);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
      pushToast({ type: 'info', title: 'Code Copied', message: 'Session code copied to clipboard.' });
    } catch {
      pushToast({ type: 'error', title: 'Copy Failed', message: 'Unable to copy session code.' });
    }
  };

  const copyJoinLink = async () => {
    if (!createdSession?.joinUrl) return;
    try {
      await navigator.clipboard.writeText(createdSession.joinUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
      pushToast({ type: 'info', title: 'Link Copied', message: 'Invite link copied to clipboard.' });
    } catch {
      pushToast({ type: 'error', title: 'Copy Failed', message: 'Unable to copy invite link.' });
    }
  };

  return (
    <>
      <div className="w-full max-w-4xl mx-auto px-6 md:px-12 py-10">
        {/* Header Bar */}
        <div className="flex items-center justify-between gap-4 mb-8">
          <div>
            <span className="text-[0.62rem] uppercase tracking-[0.2em] font-bold text-[var(--on-surface)] opacity-50">
              ELECTORAL COMMISSION
            </span>
            <h2 className="font-muse text-4xl text-[var(--primary)] font-bold mt-1">
              Create New Election
            </h2>
          </div>

          <button
            type="button"
            onClick={() => navigate('/admin')}
            className="border border-[var(--outline-variant)] px-4 py-2.5 text-xs uppercase tracking-widest hover:bg-[var(--surface-container)] transition-colors flex items-center gap-2"
          >
            <ArrowLeft size={14} />
            <span>Dashboard</span>
          </button>
        </div>

        {/* Success Modal / State */}
        {createdSession ? (
          <div className="bg-[var(--surface-container-lowest)] p-8 border border-[var(--on-surface)]/20 shadow-2xl space-y-6">
            <div>
              <span className="text-[0.58rem] uppercase tracking-[0.2em] font-bold text-[var(--on-surface)] opacity-50">
                ELECTION CREATED & READY
              </span>
              <h3 className="font-muse text-3xl font-bold text-[var(--primary)] mt-1">
                {createdSession.title}
              </h3>
              <p className="text-xs text-[var(--on-surface)] opacity-70 mt-1">
                The voting session is configured and ready for voter onboarding.
              </p>
            </div>

            {/* Session Code Card */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-[var(--surface)] p-5 border border-[var(--on-surface)]/10 space-y-3">
                <span className="text-[0.58rem] uppercase tracking-[0.16em] text-[var(--on-surface)] opacity-50 font-bold">
                  8-DIGIT SESSION CODE
                </span>
                <p className="font-mono text-3xl font-bold tracking-widest text-[var(--primary)]">
                  {createdSession.code}
                </p>
                <button
                  type="button"
                  onClick={copySessionCode}
                  className="px-4 py-2 text-xs uppercase tracking-widest font-bold border border-[var(--outline-variant)] hover:bg-[var(--surface-container)] flex items-center gap-1.5"
                >
                  {copiedCode ? <Check size={14} /> : <Copy size={14} />}
                  <span>{copiedCode ? 'Copied' : 'Copy Code'}</span>
                </button>
              </div>

              <div className="bg-[var(--surface)] p-5 border border-[var(--on-surface)]/10 space-y-3">
                <span className="text-[0.58rem] uppercase tracking-[0.16em] text-[var(--on-surface)] opacity-50 font-bold">
                  DIRECT VOTER LINK
                </span>
                <input
                  type="text"
                  readOnly
                  value={createdSession.joinUrl}
                  className="w-full p-2 text-xs font-mono bg-[var(--surface-container)] border border-[var(--outline-variant)] text-[var(--on-surface)] select-all"
                />
                <button
                  type="button"
                  onClick={copyJoinLink}
                  className="px-4 py-2 text-xs uppercase tracking-widest font-bold bg-[var(--primary)] text-[var(--on-primary)] hover:bg-[var(--primary)]/90 flex items-center gap-1.5"
                >
                  {copiedLink ? <Check size={14} /> : <Copy size={14} />}
                  <span>{copiedLink ? 'Copied' : 'Copy Link'}</span>
                </button>
              </div>
            </div>

            <div className="flex flex-wrap gap-3 pt-2">
              <button
                type="button"
                onClick={() => navigate('/admin')}
                className="px-6 py-3 text-xs uppercase tracking-widest font-bold bg-[var(--primary)] text-[var(--on-primary)] hover:bg-[var(--primary)]/90 shadow-sm"
              >
                Go to Dashboard
              </button>
              <button
                type="button"
                onClick={() => window.open(createdSession.joinUrl, '_blank')}
                className="px-5 py-3 text-xs uppercase tracking-widest font-bold border border-[var(--outline-variant)] hover:bg-[var(--surface-container)] flex items-center gap-1.5"
              >
                <span>Test as Voter</span>
                <ArrowUpRight size={14} />
              </button>
            </div>
          </div>
        ) : (
          /* Form View */
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Error banner */}
            {error && (
              <div className="p-4 bg-[#ffffff] dark:bg-[#1a1415] border border-rose-600/30 border-t-[3px] border-t-rose-600 shadow-md">
                <div className="flex items-center gap-2 mb-1">
                  <span className="px-1.5 py-0.5 font-mono text-[0.52rem] font-bold tracking-[0.2em] uppercase bg-rose-600/15 text-rose-800 dark:text-rose-300 border border-rose-600/30">
                    VALIDATION FAULT
                  </span>
                </div>
                <p className="text-xs text-rose-900/90 dark:text-rose-200/90 font-medium mt-0.5 leading-relaxed">{error}</p>
              </div>
            )}

            {/* CARD 1: Identity & Description */}
            <div className="bg-[var(--surface-container-lowest)] p-6 md:p-8 border border-[var(--on-surface)]/15 shadow-sm space-y-4">
              <div className="flex items-center gap-2 border-b border-[var(--on-surface)]/10 pb-3">
                <FileText size={16} className="text-[var(--primary)]" />
                <h3 className="font-muse text-xl font-bold text-[var(--primary)]">
                  Election Identity & Details
                </h3>
              </div>

              <div>
                <label className="text-[0.62rem] uppercase tracking-wider font-bold text-[var(--on-surface)] opacity-70 block mb-1.5">
                  Election Title *
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Municipal City Council Election 2026"
                  className="w-full p-3 text-sm bg-[var(--surface)] border border-[var(--outline-variant)] text-[var(--on-surface)]"
                  disabled={isSubmitting}
                />
              </div>

              <div>
                <label className="text-[0.62rem] uppercase tracking-wider font-bold text-[var(--on-surface)] opacity-70 block mb-1.5">
                  Description & Context (Optional)
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Provide context, jurisdiction, or voting platform summary..."
                  rows={3}
                  className="w-full p-3 text-sm bg-[var(--surface)] border border-[var(--outline-variant)] text-[var(--on-surface)]"
                  disabled={isSubmitting}
                />
              </div>
            </div>

            {/* CARD 2: Timeline & Capacity */}
            <div className="bg-[var(--surface-container-lowest)] p-6 md:p-8 border border-[var(--on-surface)]/15 shadow-sm space-y-4">
              <div className="flex items-center gap-2 border-b border-[var(--on-surface)]/10 pb-3">
                <Clock size={16} className="text-[var(--primary)]" />
                <h3 className="font-muse text-xl font-bold text-[var(--primary)]">
                  Timeline & Voter Limits
                </h3>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-[0.62rem] uppercase tracking-wider font-bold text-[var(--on-surface)] opacity-70 block mb-1.5">
                    Start Date & Time (Optional)
                  </label>
                  <input
                    type="datetime-local"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full p-2.5 text-xs bg-[var(--surface)] border border-[var(--outline-variant)] text-[var(--on-surface)]"
                    disabled={isSubmitting}
                  />
                </div>
                <div>
                  <label className="text-[0.62rem] uppercase tracking-wider font-bold text-[var(--on-surface)] opacity-70 block mb-1.5">
                    End Date & Time (Optional)
                  </label>
                  <input
                    type="datetime-local"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full p-2.5 text-xs bg-[var(--surface)] border border-[var(--outline-variant)] text-[var(--on-surface)]"
                    disabled={isSubmitting}
                  />
                </div>
              </div>

              <div>
                <label className="text-[0.62rem] uppercase tracking-wider font-bold text-[var(--on-surface)] opacity-70 block mb-1.5">
                  Voter Capacity Limit (Optional)
                </label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={maxVoters}
                  onChange={(e) => setMaxVoters(e.target.value)}
                  placeholder="Leave empty for unlimited voter capacity"
                  className="w-full p-2.5 text-xs bg-[var(--surface)] border border-[var(--outline-variant)] text-[var(--on-surface)]"
                  disabled={isSubmitting}
                />
                <p className="text-[0.6rem] text-[var(--on-surface)] opacity-50 mt-1">
                  If set, registration closes automatically when this capacity is reached.
                </p>
              </div>
            </div>

            {/* CARD 3: Candidate Slate */}
            <div className="bg-[var(--surface-container-lowest)] p-6 md:p-8 border border-[var(--on-surface)]/15 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-[var(--on-surface)]/10 pb-3">
                <div className="flex items-center gap-2">
                  <Users size={16} className="text-[var(--primary)]" />
                  <h3 className="font-muse text-xl font-bold text-[var(--primary)]">
                    Candidate Slate
                  </h3>
                </div>
                <span className="text-[0.58rem] uppercase tracking-wider font-bold text-[var(--on-surface)] opacity-60">
                  {candidates.filter((c) => c.name.trim()).length} Candidates
                </span>
              </div>

              {/* Dynamic Candidate Inputs */}
              <div className="space-y-3">
                {candidates.map((candidate, index) => (
                  <div
                    key={index}
                    className="p-4 bg-[var(--surface)] border border-[var(--on-surface)]/10 flex flex-col md:flex-row gap-3 items-start"
                  >
                    <span className="font-mono text-xs font-bold text-[var(--on-surface)] opacity-40 mt-2.5 shrink-0">
                      #{String(index + 1).padStart(2, '0')}
                    </span>
                    <div className="flex-1 w-full space-y-2">
                      <input
                        type="text"
                        value={candidate.name}
                        onChange={(e) => updateCandidate(index, 'name', e.target.value)}
                        placeholder={`Candidate ${index + 1} Full Name *`}
                        className="w-full p-2.5 text-sm bg-[var(--surface-container-lowest)] border border-[var(--outline-variant)] text-[var(--on-surface)]"
                        disabled={isSubmitting}
                      />
                      <input
                        type="text"
                        value={candidate.description}
                        onChange={(e) => updateCandidate(index, 'description', e.target.value)}
                        placeholder="Platform statement or biographical summary (optional)"
                        className="w-full p-2 text-xs bg-[var(--surface-container-lowest)] border border-[var(--outline-variant)] text-[var(--on-surface)] opacity-80"
                        disabled={isSubmitting}
                      />
                    </div>
                    {candidates.length > 2 && (
                      <button
                        type="button"
                        onClick={() => removeCandidate(index)}
                        disabled={isSubmitting}
                        className="p-2 text-rose-700 hover:text-rose-900 border border-rose-300/40 hover:bg-rose-50 transition-colors shrink-0 mt-1"
                        title="Remove candidate"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={addCandidate}
                disabled={isSubmitting}
                className="w-full py-2.5 border border-dashed border-[var(--outline-variant)] text-xs uppercase tracking-widest font-bold text-[var(--on-surface)] opacity-70 hover:opacity-100 hover:bg-[var(--surface)] transition-all flex items-center justify-center gap-1.5"
              >
                <Plus size={14} />
                <span>Add Another Candidate</span>
              </button>

              {/* Candidate Bulk Import */}
              <div className="mt-4 p-4 bg-[var(--surface)] border border-[var(--on-surface)]/10 space-y-3">
                <div className="flex items-center gap-2">
                  <UploadCloud size={15} className="text-[var(--primary)]" />
                  <span className="text-xs uppercase tracking-wider font-bold text-[var(--on-surface)]">
                    Bulk Import Candidates (CSV, TSV, JSON)
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <label className="inline-flex items-center gap-2 text-xs text-[var(--on-surface)] opacity-80">
                    <input
                      type="checkbox"
                      checked={candidateImportReplace}
                      onChange={(e) => setCandidateImportReplace(e.target.checked)}
                      disabled={isSubmitting}
                    />
                    <span>Replace current candidates</span>
                  </label>
                </div>
                <input
                  type="file"
                  accept=".csv,.tsv,.json,.ndjson,.txt"
                  onChange={(e) => handleCandidateFileImport(e.target.files?.[0] || null)}
                  disabled={isSubmitting}
                  className="w-full p-2 text-xs bg-[var(--surface-container-lowest)] border border-[var(--outline-variant)] text-[var(--on-surface)]"
                />

                {candidateImportPreview.length > 0 && (
                  <div className="p-3 bg-[var(--surface-container-lowest)] border border-[var(--outline-variant)] space-y-2">
                    <p className="text-[0.6rem] uppercase tracking-widest font-bold text-[var(--on-surface)] opacity-70">
                      Preview: {candidateImportFileName || 'Imported candidates'} (first 5 rows)
                    </p>
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-left border-b border-[var(--outline-variant)] text-[0.6rem] uppercase opacity-60">
                          <th className="py-1">Name</th>
                          <th className="py-1">Description</th>
                        </tr>
                      </thead>
                      <tbody>
                        {candidateImportPreview.map((item, idx) => (
                          <tr key={idx} className="border-b border-[var(--outline-variant)]/40">
                            <td className="py-1 font-bold">{item.name}</td>
                            <td className="py-1 opacity-70">{item.description || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>

            {/* CARD 4: Voter Eligibility Rules */}
            <div className="bg-[var(--surface-container-lowest)] p-6 md:p-8 border border-[var(--on-surface)]/15 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-[var(--on-surface)]/10 pb-3">
                <div className="flex items-center gap-2">
                  <UploadCloud size={16} className="text-[var(--primary)]" />
                  <h3 className="font-muse text-xl font-bold text-[var(--primary)]">
                    Voter Eligibility List (Optional)
                  </h3>
                </div>
                <span className="text-[0.58rem] uppercase tracking-wider font-bold text-[var(--on-surface)] opacity-60">
                  {voterRules.length} Rules Loaded
                </span>
              </div>

              <p className="text-xs text-[var(--on-surface)] opacity-75 leading-relaxed">
                Upload a verified voter roster to restrict ballot casting to eligible citizens. Leave empty for open access.
              </p>

              {/* Supported Format Guide Box */}
              <div className="p-4 bg-[var(--surface)] border border-[var(--on-surface)]/15 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[0.58rem] uppercase tracking-[0.16em] font-bold text-[var(--on-surface)] opacity-60">
                    SUPPORTED FORMAT & COLUMNS
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      const csvContent = "name,birthdate,id\nYacine Dahmani,1992-04-12,VTR-9941\nJohn Smith,1985-11-03,VTR-4402\nAlex Vance,,VTR-1029\nElena Rostova,1998-07-21,\n";
                      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
                      const url = URL.createObjectURL(blob);
                      const link = document.createElement('a');
                      link.setAttribute('href', url);
                      link.setAttribute('download', 'sample_voters_template.csv');
                      document.body.appendChild(link);
                      link.click();
                      document.body.removeChild(link);
                    }}
                    className="text-[0.62rem] uppercase tracking-widest font-bold text-[var(--primary)] hover:underline flex items-center gap-1"
                  >
                    <FileText size={12} />
                    <span>Download Sample CSV</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  <div className="p-2.5 bg-[var(--surface-container-lowest)] border border-[var(--outline-variant)]">
                    <p className="font-bold text-[var(--primary)] font-mono text-[0.68rem]">1. name</p>
                    <p className="text-[0.62rem] text-[var(--on-surface)] opacity-70 mt-0.5">Citizen full name (e.g. Yacine Dahmani)</p>
                  </div>
                  <div className="p-2.5 bg-[var(--surface-container-lowest)] border border-[var(--outline-variant)]">
                    <p className="font-bold text-[var(--primary)] font-mono text-[0.68rem]">2. birthdate</p>
                    <p className="text-[0.62rem] text-[var(--on-surface)] opacity-70 mt-0.5">YYYY-MM-DD (e.g. 2005-13-11)</p>
                  </div>
                  <div className="p-2.5 bg-[var(--surface-container-lowest)] border border-[var(--outline-variant)]">
                    <p className="font-bold text-[var(--primary)] font-mono text-[0.68rem]">3. id</p>
                    <p className="text-[0.62rem] text-[var(--on-surface)] opacity-70 mt-0.5">Voter ID / National code (e.g. VTR-9941)</p>
                  </div>
                </div>

                <div className="text-[0.62rem] text-[var(--on-surface)] opacity-70 space-y-1">
                  <p>• <strong>Supported files:</strong> <code>.csv</code>, <code>.tsv</code>, <code>.json</code>, <code>.ndjson</code>, <code>.txt</code></p>
                  <p>• <strong>Flexible fields:</strong> Columns can be in any order. If a field is missing (e.g. only ID is supplied or only Name + Birthdate), the system automatically validates against whichever fields are present.</p>
                </div>
              </div>

              <div className="flex items-center gap-3 pt-1">
                <label className="inline-flex items-center gap-2 text-xs text-[var(--on-surface)] opacity-80">
                  <input
                    type="checkbox"
                    checked={voterImportReplace}
                    onChange={(e) => setVoterImportReplace(e.target.checked)}
                    disabled={isSubmitting}
                  />
                  <span>Replace current voter list</span>
                </label>
              </div>

              <input
                type="file"
                accept=".csv,.tsv,.json,.ndjson,.txt"
                onChange={(e) => handleVoterFileImport(e.target.files?.[0] || null)}
                disabled={isSubmitting}
                className="w-full p-2 text-xs bg-[var(--surface)] border border-[var(--outline-variant)] text-[var(--on-surface)]"
              />

              {voterImportPreview.length > 0 && (
                <div className="p-3 bg-[var(--surface)] border border-[var(--outline-variant)] space-y-2">
                  <p className="text-[0.6rem] uppercase tracking-widest font-bold text-[var(--on-surface)] opacity-70">
                    Preview: {voterImportFileName || 'Imported voters'} (first 5 rows)
                  </p>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left border-b border-[var(--outline-variant)] text-[0.6rem] uppercase opacity-60">
                        <th className="py-1">Name</th>
                        <th className="py-1">Identifier</th>
                        <th className="py-1">Birthdate</th>
                      </tr>
                    </thead>
                    <tbody>
                      {voterImportPreview.map((item, idx) => (
                        <tr key={idx} className="border-b border-[var(--outline-variant)]/40">
                          <td className="py-1 font-bold">{item.name || '—'}</td>
                          <td className="py-1 font-mono">{item.identifier || '—'}</td>
                          <td className="py-1">{item.birthdate || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* CARD 5: Launch Preferences & Submit */}
            <div className="bg-[var(--surface-container-lowest)] p-6 md:p-8 border border-[var(--on-surface)]/15 shadow-sm space-y-6">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={openImmediately}
                  onChange={(e) => setOpenImmediately(e.target.checked)}
                  disabled={isSubmitting}
                  className="mt-0.5"
                />
                <div>
                  <p className="text-xs uppercase tracking-wider font-bold text-[var(--on-surface)]">
                    Open election for voting immediately
                  </p>
                  <p className="text-xs text-[var(--on-surface)] opacity-60 mt-0.5">
                    If unchecked, the election will be saved as a Draft so you can review candidates before opening.
                  </p>
                </div>
              </label>

              <div className="flex flex-wrap gap-4 pt-2 border-t border-[var(--on-surface)]/10">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="bg-[var(--primary)] text-[var(--on-primary)] px-8 py-3 uppercase text-xs tracking-widest font-bold disabled:opacity-50 transition-transform duration-200 hover:-translate-y-0.5 shadow-md active:translate-y-0"
                >
                  {isSubmitting ? 'Creating Election...' : 'Create Election'}
                </button>
                <button
                  type="button"
                  onClick={() => navigate('/admin')}
                  disabled={isSubmitting}
                  className="border border-[var(--outline-variant)] px-6 py-3 uppercase text-xs tracking-widest font-bold transition-all duration-200 hover:bg-[var(--surface-container)]"
                >
                  Cancel
                </button>
              </div>
            </div>
          </form>
        )}
      </div>

      <ConfirmDialog
        open={!!replacePrompt}
        title="Replace Existing Session?"
        message={
          replacePrompt?.duplicateSession
            ? `A matching session already exists (${replacePrompt.duplicateSession.title}, code ${replacePrompt.duplicateSession.code}). Replace it with this new one?`
            : 'A matching session already exists. Replace it with this new one?'
        }
        confirmLabel="Replace And Create"
        confirmTone="danger"
        busy={isSubmitting}
        onCancel={() => setReplacePrompt(null)}
        onConfirm={async () => {
          if (!replacePrompt?.payload) {
            setReplacePrompt(null);
            return;
          }

          setIsSubmitting(true);
          setError('');

          try {
            await submitElection(replacePrompt.payload, { replaceExisting: true });
            setReplacePrompt(null);
          } catch (err) {
            const message = err.message || 'Unable to replace existing session';
            setError(message);
            pushToast({
              type: 'error',
              title: 'Replace Failed',
              message,
            });
          } finally {
            setIsSubmitting(false);
          }
        }}
      />
    </>
  );
}
