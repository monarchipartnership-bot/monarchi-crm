import './AiEnvironment.css';

// Background of the AI Agents section (map style, owner's pick 2026-11-11):
// a plain static dark violet gradient with two very soft corner glows.
// No images, planets, particles or animation. Pure decoration: never
// intercepts pointer events. `calm` is kept only so existing callers work.
// eslint-disable-next-line no-unused-vars
export default function AiEnvironment({ calm = false }) {
  return <div className="ai-env" aria-hidden="true" />;
}
