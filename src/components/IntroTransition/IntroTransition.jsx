import { useEffect, useState } from 'react';
import { WordmarkWhite } from '../Logo/Logo';
import { INTRO_DARKEN_MS, INTRO_WELCOME_FADE_MS, INTRO_WELCOME_HOLD_MS } from '../../lib/introTiming';
import './IntroTransition.css';

// Stage 1 of the AI Agents entrance — rendered by Layout, above everything,
// over whatever page the user was already on. Darkens the screen, holds a
// welcome title + logo, fades them, then leaves the screen black; Layout
// swaps the route once this has run its course (see INTRO_STAGE1_TOTAL_MS).
export default function IntroTransition() {
  const [showWelcome, setShowWelcome] = useState(false);
  const [welcomeOut, setWelcomeOut] = useState(false);

  useEffect(() => {
    const t1 = setTimeout(() => setShowWelcome(true), INTRO_DARKEN_MS);
    const t2 = setTimeout(() => setWelcomeOut(true), INTRO_DARKEN_MS + INTRO_WELCOME_FADE_MS + INTRO_WELCOME_HOLD_MS);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  return (
    <div className="intro-transition-overlay">
      {showWelcome && (
        <div className={'intro-welcome' + (welcomeOut ? ' intro-welcome-out' : '')}>
          <div className="intro-welcome-title">Welcome to Mon'Archi AI Team</div>
          <WordmarkWhite className="intro-welcome-logo" />
        </div>
      )}
    </div>
  );
}
