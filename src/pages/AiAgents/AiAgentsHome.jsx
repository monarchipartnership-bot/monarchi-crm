// «AI Agents»: the home of the new agent system (document «Робочий процес клієнта»). For now only a note: the first tabs (Налаштування, Прогони, Огляд проєктів)
// arrive with the steps A3 and A11 of the plan. The old agent screens were moved out of the project (see docs/ARCHIVE.md).
export default function AiAgentsHome() {
  return (
    <div style={{ maxWidth: 720, margin: '48px auto', padding: '0 20px', color: 'var(--text, inherit)' }}>
      <h1 style={{ fontSize: 28, margin: '0 0 12px' }}>AI Agents</h1>
      <p style={{ color: 'var(--muted)', lineHeight: 1.6, margin: 0 }}>
        Розділ будується заново за документом «Робочий процес клієнта». Тут з'являться налаштування агентів, список прогонів і огляд проєктів.
        Роботу над клієнтом уже видно в картці проєкту, коли вона запущена.
      </p>
    </div>
  );
}
