import { useRef, useState } from 'react';
import AgentWindowFrame from '../../../components/AgentWorkspace/AgentWindowFrame';
import AgentPage, { SUBTABS } from '../../Smm/AgentPage';
import { healthOf } from '../../Smm/AgentCardParts';
import { AgentSwitch } from '../../Smm/SmmAgents';
import { roleMeta } from '../../Smm/agentUi';
import '../../../styles/projectWorkspace.css'; // the confirmation window of the agent switch lives in this sheet
import '../../../styles/smmPage.css';

const SUB_ICONS = { overview: 'info', reports: 'doc', settings: 'gear', prompts: 'chat', history: 'book', tasks: 'list' };

// The page of ONE campaign agent (overview, settings, prompts with versions, history of requests, tasks): the same page the SMM team uses, inside the
// full-screen agent window (Hub style, left column of sections) over the campaign.
//   initialSub: the section to open on (the project card opens an agent straight on its settings)
export default function AgentWindow({ role, team, onClose, onChanged, setRole, kick, initialSub = 'overview' }) {
  const [toast, setToast] = useState(null);
  const [state, setState] = useState({ role, sub: initialSub });
  const timer = useRef(null);
  const sub = state.role === role ? state.sub : 'overview'; // another agent opened from the chain starts on its overview
  const notify = (text, isError = false) => {
    clearTimeout(timer.current);
    setToast({ text, isError });
    timer.current = setTimeout(() => setToast(null), isError ? 7000 : 4000);
  };
  const agent = team.agents.find((a) => a.role === role);
  const meta = roleMeta(role);
  const health = agent ? healthOf(agent, team) : null;
  const ring = !health ? undefined : health.key === 'ok' ? '#3FC77A' : health.key === 'bad' ? '#EF4D5E' : '#A7A0B0';
  const tabs = SUBTABS.filter((t) => !t.roles || t.roles.includes(role));
  const current = tabs.find((t) => t.key === sub) || tabs[0];
  return (
    <AgentWindowFrame
      label={agent?.name || 'Агент операції'} onClose={onClose} closeLabel="До операції"
      who={agent && { name: agent.name, sub: 'Команда операції', ring }}
      sections={tabs.map((t) => ({ key: t.key, label: t.label, icon: SUB_ICONS[t.key] || 'info' }))}
      active={current?.key} onSection={(k) => setState({ role, sub: k })}
      eyebrow={meta.short || 'Агент операції'} title={current?.label || 'Агент'}
      headRight={agent && (
        <>
          <span className={'dwa-chip ' + (health.key === 'ok' ? 'ok' : health.key === 'bad' ? 'bad' : '')} title={health.note}><i />{health.label}</span>
          <AgentSwitch agent={agent} team={team} variant="power" onChanged={async () => { await onChanged(); }} notify={notify} />
        </>
      )}
      toast={toast && <div className={'smm-toast dwa-toast' + (toast.isError ? ' is-error' : '')} role="status">{toast.text}</div>}
      note={agent?.description}
    >
      <div className="smm-page">
        <AgentPage
          embedded subKey={current?.key} setSubKey={(k) => setState({ role, sub: k })}
          role={role} team={team} posts={[]} notify={notify} reloadTeam={onChanged} reloadAll={onChanged}
          back={onClose} open={setRole} go={() => {}} kick={kick}
        />
      </div>
    </AgentWindowFrame>
  );
}
