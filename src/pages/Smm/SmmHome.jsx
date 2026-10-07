import '../../styles/reportPage.css';

// Placeholder for the upcoming internal SMM section (team of assistants
// for the Monarchi website and social networks). Nothing is built yet —
// this page only reserves the sidebar entry and route.
export default function SmmHome() {
  return (
    <div className="report-page">
      <section className="rpt-hero">
        <h1>Mon&apos;Archi SMM</h1>
        <p className="sub">Внутрішній розділ для роботи з сайтом і соцмережами Monarchi.</p>
      </section>

      <div className="placeholder">
        <h3>Розділ у розробці</h3>
        <p>Тут з&apos;явиться команда SMM-асистентів: аналітика сайту, конкуренти, контент-план і публікації в соцмережах.</p>
      </div>
    </div>
  );
}
