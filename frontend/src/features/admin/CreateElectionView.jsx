import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
  const [candidates, setCandidates] = useState([{ name: '', description: '' }]);
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

  const buildPayload = () => {
    const trimmedTitle = title.trim();
    const validCandidates = candidates
      .map(c => ({ name: c.name.trim(), description: c.description.trim() }))
      .filter(c => c.name);
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
        return [...current, ...imported];
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
      message: `Election ${response.election.title} is ready.`,
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
      .map(c => ({ name: c.name.trim(), description: c.description.trim() }))
      .filter(c => c.name);

    if (!validCandidates.length) {
      setError('Add at least one candidate name.');
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

  return (
    <>
      <div className="min-h-screen text-[var(--primary)] relative z-10 -mt-24 pt-32 px-12 pb-24">
        <div className="max-w-4xl">
          <p className="label-md text-[var(--on-surface)] opacity-60 mb-2 tracking-[0.2em]">ADMIN CONSOLE</p>
          <h2 className="font-muse font-bold text-6xl text-[var(--primary)]">Initialize New Election</h2>
        </div>

        <form
          onSubmit={handleSubmit}
          className="mt-10 bg-[var(--surface-container-lowest)] text-[var(--primary)] p-10 shadow-2xl max-w-4xl grid grid-cols-1 gap-6"
        >
        <div>
          <label className="label-md text-[var(--on-surface)] opacity-60 block mb-2">Title</label>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Editorial Ballot 2026"
            className="w-full border border-[var(--outline-variant)] px-4 py-3"
            disabled={isSubmitting}
          />
        </div>

        <div>
          <label className="label-md text-[var(--on-surface)] opacity-60 block mb-2">Description</label>
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Session details"
            rows={3}
            className="w-full border border-[var(--outline-variant)] px-4 py-3"
            disabled={isSubmitting}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="label-md text-[var(--on-surface)] opacity-60 block mb-2">Start Date</label>
            <input
              type="datetime-local"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
              className="w-full border border-[var(--outline-variant)] px-4 py-3"
              disabled={isSubmitting}
            />
          </div>
          <div>
            <label className="label-md text-[var(--on-surface)] opacity-60 block mb-2">End Date</label>
            <input
              type="datetime-local"
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
              className="w-full border border-[var(--outline-variant)] px-4 py-3"
              disabled={isSubmitting}
            />
          </div>
        </div>

        <div>
          <label className="label-md text-[var(--on-surface)] opacity-60 block mb-2">Maximum Voters (Optional)</label>
          <input
            type="number"
            min="1"
            step="1"
            value={maxVoters}
            onChange={(event) => setMaxVoters(event.target.value)}
            placeholder="Leave empty for unlimited"
            className="w-full border border-[var(--outline-variant)] px-4 py-3"
            disabled={isSubmitting}
          />
        </div>

        <div>
          <label className="label-md text-[var(--on-surface)] opacity-60 block mb-4 border-b pb-2">Candidates</label>
          <div className="flex flex-col gap-4">
            {candidates.map((candidate, index) => (
              <div key={index} className="flex flex-col md:flex-row gap-3 items-start border p-4 bg-[var(--surface-container-low)]/50">
                <div className="flex-1 w-full flex flex-col gap-3">
                  <input
                    value={candidate.name}
                    onChange={(e) => updateCandidate(index, 'name', e.target.value)}
                    placeholder={`Candidate ${index + 1} Name`}
                    className="w-full border border-[var(--outline-variant)] px-4 py-2"
                    disabled={isSubmitting}
                  />
                  <input
                    value={candidate.description}
                    onChange={(e) => updateCandidate(index, 'description', e.target.value)}
                    placeholder="Campaign Statement (Optional)"
                    className="w-full border border-[var(--outline-variant)] px-4 py-2 text-sm text-[var(--on-surface)] opacity-80"
                    disabled={isSubmitting}
                  />
                </div>
                {candidates.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeCandidate(index)}
                    disabled={isSubmitting}
                    className="text-red-600 hover:text-red-800 text-xs tracking-widest uppercase mt-2 md:mt-0 px-2 py-2 transition-colors"
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={addCandidate}
            disabled={isSubmitting}
            className="mt-4 border border-dashed border-gray-400 text-[var(--on-surface)] opacity-80 w-full py-3 uppercase text-xs tracking-widest hover:bg-[var(--surface-container-low)] hover:text-[var(--on-surface)] transition-all duration-200"
          >
            + Add Another Candidate
          </button>

          <div className="mt-4 border border-[var(--outline-variant)] p-4 bg-[var(--surface-container-low)]/40">
            <p className="label-md text-[var(--on-surface)] opacity-70 mb-2">Import Candidates (CSV, TSV, JSON, NDJSON)</p>
            <label className="inline-flex items-center gap-2 text-sm text-[var(--on-surface)] opacity-80 mb-3">
              <input
                type="checkbox"
                checked={candidateImportReplace}
                onChange={(event) => setCandidateImportReplace(event.target.checked)}
                disabled={isSubmitting}
              />
              Replace current candidates
            </label>
            <input
              type="file"
              accept=".csv,.tsv,.json,.ndjson,.txt"
              onChange={(event) => handleCandidateFileImport(event.target.files?.[0] || null)}
              disabled={isSubmitting}
              className="w-full border border-[var(--outline-variant)] px-4 py-2 bg-[var(--surface-container-lowest)]"
            />

            {candidateImportPreview.length ? (
              <div className="mt-3 border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] p-3">
                <p className="text-xs uppercase tracking-widest text-[var(--on-surface)] opacity-70 mb-2">
                  Preview: {candidateImportFileName || 'Imported candidates'} (first 5 rows)
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left border-b border-[var(--outline-variant)]">
                        <th className="py-1 pr-2">Name</th>
                        <th className="py-1">Description</th>
                      </tr>
                    </thead>
                    <tbody>
                      {candidateImportPreview.map((item, index) => (
                        <tr key={`${item.name}-${index}`} className="border-b border-[var(--outline-variant)]/50">
                          <td className="py-1 pr-2">{item.name || '-'}</td>
                          <td className="py-1">{item.description || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <div className="border border-[var(--outline-variant)] p-4 bg-[var(--surface-container-low)]/30">
          <label className="label-md text-[var(--on-surface)] opacity-70 block mb-2">Import Voter Rules (Optional)</label>
          <p className="text-xs text-[var(--on-surface)] opacity-70 mb-3">
            Fields can include name, id/identifier, and birthdate (YYYY-MM-DD). Missing fields are treated as unrestricted.
          </p>
          <label className="inline-flex items-center gap-2 text-sm text-[var(--on-surface)] opacity-80 mb-3">
            <input
              type="checkbox"
              checked={voterImportReplace}
              onChange={(event) => setVoterImportReplace(event.target.checked)}
              disabled={isSubmitting}
            />
            Replace current voter rules
          </label>
          <input
            type="file"
            accept=".csv,.tsv,.json,.ndjson,.txt"
            onChange={(event) => handleVoterFileImport(event.target.files?.[0] || null)}
            disabled={isSubmitting}
            className="w-full border border-[var(--outline-variant)] px-4 py-2 bg-[var(--surface-container-lowest)]"
          />
          {voterImportPreview.length ? (
            <div className="mt-3 border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] p-3">
              <p className="text-xs uppercase tracking-widest text-[var(--on-surface)] opacity-70 mb-2">
                Preview: {voterImportFileName || 'Imported voters'} (first 5 rows)
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left border-b border-[var(--outline-variant)]">
                      <th className="py-1 pr-2">Name</th>
                      <th className="py-1 pr-2">Identifier</th>
                      <th className="py-1">Birthdate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {voterImportPreview.map((item, index) => (
                      <tr key={`${item.identifier || item.name || 'rule'}-${index}`} className="border-b border-[var(--outline-variant)]/50">
                        <td className="py-1 pr-2">{item.name || '-'}</td>
                        <td className="py-1 pr-2">{item.identifier || '-'}</td>
                        <td className="py-1">{item.birthdate || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
          <p className="label-md text-[var(--on-surface)] opacity-70 mt-2">Loaded voter rules: {voterRules.length}</p>
        </div>

        <label className="inline-flex items-center gap-3">
          <input
            type="checkbox"
            checked={openImmediately}
            onChange={(event) => setOpenImmediately(event.target.checked)}
            disabled={isSubmitting}
          />
          <span className="label-md text-[var(--on-surface)] opacity-90">Open election immediately after creation</span>
        </label>

        {error ? <p className="label-md text-red-700">{error}</p> : null}

        <div className="flex gap-4">
          <button
            type="submit"
            disabled={isSubmitting}
            className="bg-[var(--primary)] text-[var(--on-primary)] px-8 py-3 uppercase text-xs tracking-widest disabled:opacity-50 transition-transform duration-200 hover:-translate-y-0.5 shadow-md hover:shadow-lg active:translate-y-0"
          >
            {isSubmitting ? 'Creating...' : 'Create Election'}
          </button>
          <button
            type="button"
            onClick={() => navigate('/admin')}
            disabled={isSubmitting}
            className="border border-[var(--outline-variant)] px-8 py-3 uppercase text-xs tracking-widest transition-all duration-200 hover:bg-[var(--surface-container)] shadow-sm hover:shadow-md active:translate-y-0.5"
          >
            Cancel
          </button>
        </div>

        {createdSession ? (
          <div className="border border-green-700/40 bg-green-50 p-6">
            <p className="label-md text-green-800 tracking-widest">SESSION CREATED</p>
            <h3 className="font-muse text-3xl mt-2">{createdSession.title}</h3>
            <p className="mt-3 text-sm text-[var(--on-surface)] opacity-90">Share this session code with voters:</p>
            <p className="font-bold text-2xl tracking-[0.2em] mt-1">{createdSession.code}</p>
            <div className="mt-4 flex gap-3 flex-wrap">
              <button
                type="button"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(createdSession.code);
                    pushToast({
                      type: 'info',
                      title: 'Code Copied',
                      message: 'Session code copied to clipboard.',
                    });
                  } catch {
                    setError('Unable to copy session code');
                    pushToast({
                      type: 'error',
                      title: 'Copy Failed',
                      message: 'Unable to copy session code.',
                    });
                  }
                }}
                className="border border-[var(--outline-variant)] px-5 py-2 uppercase text-xs tracking-widest"
              >
                Copy Code
              </button>
              <button
                type="button"
                onClick={() => navigate('/admin')}
                className="bg-[var(--primary)] text-[var(--on-primary)] px-5 py-2 uppercase text-xs tracking-widest"
              >
                Go To Session Manager
              </button>
            </div>
          </div>
        ) : null}
        </form>
      </div>

      <ConfirmDialog
        open={!!replacePrompt}
        title="Replace Existing Session?"
        message={replacePrompt?.duplicateSession
          ? `A matching session already exists (${replacePrompt.duplicateSession.title}, code ${replacePrompt.duplicateSession.code}). Replace it with this new one?`
          : 'A matching session already exists. Replace it with this new one?'}
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
