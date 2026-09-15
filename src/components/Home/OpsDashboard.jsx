import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import DonutChart from '../Automation/DonutChart';
import { IC, iconOnly } from '../Sidebar/icons';
import { fetchTasksForDay, fetchTasksForWeek } from '../../lib/api/tasks';
import { fetchReportByDate, fetchDailyReportsBetween } from '../../lib/api/dailyReports';
import { fetchProjects } from '../../lib/api/projects';
import { fetchAllDailyReportsForDate, fetchAllDailyReportsBetween } from '../../lib/api/projectReports';
import { fetchLeaveForMonth, fetchProfilesByEmails } from '../../lib/api/leaveRequests';
import { fetchActivitySince } from '../../lib/api/activityLog';
import { todayIso, addDaysIso, isoWeekRange, isoDate, daysInMonth } from '../../lib/dateHelpers';
import { deriveTaskStatus } from '../../lib/taskStatus';

function ymd(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return { y, m, d };
}

// Whole-day difference between two "YYYY-MM-DD" strings, computed via
// Date.UTC on both sides so local timezone offsets never shift the count.
function daysBetweenIso(aIso, bIso) {
  const [ay, am, ad] = aIso.split('-').map(Number);
  const [by, bm, bd] = bIso.split('-').map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000);
}

