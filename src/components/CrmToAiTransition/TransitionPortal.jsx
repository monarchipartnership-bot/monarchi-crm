import { useEffect, useState } from 'react';
import { useCrmToAiTransition } from '../../contexts/CrmToAiTransitionContext';
import CosmicBackground from '../SystemMap/CosmicBackground';
import ParticleFieldCanvas from '../SystemMap/ParticleFieldCanvas';
import FragmentCanvas from './FragmentCanvas';
import { PHASE } from '../../lib/crmToAiTokens';
import './TransitionPortal.css';

// Fixed overlay above the whole app shell (rendered by Layout whenever the
// shared transition context's mode isn't 'idle'). Owns phases 0-7 of the
// direct transition (trigger -> focus -> fragmentation -> environment shift
// -> travel -> core formation -> energy burst) and the short reverse flash.
// Phases 8-12 (departments/labels/controls/settle) are NOT duplicated here
// — they're the real ConstellationTest page's own existing reveal, synced
// to this same clock (see ConstellationTest.jsx's transition-aware timeline
// override) and simply revealed once this overlay fades away.
//
// Only a handful of discrete phase-boolean flips are scheduled via
// setTimeout (mirroring ConstellationTest's own introPhase pattern) — the
// actual smooth motion is plain CSS animation/transition, never a
// per-frame React setState. FragmentCanvas/ParticleFieldCanvas run their
// own rAF loops internally with all particle state in refs.
export default function TransitionPortal() {
  const { mode, reducedMotion, startedAt, sourceRect } = useCrmToAiTransition();

  if (mode === 'direct') return <DirectTransition reducedMotion={reducedMotion} startedAt={startedAt} sourceRect={sourceRect} />;
  if (mode === 'reverse') return <ReverseTransition reducedMotion={reducedMotion} />;
  return null;
}

function DirectTransition({ reducedMotion, startedAt, sourceRect }) {
  const [stage, setStage] = useState('trigger');

  useEffect(() => {
    if (reducedMotion) { setStage('fadingOut'); return undefined; }
    const timers = [
      setTimeout(() => setStage('focus'), PHASE.trigger[1] * 1000),
      setTimeout(() => setStage('cosmic'), PHASE.environmentShift[0] * 1000),
      setTimeout(() => setStage('core'), PHASE.coreFormation[0] * 1000),
      setTimeout(() => setStage('burst'), PHASE.energyBurst[0] * 1000),
      setTimeout(() => setStage('fadingOut'), PHASE.energyBurst[1] * 1000),
      setTimeout(() => setStage('gone'), PHASE.energyBurst[1] * 1000 + 380),
    ];
    return () => timers.forEach(clearTimeout);
  }, [reducedMotion]);

  const triggerPos = sourceRect
    ? { left: sourceRect.left + sourceRect.width / 2, top: sourceRect.top + sourceRect.height / 2 }
    : { left: '50%', top: '50%' };

  if (reducedMotion) {
    return (
      <div className="crm-to-ai-portal reduced" aria-busy="true">
        <div className="transition-backdrop reduced-crossfade" />
      </div>
    );
  }

  const invisible = stage === 'gone';
  return (
    <div className={'crm-to-ai-portal' + (stage === 'fadingOut' || invisible ? ' fading-out' : '')} aria-busy="true" style={invisible ? { pointerEvents: 'none' } : undefined}>
      <div className="transition-backdrop" />

      {stage === 'trigger' && (
        <div className="transition-trigger-ring" style={triggerPos} />
      )}

      {stage !== 'fadingOut' && !invisible && <FragmentCanvas startedAt={startedAt} />}

      {(stage === 'cosmic' || stage === 'core' || stage === 'burst' || stage === 'fadingOut') && (
        <div className="transition-cosmic-layer">
          <CosmicBackground stageAspect={16 / 9} gridTransform="none" transitionCss="none" />
          <ParticleFieldCanvas />
        </div>
      )}

      {(stage === 'core' || stage === 'burst' || stage === 'fadingOut') && (
        <div className="transition-core-bloom" />
      )}

      {stage === 'burst' && <div className="transition-energy-burst" />}
    </div>
  );
}

function ReverseTransition({ reducedMotion }) {
  const [flashed, setFlashed] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setFlashed(true), reducedMotion ? 0 : 380);
    return () => clearTimeout(t);
  }, [reducedMotion]);

  return (
    <div className={'crm-to-ai-portal reverse' + (flashed ? ' flashed' : '')} aria-busy="true">
      <div className={reducedMotion ? 'transition-backdrop reduced-crossfade' : 'transition-backdrop reverse'} />
    </div>
  );
}
