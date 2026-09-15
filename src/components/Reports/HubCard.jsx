import { Link } from 'react-router-dom';

// A clickable option card for a "pick where to go" landing page (Task
// Manager / Reports Manager) — collapses several sidebar links into one
// entry point, with the actual choice made in the work area.
export default function HubCard({ icon, title, desc, to }) {
  return (
    <Link to={to} className="hub-card">
      <span className="hub-card-icon" dangerouslySetInnerHTML={{ __html: icon }} />
      <div className="hub-card-body">
        <h3>{title}</h3>
        <p>{desc}</p>
      </div>
      <span className="hub-card-arrow">&rarr;</span>
    </Link>
  );
}
