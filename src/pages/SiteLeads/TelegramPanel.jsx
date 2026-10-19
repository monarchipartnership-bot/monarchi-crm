import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ActionIcon from '../../components/common/ActionIcon';
import Select from '../../components/common/Select';
import { fetchTgChats, fetchTgMembers, setMemberPing, telegramChats, telegramMembers, telegramStatus, telegramTest } from '../../lib/api/siteLeads';
import { DEFAULT_TEMPLATE, PLACEHOLDERS, renderMessage, SAMPLE_LEAD } from '../../lib/siteLeadMessage';
import { fmtDateTime } from '../Smm/agentUi';

const INTERVALS = [15, 30, 60, 120, 240, 480].map((m) => ({ value: String(m), label: m < 60 ? `${m} хвилин` : m === 60 ? '1 година' : `${m / 60} ${m / 60 < 5 ? 'години' : 'годин'}` }));
const COUNTS = [1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: n === 1 ? '1 раз' : `${n} рази` }));

// Everything about the bot on one page block: is it alive, the chats, who is mentioned, the reminders and the form of the message.
export default function TelegramPanel({ settings, leads, patch, notify, busy }) {
  const [bot, setBot] = useState(null); // { tokenSet, ok, bot, webhook, chats, error } | { unreachable }
  const [seen, setSeen] = useState([]); // chats the bot has seen (tg_chats)
  const [found, setFound] = useState(null);
  const [manualChat, setManualChat] = useState('');
  const [members, setMembers] = useState({}); // chat id -> people
  const [openChat, setOpenChat] = useState(null);
  const [working, setWorking] = useState('');
  const [tpl, setTpl] = useState(settings.message_template ?? DEFAULT_TEMPLATE);
  const tplRef = useRef(null);

  const chats = settings.telegram_chat_ids || [];
  const refreshStatus = useCallback(() => telegramStatus().then(setBot).catch((e) => setBot({ unreachable: true, error: e.message })), []);
  useEffect(() => { refreshStatus(); fetchTgChats().then(setSeen); }, [refreshStatus]);
  useEffect(() => { setTpl(settings.message_template ?? DEFAULT_TEMPLATE); }, [settings.message_template]);

  const titleOf = (id) => seen.find((c) => c.chat_id === String(id))?.title || null;
  const lastSend = useMemo(() => leads.find((l) => l.telegram_status), [leads]);
  const pingsNow = (id) => (members[id] || []).filter((m) => m.ping).map((m) => (m.username ? '@' + m.username : m.name)).join(' ');
  const preview = useMemo(() => renderMessage(tpl, { ...SAMPLE_LEAD, time: '19.10, 10:30', returning: '', ping: openChat ? pingsNow(openChat) : '@anna_k' }), [tpl, openChat, members]); // eslint-disable-line react-hooks/exhaustive-deps
  const tplDirty = tpl !== (settings.message_template ?? DEFAULT_TEMPLATE);

  async function run(key, fn) { setWorking(key); try { await fn(); } catch (e) { notify(e.message || 'Не вдалося виконати.', true); } finally { setWorking(''); } }
  const addChat = (id, title) => { const c = String(id).trim(); if (!c) return; if (chats.includes(c)) { notify('Цей чат уже додано.', true); return; } patch({ telegram_chat_ids: [...chats, c] }, `Чат додано${title ? ': ' + title : ''}.`); setManualChat(''); };
  const removeChat = (c) => patch({ telegram_chat_ids: chats.filter((x) => x !== c) }, 'Чат прибрано.');
  const findChats = () => run('find', async () => { const r = await telegramChats(); setFound(r.chats || []); setSeen(await fetchTgChats()); if (!(r.chats || []).length) notify('Бот ще не бачив жодного чату: напишіть у чаті будь-що, наприклад /start@імʼя_бота.', true); });
  const openMembers = (id) => run('members' + id, async () => {
    if (openChat === id) { setOpenChat(null); return; }
    setMembers((m) => ({ ...m, [id]: m[id] || [] }));
    setOpenChat(id);
    const r = await telegramMembers(id);
    setMembers((m) => ({ ...m, [id]: r.members || [] }));
    if (r.adminsError) notify('Список адмінів не отримано: ' + r.adminsError, true);
  });
  const togglePing = (chatId, m) => run('ping' + m.user_id, async () => {
    await setMemberPing(chatId, m.user_id, !m.ping);
    setMembers((all) => ({ ...all, [chatId]: all[chatId].map((x) => (x.user_id === m.user_id ? { ...x, ping: !m.ping } : x)) }));
  });
  const test = (id) => run('test' + id, async () => { await telegramTest(id, { template: tpl, showButton: settings.show_button !== false }); notify('Тестове повідомлення надіслано: перевірте чат.'); });
  const insert = (key) => {
    const el = tplRef.current;
    const at = el ? el.selectionStart : tpl.length;
    const next = tpl.slice(0, at) + `{${key}}` + tpl.slice(el ? el.selectionEnd : at);
    setTpl(next);
    requestAnimationFrame(() => { if (el) { el.focus(); el.setSelectionRange(at + key.length + 2, at + key.length + 2); } });
  };

  return (
    <>
      <section className="smm-block">
        <h3>1. Telegram: бот і чати</h3>
        {!bot && <p className="smm-muted">Перевіряємо бота…</p>}
        {bot?.unreachable && <p className="smm-warn-banner" role="status">Не вдалося перевірити бота: {bot.error} Це не означає, що бота не підключено. Відкрийте цю сторінку на робочому сайті (crm.monarchi.agency): на локальному сервері серверні функції та токен бота недоступні.</p>}
        {bot && !bot.unreachable && !bot.tokenSet && (
          <div className="smm-warn-banner" role="status">
            <b>Бота ще не підключено.</b> Зробіть чотири кроки:
            <ol className="smm-howto">
              <li>У Telegram відкрийте <b>@BotFather</b>, надішліть <code>/newbot</code>, придумайте імʼя й скопіюйте токен.</li>
              <li>У Vercel: проєкт → Settings → Environment Variables → додайте <code>TELEGRAM_BOT_TOKEN</code> (Production) і перезапустіть деплой. Токен нікому не надсилайте, у чат теж.</li>
              <li>Додайте бота в потрібний чат чи групу й напишіть там будь-яке повідомлення.</li>
              <li>Поверніться сюди й натисніть «Знайти чати».</li>
            </ol>
          </div>
        )}
        {bot?.tokenSet && (
          <div className="smm-botstatus">
            <span className={'smm-dot ' + (bot.ok ? 'is-ok' : 'is-bad')} aria-hidden="true" />
            <div>
              <b>{bot.ok ? `Бот активний: @${bot.bot?.username}` : 'Бот не працює'}</b>
              <span className="smm-muted">
                {bot.ok
                  ? `Прийом подій Telegram: ${bot.webhook?.ok ? 'увімкнено' : 'не працює (' + (bot.webhook?.lastError || 'невідомо') + ')'}${bot.webhook?.justSet ? ' (щойно ввімкнено)' : ''}.`
                  : `Токен є, але Telegram його не прийняв: ${bot.error}`}
                {lastSend ? ` Останнє повідомлення: ${fmtDateTime(lastSend.received_at)}, ${lastSend.telegram_status === 'sent' ? 'доставлено' : lastSend.telegram_status === 'failed' ? 'не доставлено' : 'пропущено'}.` : ' Повідомлень ще не було.'}
              </span>
            </div>
            <button type="button" className="smm-btn" onClick={() => { setBot(null); refreshStatus(); }}>Оновити статус</button>
          </div>
        )}

        <div className="smm-list">
          {chats.map((c) => {
            const chk = bot?.chats?.[c];
            return (
              <div key={c} className="smm-row">
                <span className="smm-row-title"><b>{titleOf(c) || `Чат ${c}`}</b><span className="smm-muted">{c}{chk ? (chk.ok ? ' · бот у чаті' : ` · бота немає в чаті${chk.status ? ' (' + chk.status + ')' : ''}`) : ''}</span></span>
                <button type="button" className="smm-btn" onClick={() => openMembers(c)}>{openChat === c ? 'Сховати учасників' : 'Кого позначати'}</button>
                <button type="button" className="smm-btn" disabled={!bot?.ok || working === 'test' + c} onClick={() => test(c)}>{working === 'test' + c ? 'Надсилаємо…' : 'Надіслати тест'}</button>
                <button type="button" className="smm-btn smm-btn--danger" onClick={() => removeChat(c)}>Прибрати</button>
                {openChat === c && (
                  <div className="smm-row-note smm-members">
                    <p className="smm-muted">Позначені нижче люди отримують згадку в кожній новій заявці й нагадуванні, поки ви не приберете галочку.</p>
                    {(members[c] || []).length === 0 && <p className="smm-muted">Учасників ще немає. Telegram не віддає боту повний список групи: бот бачить адмінів і тих, хто щось написав у чаті. Попросіть людей написати в чаті будь-що й натисніть ще раз.</p>}
                    <div className="smm-people">
                      {(members[c] || []).map((m) => (
                        <label key={m.user_id} className="smm-check"><input type="checkbox" checked={!!m.ping} onChange={() => togglePing(c, m)} disabled={working === 'ping' + m.user_id} /> {m.name || m.username}{m.username ? ` (@${m.username})` : ''}{m.is_admin ? ' · адмін' : ''}</label>
                      ))}
                    </div>
                    <button type="button" className="smm-btn" disabled={working === 'members' + c} onClick={async () => { setOpenChat(null); await openMembers(c); }}>Оновити учасників</button>
                  </div>
                )}
              </div>
            );
          })}
          {!chats.length && <p className="smm-empty">Чатів ще немає: заявки приходитимуть лише в CRM.</p>}
        </div>
        <div className="smm-form-foot">
          <button type="button" className="smm-btn" disabled={!bot?.ok || working === 'find'} onClick={findChats}><ActionIcon name="search" size={18} />{working === 'find' ? 'Шукаємо…' : 'Знайти чати'}</button>
          <input className="smm-input-inline" type="text" value={manualChat} onChange={(e) => setManualChat(e.target.value)} placeholder="або вставте chat id, напр. -1001234567890" aria-label="Chat id" />
          <button type="button" className="smm-btn" disabled={!manualChat.trim()} onClick={() => addChat(manualChat)}>Додати</button>
        </div>
        {found && found.length > 0 && (
          <div className="smm-list">
            {found.map((c) => (
              <div key={c.id} className="smm-row">
                <span className="smm-row-title"><b>{c.title}</b><span className="smm-muted">{c.type} · {c.id}{c.bot_status && !['member', 'administrator'].includes(c.bot_status) ? ` · бот: ${c.bot_status}` : ''}</span></span>
                <button type="button" className="smm-btn smm-btn--primary" onClick={() => addChat(c.id, c.title)} disabled={chats.includes(c.id)}>{chats.includes(c.id) ? 'Додано' : 'Додати'}</button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="smm-block">
        <h3>2. Нагадування, якщо заявку ніхто не взяв</h3>
        <p className="smm-muted">Заявка вважається взятою, коли угоду переведено з етапу «Новий лід» (або її архівовано). Доки цього не сталося, бот нагадує в чаті відповіддю на початкове повідомлення й позначає вибраних людей. Перевірка йде кожні 15 хвилин, тому проміжок кратний 15.</p>
        <div className="smm-form">
          <label className="smm-switch smm-field--wide"><input type="checkbox" checked={!!settings.reminders_enabled} onChange={(e) => patch({ reminders_enabled: e.target.checked }, e.target.checked ? 'Нагадування увімкнено.' : 'Нагадування вимкнено.')} disabled={busy} /><span>{settings.reminders_enabled ? 'Нагадування увімкнено' : 'Нагадування вимкнено'}</span></label>
          <div className="smm-field"><label>Як часто нагадувати</label><Select value={String(settings.reminder_minutes || 30)} onChange={(v) => patch({ reminder_minutes: Number(v) }, 'Проміжок збережено.')} options={INTERVALS} ariaLabel="Проміжок нагадувань" /></div>
          <div className="smm-field"><label>Скільки разів</label><Select value={String(settings.reminder_max || 3)} onChange={(v) => patch({ reminder_max: Number(v) }, 'Кількість збережено.')} options={COUNTS} ariaLabel="Кількість нагадувань" /></div>
        </div>
      </section>

      <section className="smm-block">
        <h3>3. Форма повідомлення в чат</h3>
        <p className="smm-muted">Напишіть, як виглядатиме повідомлення. Місця з даними заявки вставляються кнопками нижче; рядок, у якому поле порожнє, зникає разом зі своєю підписом. З розмітки працюють лише <code>&lt;b&gt;</code> жирний, <code>&lt;i&gt;</code> курсив, <code>&lt;u&gt;</code>, <code>&lt;s&gt;</code>, <code>&lt;code&gt;</code>.</p>
        <div className="smm-tplgrid">
          <div className="smm-field">
            <label htmlFor="tpl">Шаблон</label>
            <textarea id="tpl" ref={tplRef} className="smm-code" rows={13} value={tpl} onChange={(e) => setTpl(e.target.value)} />
            <div className="smm-chips" role="group" aria-label="Вставити поле">
              {PLACEHOLDERS.map((p) => <button key={p.key} type="button" className="smm-chipbtn" onClick={() => insert(p.key)} title={`{${p.key}}`}>{p.label}</button>)}
            </div>
          </div>
          <div className="smm-field">
            <label>Так це виглядатиме в Telegram</label>
            <div className="smm-bubble" dangerouslySetInnerHTML={{ __html: preview }} />
            {settings.show_button !== false && <div className="smm-bubble-btn">Відкрити в CRM</div>}
          </div>
        </div>
        <label className="smm-check"><input type="checkbox" checked={settings.show_button !== false} onChange={(e) => patch({ show_button: e.target.checked }, e.target.checked ? 'Кнопку «Відкрити в CRM» показуємо.' : 'Кнопку «Відкрити в CRM» вимкнено.')} disabled={busy} /> Кнопка «Відкрити в CRM» під повідомленням</label>
        <div className="smm-form-foot">
          <button type="button" className="smm-btn smm-btn--primary" disabled={!tplDirty || busy} onClick={() => patch({ message_template: tpl.trim() === DEFAULT_TEMPLATE ? null : tpl }, 'Форму повідомлення збережено.')}><ActionIcon name="save" size={18} />Зберегти форму</button>
          <button type="button" className="smm-btn" onClick={() => setTpl(DEFAULT_TEMPLATE)}>Стандартна форма</button>
          {chats[0] && <button type="button" className="smm-btn" disabled={!bot?.ok || working === 'test' + chats[0]} onClick={() => test(chats[0])}>Надіслати тест у «{titleOf(chats[0]) || chats[0]}»</button>}
          {tplDirty && <span className="smm-muted">Є незбережені зміни</span>}
        </div>
      </section>
    </>
  );
}
