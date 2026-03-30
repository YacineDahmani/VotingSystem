import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createElection, updateElectionStatus } from '../../lib/api';
import { useToast } from '../../components/ui/useToast';
import { getSession, isAdminSession } from '../../store/session';

function parseCandidates(input) {
  return input
    .split(/\r?\n|,/)
    .map((name) => name.trim())
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
  const [candidatesInput, setCandidatesInput] = useState('');
  const [openImmediately, setOpenImmediately] = useState(true);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createdSession, setCreatedSession] = useState(null);

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

    const candidates = parseCandidates(candidatesInput);
    if (!candidates.length) {
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
      const payload = {
        title: trimmedTitle,
        description: description.trim(),
        candidates,
        start_date: startDate ? new Date(startDate).toISOString() : null,
        end_date: endDate ? new Date(endDate).toISOString() : null,
      };

      const response = await createElection(payload);
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
      pushToast({
        type: 'success',
        title: 'Session Created',
        message: `Election ${response.election.title} is ready.`,
      });
    } catch (err) {
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
    <div className="min-h-screen text-white relative z-10 -mt-24 pt-32 px-12 pb-24">
      <div className="max-w-4xl">
        <p className="label-md text-white/50 mb-2 tracking-[0.2em]">ADMIN CONSOLE</p>
        <h2 className="font-muse font-bold text-6xl text-white">Initialize New Election</h2>
      </div>

      <form
        onSubmit={handleSubmit}
        className="mt-10 bg-white text-[var(--primary)] p-10 shadow-2xl max-w-4xl grid grid-cols-1 gap-6"
      >
        <div>
          <label className="label-md text-gray-500 block mb-2">Title</label>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Editorial Ballot 2026"
            className="w-full border border-gray-200 px-4 py-3"
            disabled={isSubmitting}
          />
        </div>

        <div>
          <label className="label-md text-gray-500 block mb-2">Description</label>
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Session details"
            rows={3}
            className="w-full border border-gray-200 px-4 py-3"
            disabled={isSubmitting}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="label-md text-gray-500 block mb-2">Start Date</label>
            <input
              type="datetime-local"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
              className="w-full border border-gray-200 px-4 py-3"
              disabled={isSubmitting}
            />
          </div>
          <div>
            <label className="label-md text-gray-500 block mb-2">End Date</label>
            <input
              type="datetime-local"
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
              className="w-full border border-gray-200 px-4 py-3"
              disabled={isSubmitting}
            />
          </div>
        </div>

        <div>
          <label className="label-md text-gray-500 block mb-2">Candidates</label>
          <textarea
            value={candidatesInput}
            onChange={(event) => setCandidatesInput(event.target.value)}
            placeholder="One per line or comma-separated"
            rows={5}
            className="w-full border border-gray-200 px-4 py-3"
            disabled={isSubmitting}
          />
        </div>

        <label className="inline-flex items-center gap-3">
          <input
            type="checkbox"
            checked={openImmediately}
            onChange={(event) => setOpenImmediately(event.target.checked)}
            disabled={isSubmitting}
          />
          <span className="label-md text-gray-700">Open election immediately after creation</span>
        </label>

        {error ? <p className="label-md text-red-700">{error}</p> : null}

        <div className="flex gap-4">
          <button
            type="submit"
            disabled={isSubmitting}
            className="bg-[var(--primary)] text-white px-8 py-3 uppercase text-xs tracking-widest disabled:opacity-50"
          >
            {isSubmitting ? 'Creating...' : 'Create Election'}
          </button>
          <button
            type="button"
            onClick={() => navigate('/admin')}
            disabled={isSubmitting}
            className="border border-gray-300 px-8 py-3 uppercase text-xs tracking-widest"
          >
            Cancel
          </button>
        </div>

        {createdSession ? (
          <div className="border border-green-700/40 bg-green-50 p-6">
            <p className="label-md text-green-800 tracking-widest">SESSION CREATED</p>
            <h3 className="font-muse text-3xl mt-2">{createdSession.title}</h3>
            <p className="mt-3 text-sm text-gray-700">Share this session code with voters:</p>
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
                className="border border-gray-300 px-5 py-2 uppercase text-xs tracking-widest"
              >
                Copy Code
              </button>
              <button
                type="button"
                onClick={() => navigate('/admin')}
                className="bg-[var(--primary)] text-white px-5 py-2 uppercase text-xs tracking-widest"
              >
                Go To Session Manager
              </button>
            </div>
          </div>
        ) : null}
      </form>
    </div>
  );
}
