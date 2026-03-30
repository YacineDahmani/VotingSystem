import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, Shield } from 'lucide-react';
import { submitIdentity } from '../../lib/api';
import { VOTER_PHASES, clearSession, setSession } from '../../store/session';

export default function IdentityArchive() {
  const navigate = useNavigate();
  const [entryMode, setEntryMode] = useState('voter');
  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [voterIdCode, setVoterIdCode] = useState('');
  const [sessionCode, setSessionCode] = useState('');
  const [adminKey, setAdminKey] = useState('');
  const [stepIndex, setStepIndex] = useState(0);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isShaking, setIsShaking] = useState(false);
  const [isFlipping, setIsFlipping] = useState(false);

  const steps = useMemo(() => ([
    {
      label: 'NAME',
      placeholder: 'ENTER FULL NAME',
      value: name,
      onChange: setName,
      type: 'text',
    },
    {
      label: 'AGE',
      placeholder: 'ENTER AGE (18+)',
      value: age,
      onChange: setAge,
      type: 'number',
    },
    {
      label: 'VOTER ID CODE',
      placeholder: 'ENTER YOUR VOTER ID CODE',
      value: voterIdCode,
      onChange: setVoterIdCode,
      type: 'text',
    },
    {
      label: 'SESSION CODE',
      placeholder: 'ENTER VOTING SESSION CODE',
      value: sessionCode,
      onChange: setSessionCode,
      type: 'text',
    },
  ]), [name, age, voterIdCode, sessionCode]);

  const triggerSnag = (message) => {
    setError(message);
    setIsShaking(true);
    setTimeout(() => setIsShaking(false), 420);
  };

  const validateCurrentStep = () => {
    if (stepIndex === 0 && name.trim().length < 2) {
      triggerSnag('Name must include at least 2 characters.');
      return false;
    }

    if (stepIndex === 1) {
      const parsedAge = parseInt(age, 10);
      if (Number.isNaN(parsedAge) || parsedAge < 18) {
        triggerSnag('Age must be 18 or above.');
        return false;
      }
    }

    if (stepIndex === 2 && voterIdCode.trim().length < 3) {
      triggerSnag('Voter ID code is required.');
      return false;
    }

    if (stepIndex === 3 && sessionCode.trim().length < 4) {
      triggerSnag('Session code is required.');
      return false;
    }

    setError('');
    return true;
  };

  const handleAdvance = async () => {
    if (isSubmitting) return;

    if (!validateCurrentStep()) return;

    if (stepIndex < steps.length - 1) {
      setStepIndex((current) => current + 1);
      return;
    }

    setIsSubmitting(true);

    try {
      const payload = {
        name: name.trim(),
        age: parseInt(age, 10),
        voterIdCode: voterIdCode.trim(),
        sessionCode: sessionCode.trim().toUpperCase(),
      };

      const result = await submitIdentity(payload);

      if (result.role === 'admin') {
        clearSession();
        setSession({ role: 'admin', token: result.token });
        setIsFlipping(true);
        setTimeout(() => navigate('/admin'), 600);
        return;
      }

      clearSession();
      setSession({
        role: 'voter',
        token: result.token,
        voterId: result.voter.id,
        voterName: result.voter.name,
        voterIdCode: voterIdCode.trim(),
        sessionCode: result.sessionCode || sessionCode.trim().toUpperCase(),
        electionId: result.election.id,
        electionTitle: result.election.title,
        hasVoted: false,
        phase: VOTER_PHASES.BALLOT,
      });
      navigate('/ballot');
    } catch (err) {
      triggerSnag(err.message || 'Unable to verify identity.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAdminAccess = async () => {
    if (isSubmitting) return;

    const normalizedAdminKey = adminKey.trim();
    if (!normalizedAdminKey) {
      triggerSnag('Admin master key is required for admin access.');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await submitIdentity({ adminKey: normalizedAdminKey });

      if (result.role !== 'admin') {
        throw new Error('Admin authentication failed.');
      }

      clearSession();
      setSession({ role: 'admin', token: result.token });
      setIsFlipping(true);
      setTimeout(() => navigate('/admin'), 600);
    } catch (err) {
      triggerSnag(err.message || 'Unable to verify admin key.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleKeyDown = (event) => {
    if (event.key === 'Enter') {
      if (entryMode === 'admin') {
        handleAdminAccess();
      } else {
        handleAdvance();
      }
    }
  };

  return (
    <motion.div
      className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden"
      animate={isFlipping ? { rotateY: 180, opacity: 0 } : { rotateY: 0, opacity: 1 }}
      transition={{ duration: 0.6, ease: [0.6, 0.01, 0.2, 1] }}
      style={{ transformStyle: 'preserve-3d' }}
    >
      
      {/* Background massive BALLOT watermark */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none overflow-hidden">
        <span className="font-muse text-[30vw] leading-none text-black/[0.03] whitespace-nowrap">
          BALLOT
        </span>
      </div>

      {/* Main Content */}
      <motion.div 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: [0.19, 1, 0.22, 1] }}
        className="relative z-10 w-full max-w-2xl flex flex-col items-center"
      >
        <div className="text-center mb-12">
          <p className="label-md text-[var(--tertiary-container)] mb-4 tracking-widest font-bold">VERIFICATION PHASE</p>
          <h2 className="font-muse text-5xl text-[var(--primary)]">Identity Archive</h2>
        </div>

        <motion.div
          className="paper-float w-full p-16 flex flex-col items-center"
          animate={isShaking ? { x: [-10, 8, -6, 4, 0] } : {}}
          transition={{ duration: 0.4 }}
        >
          <div className="w-full mb-6">
            <p className="label-md text-gray-500 mb-3">ENTRY MODE</p>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => {
                  setEntryMode('voter');
                  setError('');
                }}
                className={`py-3 uppercase text-xs tracking-widest border ${entryMode === 'voter' ? 'bg-[var(--primary)] text-white border-[var(--primary)]' : 'border-gray-300 text-gray-600'}`}
                disabled={isSubmitting}
              >
                Voter Entry
              </button>
              <button
                type="button"
                onClick={() => {
                  setEntryMode('admin');
                  setError('');
                }}
                className={`py-3 uppercase text-xs tracking-widest border ${entryMode === 'admin' ? 'bg-[var(--primary)] text-white border-[var(--primary)]' : 'border-gray-300 text-gray-600'}`}
                disabled={isSubmitting}
              >
                Admin Entry
              </button>
            </div>
          </div>

          <div className="w-full border-t border-dashed border-gray-300 mb-6" />

          {entryMode === 'voter' ? (
            <>
              <div className="w-full mb-8 overflow-hidden">
                <motion.div
                  className="flex"
                  animate={{ x: `-${stepIndex * 100}%` }}
                  transition={{ type: 'spring', stiffness: 220, damping: 28 }}
                >
                  {steps.map((step) => (
                    <div key={step.label} className="w-full shrink-0 pr-2">
                      <label className="label-md text-gray-500 mb-4 pl-1 block">{step.label}</label>
                      <input
                        type={step.type}
                        placeholder={step.placeholder}
                        className="w-full p-6 text-xl tracking-widest font-grotesque uppercase bg-[var(--surface-container-high)] shadow-[var(--layer-recessed)] text-[var(--primary)] placeholder-gray-400 focus:outline-none focus:bg-[var(--surface-container-highest)] transition-colors"
                        value={step.value}
                        onChange={(e) => step.onChange(e.target.value)}
                        onKeyDown={handleKeyDown}
                        disabled={isSubmitting}
                      />
                    </div>
                  ))}
                </motion.div>
              </div>

              <div className="w-full flex items-center justify-between mb-4">
                <p className="label-md text-gray-400">STEP {stepIndex + 1} / {steps.length}</p>
                {error ? <p className="label-md text-red-700">{error}</p> : null}
              </div>

              <div className="w-full flex justify-end">
                <button
                  onClick={handleAdvance}
                  disabled={isSubmitting}
                  className="group bg-[var(--primary)] text-white px-8 py-5 flex items-center gap-4 hover:shadow-[var(--layer-hover)] hover:-translate-y-[2px] transition-all duration-300"
                >
                  <span className="label-md text-white tracking-widest">
                    {isSubmitting ? 'VERIFYING' : stepIndex < steps.length - 1 ? 'NEXT SEQUENCE' : 'ENTER CHAMBER'}
                  </span>
                  <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="w-full mb-4">
                <label className="label-md text-gray-500 mb-2 pl-1 block">ADMIN MASTER KEY</label>
                <input
                  type="password"
                  placeholder="ENTER ADMIN MASTER KEY"
                  className="w-full p-6 text-xl tracking-widest font-grotesque uppercase bg-[var(--surface-container-high)] shadow-[var(--layer-recessed)] text-[var(--primary)] placeholder-gray-400 focus:outline-none focus:bg-[var(--surface-container-highest)] transition-colors"
                  value={adminKey}
                  onChange={(event) => setAdminKey(event.target.value)}
                  onKeyDown={handleKeyDown}
                  disabled={isSubmitting}
                />
              </div>

              <div className="w-full flex items-center justify-between mb-4">
                <p className="label-md text-gray-400">ADMIN ACCESS</p>
                {error ? <p className="label-md text-red-700">{error}</p> : null}
              </div>

              <div className="w-full flex justify-end">
                <button
                  type="button"
                  onClick={handleAdminAccess}
                  disabled={isSubmitting}
                  className="group bg-[var(--primary)] text-white px-8 py-5 flex items-center gap-4 hover:shadow-[var(--layer-hover)] hover:-translate-y-[2px] transition-all duration-300 disabled:opacity-50"
                >
                  <span className="label-md text-white tracking-widest">
                    {isSubmitting ? 'VERIFYING' : 'ENTER ADMIN ROOM'}
                  </span>
                  <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
                </button>
              </div>
            </>
          )}
        </motion.div>

        {/* Footer Meta */}
        <div className="w-full max-w-2xl flex justify-between items-center mt-8 text-gray-400">
          <div className="flex items-center gap-2">
            <Shield size={14} />
            <span className="label-md text-[0.6rem]">PROTOCOL SECURED</span>
          </div>
          <span className="label-md text-[0.6rem]">SERIAL: A-2949-V01</span>
        </div>
      </motion.div>
    </motion.div>
  );
}