// Day of week (0=Sunday..6=Saturday) for a "YYYY-MM-DD" string, via Date.UTC
// so it never shifts with the local timezone.
function dowOf(iso) {
  const { y, m, d } = ymd(iso);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

const DAY_SHORT = ['Нд', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
const DAY_ACCUSATIVE = ['неділю', 'понеділок', 'вівторок', 'середу', 'четвер', "п'ятницю", 'суботу'];

function fmtShortDate(iso) {
  const { m, d } = ymd(iso);
  return `${String(d).padStart(2, '0')}.${String(m).padStart(2, '0')}`;
}

// The most recent working day (Mon-Fri) strictly before `todayI` — Monday
// rolls back to the previous Friday, Sunday/Saturday roll back to that same
// Friday, so nobody gets nagged about a report that was never expected on a
// day off.
function lastBusinessDayIso(todayI) {
  const dow = dowOf(todayI);
  const back = dow === 0 ? 2 : dow === 1 ? 3 : 1;
  return addDaysIso(todayI, -back);
}

// "вчора" when the target day really is yesterday; otherwise a named,
// grammatically-inflected day + date (e.g. "п'ятницю (28.08)") so a Monday
// reminder about Friday's report reads naturally.
function periodPhrase(targetIso, todayI) {
  if (targetIso === addDaysIso(todayI, -1)) return 'вчора';
  return `${DAY_ACCUSATIVE[dowOf(targetIso)]} (${fmtShortDate(targetIso)})`;
}

function personLabel(profile, email) {
  const full = `${profile?.first_name || ''} ${profile?.last_name || ''}`.trim();
  return full || email;
}

async function safe(promise, fallback) {
  try {
    return await promise;
  } catch {
    return fallback;
  }
}

function DeptIcon({ icon }) {
  return <span className="ops-dept-icon" dangerouslySetInnerHTML={{ __html: iconOnly(icon) }} />;
}

function StatusBox({ label, badge, sub, to }) {
  return (
    <div className="ops-status">
      <div className="ops-status-label">{label}</div>
      {badge}
      {sub && <div className="ops-status-sub">{sub}</div>}
      {to && <Link to={to} className="btn">Переглянути</Link>}
    </div>
  );
}

function DeptReminders({ items }) {
  if (!items?.length) return null;
  return (
    <div className="ops-dept-reminders">
      {items.map((r) => (
        <div className="ops-reminder" key={r.key}>&#9888; {r.text}</div>
      ))}
    </div>
  );
}

export default function OpsDashboard() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const todayI = todayIso();
      const bizYesterdayI = lastBusinessDayIso(todayI);
      const { y: ty, m: tm, d: td } = ymd(todayI);
      const { y: yy, m: ym, d: yd } = ymd(bizYesterdayI);
      const { start: weekStartIso, end: weekEndIso } = isoWeekRange(todayI);
      const daysElapsed = daysBetweenIso(weekStartIso, todayI) + 1;
      const startOfTodayIso = new Date(new Date().setHours(0, 0, 0, 0)).toISOString();
      const startOfWeekIso = new Date(weekStartIso + 'T00:00:00').toISOString();
      const monthStartIso = isoDate(ty, tm, 1);
      const monthEndIso = isoDate(ty, tm, daysInMonth(ty, tm));

      const [
        tasksToday,
        tasksYesterday,
        tasksThisWeek,
        salesToday,
        salesYesterday,
        salesWeekRows,
        projects,
        dailyReportsToday,
        dailyReportsYesterday,
        dailyReportsThisWeek,
        leaveToday,
        leaveThisMonth,
        activityToday,
        activityThisWeek,
      ] = await Promise.all([
        safe(fetchTasksForDay(todayI), []),
        safe(fetchTasksForDay(bizYesterdayI), []),
        safe(fetchTasksForWeek(weekStartIso, weekEndIso), []),
        safe(fetchReportByDate(ty, tm, td), null),
        safe(fetchReportByDate(yy, ym, yd), null),
        safe(fetchDailyReportsBetween(weekStartIso, todayI), []),
        safe(fetchProjects(), []),
        safe(fetchAllDailyReportsForDate(todayI), []),
        safe(fetchAllDailyReportsForDate(bizYesterdayI), []),
        safe(fetchAllDailyReportsBetween(weekStartIso, todayI), []),
        safe(fetchLeaveForMonth(todayI, todayI), []),
        safe(fetchLeaveForMonth(monthStartIso, monthEndIso), []),
        safe(fetchActivitySince(startOfTodayIso), []),
        safe(fetchActivitySince(startOfWeekIso), []),
      ]);

      if (cancelled) return;

      const activeProjects = projects.filter((p) => p.status === 'active');
      const activeIds = new Set(activeProjects.map((p) => p.id));
      const reportedTodayIds = new Set(dailyReportsToday.map((r) => r.project_id));
      const reportedYesterdayIds = new Set(dailyReportsYesterday.map((r) => r.project_id));

      const approvedLeaveToday = leaveToday.filter((l) => l.status === 'approved');
      const profilesByEmail = approvedLeaveToday.length
        ? await safe(fetchProfilesByEmails(approvedLeaveToday.map((l) => l.email)), {})
        : {};

      const bizYesterdayPhrase = periodPhrase(bizYesterdayI, todayI);
      const yesterdayLabel = bizYesterdayI === addDaysIso(todayI, -1) ? 'Вчора' : `${DAY_SHORT[dowOf(bizYesterdayI)]} ${fmtShortDate(bizYesterdayI)}`;

      const salesReminders = [];
      if (!salesYesterday) salesReminders.push({ key: 'sales-yesterday', text: `Daily Report за ${bizYesterdayPhrase} не подано.` });

      const pmReminders = [];
      activeProjects.forEach((p) => {
        if (!reportedYesterdayIds.has(p.id)) {
          pmReminders.push({ key: `proj-${p.id}`, text: `«${p.name}»: немає Daily звіту по рекламі за ${bizYesterdayPhrase}.` });
        }
      });

      // Sales — how many of the days elapsed so far this week already have
      // a submitted whole-team daily report (one row per calendar day).
      const salesWeekDone = salesWeekRows.length;

      // Project Managers — distinct (project, day) pairs, active projects only.
      const pmWeekSet = new Set(
        dailyReportsThisWeek.filter((r) => activeIds.has(r.project_id)).map((r) => `${r.project_id}_${r.report_date}`)
      );
      const pmWeekTotal = activeProjects.length * daysElapsed;

      // Automation — done/pending/moved/cancelled breakdown, matching the
      // full Automation Dashboard's own status logic.
      function breakdown(list) {
        let done = 0, pending = 0, moved = 0, cancelled = 0;
        list.forEach((t) => {
          const s = deriveTaskStatus(t);
          if (s === 'done') done++;
          else if (s === 'pending') pending++;
          else if (s === 'moved') moved++;
          else if (s === 'cancelled') cancelled++;
        });
        return { done, pending, moved, cancelled, total: list.length };
      }
      const automationToday = breakdown(tasksToday);
      const automationYesterday = breakdown(tasksYesterday);
      const automationWeek = breakdown(tasksThisWeek);

      const automationReminders = [];
      if (automationYesterday.total > 0 && automationYesterday.done < automationYesterday.total) {
        automationReminders.push({
          key: 'automation-yesterday',
          text: `За ${bizYesterdayPhrase} виконано лише ${automationYesterday.done} з ${automationYesterday.total} задач.`,
        });
      }

      // Team — approved leave this month, by type.
      const approvedLeaveMonth = leaveThisMonth.filter((l) => l.status === 'approved');
      const vacationCount = approvedLeaveMonth.filter((l) => l.type !== 'sick').length;
      const sickCount = approvedLeaveMonth.filter((l) => l.type === 'sick').length;

      const followupToday = activityToday.filter((a) => a.tool === 'followup').length;
      const imageToday = activityToday.filter((a) => a.tool === 'image_studio').length;
      const followupWeek = activityThisWeek.filter((a) => a.tool === 'followup').length;
      const imageWeek = activityThisWeek.filter((a) => a.tool === 'image_studio').length;

      setData({
        yesterdayLabel,
        sales: {
          yesterdayOk: !!salesYesterday,
          todayOk: !!salesToday,
          weekDone: salesWeekDone,
          weekTotal: daysElapsed,
          reminders: salesReminders,
        },
        pm: {
          activeCount: activeProjects.length,
          yesterdayCount: activeProjects.filter((p) => reportedYesterdayIds.has(p.id)).length,
          todayCount: activeProjects.filter((p) => reportedTodayIds.has(p.id)).length,
          weekDone: pmWeekSet.size,
          weekTotal: pmWeekTotal,
          reminders: pmReminders,
        },
        automation: { today: automationToday, yesterday: automationYesterday, week: automationWeek, reminders: automationReminders },
        team: {
          outToday: approvedLeaveToday.map((l) => personLabel(profilesByEmail[l.email], l.email)),
          vacationCount,
          sickCount,
        },
        tools: { followupToday, imageToday, followupWeek, imageWeek },
      });
      setLoading(false);
    }

    load();
    return () => { cancelled = true; };
  }, []);

  if (loading || !data) {
    return (
      <div className="ops-dash">
        <div className="sec-label">Сьогодні на платформі<span className="ln" /></div>
        <p className="sec-empty">Завантаження...</p>
      </div>
    );
  }

  const { yesterdayLabel, sales, pm, automation, team, tools } = data;

  const pmWeekOk = pm.weekTotal > 0;
  const automationWeekOk = automation.week.total > 0;
  const teamMonthOk = team.vacationCount + team.sickCount > 0;
  const toolsWeekOk = tools.followupWeek + tools.imageWeek > 0;

  return (
    <div className="ops-dash">
      <div className="sec-label">Сьогодні на платформі<span className="ln" /></div>

      <div className="ops-dept-grid">
        <div className="ops-dept-card">
          <div className="ops-dept-head"><DeptIcon icon={IC.deptSales} />Sales Managers Department</div>
          <DeptReminders items={sales.reminders} />
          <div className="ops-status-row">
            <StatusBox
              label={yesterdayLabel}
              badge={<span className={'ops-badge ' + (sales.yesterdayOk ? 'yes' : 'no')}>{sales.yesterdayOk ? 'Подано' : 'Не подано'}</span>}
              to="/reports/daily"
            />
            <StatusBox
              label="Сьогодні"
              badge={<span className={'ops-badge ' + (sales.todayOk ? 'yes' : 'no')}>{sales.todayOk ? 'Подано' : 'Не подано'}</span>}
              to="/reports/daily"
            />
          </div>
          <div className="ops-donut-block">
            <div className="ops-donut-title">Звіти за цей тиждень: {sales.weekDone} з {sales.weekTotal}</div>
            <DonutChart slices={[
              { label: 'Подано', value: sales.weekDone, color: '#1E9E5D' },
              { label: 'Не подано', value: Math.max(sales.weekTotal - sales.weekDone, 0), color: '#D14343' },
            ]} />
          </div>
        </div>

        <div className="ops-dept-card">
          <div className="ops-dept-head"><DeptIcon icon={IC.deptPM} />Project Managers Department</div>
          <DeptReminders items={pm.reminders} />
          <div className="ops-status-row">
            <StatusBox
              label={yesterdayLabel}
              badge={<span className={'ops-badge ' + (pm.activeCount > 0 && pm.yesterdayCount === pm.activeCount ? 'yes' : 'no')}>{pm.yesterdayCount} / {pm.activeCount}</span>}
              to="/projects"
            />
            <StatusBox
              label="Сьогодні"
              badge={<span className={'ops-badge ' + (pm.activeCount > 0 && pm.todayCount === pm.activeCount ? 'yes' : 'no')}>{pm.todayCount} / {pm.activeCount}</span>}
              to="/projects"
            />
          </div>
          <div className="ops-donut-block">
            {pmWeekOk ? (
              <>
                <div className="ops-donut-title">Звіти за цей тиждень: {pm.weekDone} з {pm.weekTotal}</div>
                <DonutChart slices={[
                  { label: 'Подано', value: pm.weekDone, color: '#1E9E5D' },
                  { label: 'Не подано', value: Math.max(pm.weekTotal - pm.weekDone, 0), color: '#D14343' },
                ]} />
              </>
            ) : (
              <p className="sec-empty">Немає активних проєктів.</p>
            )}
          </div>
        </div>

        <div className="ops-dept-card">
          <div className="ops-dept-head"><DeptIcon icon={IC.deptAutomation} />Automation Department</div>
          <DeptReminders items={automation.reminders} />
          <div className="ops-status-row">
            <StatusBox
              label={yesterdayLabel}
              badge={<span className={'ops-badge ' + (automation.yesterday.total > 0 && automation.yesterday.done === automation.yesterday.total ? 'yes' : 'no')}>{automation.yesterday.done} / {automation.yesterday.total}</span>}
              to="/automation/tasks/daily"
            />
            <StatusBox
              label="Сьогодні"
              badge={<span className={'ops-badge ' + (automation.today.total > 0 && automation.today.done === automation.today.total ? 'yes' : 'no')}>{automation.today.done} / {automation.today.total}</span>}
              to="/automation/tasks/daily"
            />
          </div>
          <div className="ops-donut-block">
            {automationWeekOk ? (
              <>
                <div className="ops-donut-title">Задачі за цей тиждень: {automation.week.done} з {automation.week.total} виконано</div>
                <DonutChart slices={[
                  { label: 'Виконано', value: automation.week.done, color: '#1E9E5D' },
                  { label: 'Не виконано', value: automation.week.pending, color: '#D14343' },
                  { label: 'Перенесено', value: automation.week.moved, color: '#B8860B' },
                  { label: 'Скасовано', value: automation.week.cancelled, color: '#6B2FA0' },
                ]} />
              </>
            ) : (
              <p className="sec-empty">На цей тиждень задач ще немає.</p>
            )}
          </div>
        </div>

        <div className="ops-dept-card">
          <div className="ops-dept-head"><DeptIcon icon={IC.clients} />Team</div>
          <div className="ops-status">
            <div className="ops-status-label">Відсутні сьогодні</div>
            <span className={'ops-badge ' + (team.outToday.length ? 'no' : 'yes')}>{team.outToday.length ? team.outToday.join(', ') : 'Всі на місці'}</span>
            <Link to="/team/calendar" className="btn">Переглянути</Link>
          </div>
          <div className="ops-donut-block">
            {teamMonthOk ? (
              <>
                <div className="ops-donut-title">Відпустки цього місяця: {team.vacationCount + team.sickCount}</div>
                <DonutChart slices={[
                  { label: 'Відпустка', value: team.vacationCount, color: '#6B2FA0' },
                  { label: 'Лікарняний', value: team.sickCount, color: '#D14343' },
                ]} />
              </>
            ) : (
              <p className="sec-empty">Цього місяця відпусток і лікарняних ще не було.</p>
            )}
          </div>
        </div>

        <div className="ops-dept-card">
          <div className="ops-dept-head"><DeptIcon icon={IC.deptTools} />Tools</div>
          <div className="ops-status-row">
            <div className="ops-status">
              <div className="ops-status-label">Сьогодні</div>
              <span className="ops-badge yes">{tools.followupToday + tools.imageToday}</span>
              <div className="ops-status-sub">{tools.followupToday} follow-up &middot; {tools.imageToday} зображень</div>
            </div>
          </div>
          <div className="ops-donut-block">
            {toolsWeekOk ? (
              <>
                <div className="ops-donut-title">Активність за тиждень: {tools.followupWeek + tools.imageWeek}</div>
                <DonutChart slices={[
                  { label: 'Follow-up Generator', value: tools.followupWeek, color: '#6B2FA0' },
                  { label: 'Image Studio', value: tools.imageWeek, color: '#E8A33D' },
                ]} />
              </>
            ) : (
              <p className="sec-empty">Цього тижня активності ще не було.</p>
            )}
          </div>
          <div className="ops-tools-links">
            <Link to="/tools/followup" className="btn">Follow-up Generator</Link>
            <Link to="/tools/image-studio" className="btn">Image Studio</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
