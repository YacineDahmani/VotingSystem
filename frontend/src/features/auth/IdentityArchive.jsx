import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, Shield } from 'lucide-react';
import { submitIdentity } from '../../lib/api';
import { VOTER_PHASES, clearSession, setSession } from '../../store/session';

export default function IdentityArchive() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [code, setCode] = useState('');
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
      label: 'UNIQUE CODE',
      placeholder: 'ENTER UNIQUE CODE OR MASTER KEY',
      value: code,
      onChange: setCode,
      type: 'text',
    },
  ]), [name, age, code]);

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

    if (stepIndex === 2 && code.trim().length < 3) {
      triggerSnag('Unique code is required.');
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
        code: code.trim(),
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

  const handleKeyDown = (event) => {
    if (event.key === 'Enter') {
      handleAdvance();
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
            <p className="label-md text-gray-400">STEP {stepIndex + 1} / 3</p>
            {error ? <p className="label-md text-red-700">{error}</p> : null}
          </div>

          <div className="w-full flex justify-end">
            <button
              onClick={handleAdvance}
              disabled={isSubmitting}
              className="group bg-[var(--primary)] text-white px-8 py-5 flex items-center gap-4 hover:shadow-[var(--layer-hover)] hover:-translate-y-[2px] transition-all duration-300"
            >
              <span className="label-md text-white tracking-widest">
                {isSubmitting ? 'VERIFYING' : stepIndex < 2 ? 'NEXT SEQUENCE' : 'ENTER CHAMBER'}
              </span>
              <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
            </button>
          </div>
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
