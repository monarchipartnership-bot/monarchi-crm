import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import ActionIcon from '../../../components/common/ActionIcon';
import useDialogA11y from '../../../lib/useDialogA11y';
import AgentPage from '../../Smm/AgentPage';
import '../../../styles/projectWorkspace.css'; // the confirmation window of the agent switch lives in this sheet
import '../../../styles/smmPage.css';

// The page of ONE campaign agent (overview, settings, prompts with versions, history of requests, tasks): the same page the SMM team uses,
// opened as a large light window over the campaign.
export default function AgentWindow({ role, team, onClose, onChanged, setRole, kick }) {
  const box = useRef(null);
  const [toast, setToast] = useState(null);
  const timer = useRef(null);
  useDialogA11y(box, onClose);
  const notify = (text, isError = false) => {
    clearTimeout(timer.current);
    setToast({ text, isError });
    timer.current = setTimeout(() => setToast(null), isError ? 7000 : 4000);
  };
  return createPortal(
    <div className="smm-overlay cmp-agentwin" data-dd="plum" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={box} className="smm-dialog smm-dialog--page" role="dialog" aria-modal="true" aria-label="Агент кампанії" tabIndex={-1}>
        <button type="button" className="smm-x smm-x--corner" onClick={onClose} aria-label="Закрити"><ActionIcon name="close" size={20} /></button>
        <div className="smm-page smm-window-page">
          {toast && <div className={'smm-toast' + (toast.isError ? ' is-error' : '')} role="status">{toast.text}</div>}
          <AgentPage
            role={role} team={team} posts={[]} notify={notify} reloadTeam={onChanged} reloadAll={onChanged}
            back={onClose} open={setRole} go={() => {}} kick={kick}
          />
        </div>
      </div>
    </div>,
    document.body,
  );
}
