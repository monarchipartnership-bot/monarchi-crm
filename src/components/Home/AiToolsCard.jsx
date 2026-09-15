import { Link } from 'react-router-dom';

const TOOLS = [
  { key: 'followup', title: 'Генератор follow-up листів', sub: 'Створюйте персоналізовані листи за секунди.', to: '/tools/followup', icon: '✉️' },
  { key: 'image', title: 'Image Studio', sub: 'Створюйте візуали для презентацій.', to: '/tools/image-studio', icon: '\u{1F5BC}️' },
  { key: 'clientReports', title: 'AI для клієнтських звітів', sub: 'Автоматично формує ключові інсайти.', soon: true, icon: '\u{1F4CA}' },
  { key: 'tzGen', title: 'Генератор ТЗ для проєкту', sub: 'Структурує задачі за описом.', soon: true, icon: '\u{1F4DD}' },
];

export default function AiToolsCard() {
  return (
    <div className="pulse-card">
      <div className="pulse-card__head">
        <span className="pulse-card__title"><span className="pulse-card__ic pulse-card__ic--info">&#10024;</span>AI-помічники та інструменти</span>
      </div>

      <div className="list-rows">
        {TOOLS.map((t) => {
          const inner = (
            <>
              <span className="list-row__ic">{t.icon}</span>
              <div className="list-row__body">
                <div className="list-row__title">{t.title}</div>
                <div className="list-row__sub">{t.sub}</div>
              </div>
              {t.soon ? <span className="list-row__tag">Скоро</span> : <span className="list-row__arrow">&rarr;</span>}
            </>
          );
          return t.soon ? (
            <div className="list-row list-row--soon" key={t.key}>{inner}</div>
          ) : (
            <Link className="list-row list-row--link" to={t.to} key={t.key}>{inner}</Link>
          );
        })}
      </div>
    </div>
  );
}
