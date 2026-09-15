// No "meeting" entity exists in the system yet — placeholder until it does.
export default function MeetingsSoonCard() {
  return (
    <div className="pulse-card pulse-card--soon">
      <div className="pulse-card__head">
        <span className="pulse-card__title"><span className="pulse-card__ic pulse-card__ic--info">&#128197;</span>Зустрічі сьогодні</span>
      </div>
      <div className="pulse-soon">
        <span className="pulse-soon__badge">Скоро</span>
        <p className="sec-empty">Календар зустрічей команди ще в розробці.</p>
      </div>
    </div>
  );
}
