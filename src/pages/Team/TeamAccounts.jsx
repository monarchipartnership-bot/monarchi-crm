import { useNavigate } from 'react-router-dom';
import { ACCOUNT_SECTIONS } from '../../lib/teamAccountsData';
import '../../styles/reportPage.css';
import '../../styles/teamAccountsPage.css';

export default function TeamAccounts() {
  const navigate = useNavigate();

  return (
    <div className="report-page team-accounts-page">
      <div className="page-actions">
        <button type="button" className="btn" onClick={() => navigate(-1)}>&#8592; Back</button>
      </div>

      <section className="rpt-hero">
        <h1>Team Accounts</h1>
        <p className="sub">Швидкий доступ до всіх акаунтів і платформ команди — клік відкриває сторінку входу в новій вкладці.</p>
      </section>

      {ACCOUNT_SECTIONS.map((section, si) => (
        <div key={section.label}>
          <div className={'sec-label' + (si === 0 ? ' first' : '')}>{section.label}<span className="ln" /></div>
          <div className="acct-grid">
            {section.accounts.map((a, i) => (
              <a
                key={i}
                className="acct-card"
                href={a.href}
                target="_blank"
                rel="noopener"
                style={{ '--acct-accent': a.accent, '--acct-bg': a.bg, '--acct-border': a.border, '--acct-badge-bg': a.badgeBg || a.accent }}
              >
                <div className="acct-badge">
                  {a.iconType === 'img'
                    ? <img src={a.icon} alt={a.platform} />
                    : <span dangerouslySetInnerHTML={{ __html: a.icon }} />}
                </div>
                <div className="acct-text">
                  <div className="acct-platform">{a.platform}</div>
                  <div className="acct-name">{a.name}</div>
                </div>
                <svg className="acct-arrow" viewBox="0 0 24 24"><path d="M7 17 17 7M9 7h8v8" /></svg>
              </a>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
