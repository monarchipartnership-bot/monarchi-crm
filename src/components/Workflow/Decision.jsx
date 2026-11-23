import { DecisionPanel } from './parts';
import { PackageReview } from './Package';

// Апрув 1 and the answer of the client are given on the package (the blocks of the strategy and the creatives); Апрув 2 and 3 keep the plain panel.
export default function Decision({ item, email, onDone, onOpenDossier, projectName }) {
  if (item.kind === 'strategy' || item.kind === 'client') return <PackageReview item={item} email={email} onDone={onDone} projectName={projectName} />;
  return <DecisionPanel item={item} email={email} onDone={onDone} onOpenDossier={onOpenDossier} />;
}
