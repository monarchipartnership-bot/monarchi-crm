import { useEffect, useState } from 'react';
import { useCrmToAiTransition } from '../../contexts/CrmToAiTransitionContext';
import CosmicBackground from '../SystemMap/CosmicBackground';
import ParticleFieldCanvas from '../SystemMap/ParticleFieldCanvas';
import FragmentCanvas from './FragmentCanvas';
import TemporaryNetworkLayer from './TemporaryNetworkLayer';
import { PHASE } from '../../lib/crmToAiTokens';
import './TransitionPortal.css';

// Fixed overlay above the whole app shell (rendered by App.jsx, above
// AuthGate, whenever the shared transition context's mode isn't 'idle' —
// see TransitionPortalGate in App.jsx). Owns the entire visible build-up:
// trigger -> CRM dissolve/fragmentation -> cosmic environment -> a
// TEMPORARY network (real department data/colors, positioned via the same
// formula as the real map — see TemporaryNetworkLayer) that visibly forms
// core -> connections -> hubs -> children -> labels. The real
// ConstellationTest page is mounted (invisible) underneath the whole time;
// the ONLY thing that reveals it is `destinationVisible` from context — the
// single handoff signal both this overlay and the real page read, so they
// can never drift out of sync with each other.
export default function TransitionPortal() {
  const { mode, reducedMotion, startedAt, sourceRect, destinationVisible } = useCrmToAiTransition();

  if (mode === 'direct') {
    return (
      <DirectTransition
        reducedMotion={reducedMotion} startedAt={startedAt} sourceRect={sourceRect}
        destinationVisible={destinationVisible}
      />
    );
  }
  if (mode === 'reverse') return <ReverseTransition reducedMotion={reducedMotion} />;
  return null;
}

function DirectTransition({ reducedMotion, startedAt, sourceRect, destinationVisible }) {
  const [showTrigger, setShowTrigger] = useState(true);
  const [tempStage, setTempStage] = useState('hidden'); // 'hidden' | 'core' | 'network'
  const [showBurst, setShowBurst] = useState(false);
  const [goneAfterHandoff, setGoneAfterHandoff] = useState(false);

  useEffect(() => {
    if (reducedMotion) return undefined;
    const timers = [
      setTimeout(() => setShowTrigger(false), PHASE.trigger[1] * 1000),
      setTimeout(() => setTempStage('core'), PHASE.coreFormation[0] * 1000),
      setTimeout(() => setShowBurst(true), PHASE.energyBurst[0] * 1000),
      setTimeout(() => { setShowBurst(false); setTempStage('network'); }, PHASE.energyBurst[1] * 1000),
    ];
    return () => timers.forEach(clearTimeout);
  }, [reducedMotion]);

  // The crossfade itself is driven by destinationVisible (context), not a
  // local timer — this local effect only handles cleanly stopping the heavy
  // canvases a moment after the crossfade completes, purely for perf (no
  // point running two ParticleFieldCanvas instances once the real page,
  // which mounts its own, is what's actually visible).
  useEffect(() => {
    if (!destinationVisible) { setGoneAfterHandoff(false); return undefined; }
    const t = setTimeout(() => setGoneAfterHandoff(true), 260);
    return () => clearTimeout(t);
  }, [destinationVisible]);

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

  const tempNetworkStage = destinationVisible ? 'crossfade' : (showBurst ? 'burst' : tempStage);

  return (
    <div
      className={'crm-to-ai-portal' + (destinationVisible ? ' fading-out' : '')}
      aria-busy="true"
      style={goneAfterHandoff ? { pointerEvents: 'none' } : undefined}
    >
      <div className="transition-backdrop" />

      {showTrigger && <div className="transition-trigger-ring" style={triggerPos} />}

      {!goneAfterHandoff && <FragmentCanvas startedAt={startedAt} />}

      {!goneAfterHandoff && (
        <div className="transition-cosmic-layer">
          <CosmicBackground stageAspect={16 / 9} gridTransform="none" transitionCss="none" />
          <ParticleFieldCanvas />
        </div>
      )}

      {tempStage !== 'hidden' && !goneAfterHandoff && <TemporaryNetworkLayer stage={tempNetworkStage} />}

      {showBurst && <div className="transition-energy-burst" />}
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
