import { useCallback, useEffect, useRef, useState } from 'react';

// Dictation in the browser (spec 2026-11-02: computer and phone, Ukrainian, Russian and English). It uses the speech recognition the browser itself has (Chrome and the
// browsers built on it, Safari with limits): nothing is sent to our server, the text appears in the field and the person can correct it. The language is chosen by the
// person (there is no detection inside one phrase). Not available in some browsers (Firefox): `supported` is then false and the screen hides the microphone.
export const SPEECH_LANGS = [{ key: 'uk', label: 'Українська', tag: 'uk-UA' }, { key: 'ru', label: 'Русский', tag: 'ru-RU' }, { key: 'en', label: 'English', tag: 'en-US' }];

const getRecognition = () => (typeof window === 'undefined' ? null : window.SpeechRecognition || window.webkitSpeechRecognition || null);

// onText(finalText): a finished piece of the phrase, to append to the field. The interim text (while speaking) is in `interim`.
export default function useSpeechInput({ lang = 'uk', onText } = {}) {
  const Recognition = getRecognition();
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const [error, setError] = useState('');
  const rec = useRef(null);
  const cb = useRef(onText);
  cb.current = onText;

  const stop = useCallback(() => { try { rec.current?.stop(); } catch { /* already stopped */ } }, []);

  const start = useCallback(() => {
    if (!Recognition) { setError('Цей браузер не вміє розпізнавати мову. Спробуйте Chrome.'); return; }
    setError(''); setInterim('');
    const r = new Recognition();
    r.lang = SPEECH_LANGS.find((l) => l.key === lang)?.tag || 'uk-UA';
    r.interimResults = true;
    r.continuous = true;
    r.onresult = (e) => {
      let live = '';
      for (let i = e.resultIndex; i < e.results.length; i += 1) {
        const res = e.results[i];
        if (res.isFinal) cb.current?.(res[0].transcript.trim()); else live += res[0].transcript;
      }
      setInterim(live);
    };
    r.onerror = (e) => {
      const map = { 'not-allowed': 'Дозвольте доступ до мікрофона в браузері.', 'service-not-allowed': 'Розпізнавання мови заборонене в цьому браузері.', 'no-speech': 'Нічого не чутно. Спробуйте ще раз.', 'audio-capture': 'Мікрофон не знайдено.', network: 'Немає звʼязку для розпізнавання мови.' };
      setError(map[e.error] || 'Не вдалося розпізнати мову.');
    };
    r.onend = () => { setListening(false); setInterim(''); };
    rec.current = r;
    try { r.start(); setListening(true); } catch { setError('Не вдалося увімкнути мікрофон.'); }
  }, [Recognition, lang]);

  useEffect(() => () => { try { rec.current?.abort(); } catch { /* gone */ } }, []);

  return { supported: !!Recognition, listening, interim, error, start, stop, toggle: () => (listening ? stop() : start()) };
}
