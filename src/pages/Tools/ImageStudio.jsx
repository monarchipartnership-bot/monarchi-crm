import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { initImageStudio } from './imageStudioEngine';
import { logActivity } from '../../lib/api/activityLog';
import '../../styles/imageStudioPage.css';

// Canvas editor for Upwork Project Catalog / Portfolio cover images (13
// templates, palette presets, PNG/JPEG export, drag & drop, localStorage
// autosave). The DOM below matches the element ids imageStudioEngine.js
// expects exactly; the engine (ported verbatim) does all the rendering,
// state, and event wiring once mounted.
export default function ImageStudio() {
  const navigate = useNavigate();
  const { email } = useAuth();

  useEffect(() => {
    return initImageStudio((info) => logActivity('image_studio', 'export', info, email));
  }, [email]);

  return (
    <div className="studio-page">
      <div id="app">
        <div className="page-actions">
          <button type="button" className="btn" onClick={() => navigate(-1)}>&#8592; Back</button>
          <span className="meta-line" id="metaLine">1000 &times; 750 &middot; Upwork Project Catalog</span>
          <div className="sp" />
          <button type="button" className="btn" id="pngBtn">&#8595; PNG</button>
          <button type="button" className="btn btn-p" id="jpgBtn">&#8595; JPEG</button>
        </div>

        <div className="studio-body">
          <aside className="side">
            <section>
              <div className="lbl">Format</div>
              <div className="fmt-grid" id="fmtGrid" />
            </section>

            <section id="templateSection" hidden>
              <div className="lbl">Template</div>
              <div className="cards" id="cards" />
            </section>

            <hr />

            <section>
              <div className="lbl">Palette <span className="hint">presets</span></div>
              <div className="presets" id="presets" />
              <button type="button" className="mini" id="resetColorsBtn" hidden>Reset to default colors</button>
            </section>

            <section>
              <div className="lbl">Colors</div>
              <div className="crow"><label>Background top</label><input type="color" id="cBgA" /></div>
              <div className="crow"><label>Background bottom</label><input type="color" id="cBgB" /></div>
              <div className="crow"><label>Glow</label><input type="color" id="cGlow" /></div>
              <div className="crow"><label>Accent (gold)</label><input type="color" id="cGold" /></div>
              <div className="crow"><label>Highlight (magenta)</label><input type="color" id="cMag" /></div>
            </section>

            <hr />

            <section>
              <div className="lbl">Kicker (small tag)</div>
              <input id="kicker" className="field" type="text" maxLength={42} />
            </section>

            <section>
              <div className="lbl">Title</div>
              <textarea id="title" className="field" rows={2} maxLength={90} />
            </section>

            <section>
              <div className="lbl">Subtitle</div>
              <textarea id="subtitle" className="field" rows={2} maxLength={140} />
            </section>

            <section>
              <div className="lbl">Metrics <span className="hint">(empty value = hidden)</span></div>
              <div className="mrow"><input id="m1v" className="field sm" placeholder="420%" /><input id="m1l" className="field" placeholder="Average ROAS" /></div>
              <div className="mrow"><input id="m2v" className="field sm" placeholder="100+" /><input id="m2l" className="field" placeholder="Projects scaled" /></div>
              <div className="mrow"><input id="m3v" className="field sm" placeholder="$1.5M+" /><input id="m3l" className="field" placeholder="Ad budget managed" /></div>
            </section>

            <hr />

            <section>
              <div className="lbl">Image</div>
              <div className="slot tall" id="imgSlot">
                <div className="slot-in"><span className="up">&#8679;</span><b>Main image</b><i>click or drop</i></div>
              </div>
              <button type="button" className="mini" id="imgClear" hidden>Remove image</button>
              <input id="imgFile" type="file" accept="image/*" hidden />
            </section>

            <hr />
            <button type="button" className="btn reset" id="resetBtn">Reset all to default</button>
            <div className="studio-foot">Auto-saved in your browser</div>
          </aside>

          <div className="stage">
            <div className="canvas-wrap">
              <canvas id="cv" />
              <div className="drophint">Drop an image on the canvas</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
