import OpsDashboard from '../../components/Home/OpsDashboard';
import '../../styles/reportPage.css';
import '../../styles/comparePage.css';
import '../../styles/automationDashboard.css';
import '../../styles/homeDashboard.css';

export default function Home() {
  return (
    <div className="home-page">
      <div className="page-head home-head">
        <div className="page-kicker">Monarchi &middot; Operations</div>
        <h1>Welcome back</h1>
        <p>
          Усі внутрішні звіти та студії агентства &mdash; в одному місці. У розділі <b>Reports</b> ведеться
          щоденна, тижнева, місячна та річна звітність по команді Sales; <b>Clients Report</b> &mdash; клієнтський
          звіт для проєктних менеджерів. У розділі <b>Tools</b> зібрані робочі студії: Image Studio для карток
          портфоліо, Follow-up Generator для персоналізованих повідомлень клієнтам і Project Calculator &mdash;
          воронка з лідами. Обирайте розділ зліва в меню.
        </p>
      </div>

      <OpsDashboard />
    </div>
  );
}
