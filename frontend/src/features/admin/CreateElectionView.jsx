import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createElection, updateElectionStatus } from '../../lib/api';
import { useToast } from '../../components/ui/useToast';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import { getSession, isAdminSession } from '../../store/session';

export default function CreateElectionView() {
  const navigate = useNavigate();
  const session = useMemo(() => getSession(), []);
  const { pushToast } = useToast();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [candidates, setCandidates] = useState([{ name: '', description: '' }]);
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

    return {
      title: trimmedTitle,
      description: description.trim(),
      candidates: validCandidates,
      start_date: startDate ? new Date(startDate).toISOString() : null,
      end_date: endDate ? new Date(endDate).toISOString() : null,
    };
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
