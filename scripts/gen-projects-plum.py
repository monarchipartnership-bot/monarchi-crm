import re, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
SRC = r'D:\Monarchi\Monarchi CRM\app\src\styles'
FILES = ['projectsPage.css', 'projectsFolder.css']
PREFIX = '.projects-page.folder-design.is-plum'

# colour map (case-insensitive hex -> dark value), split by role
BG_SOFT = 'rgba(255, 255, 255, .06)'
BG_CARD = 'rgba(255, 255, 255, .04)'
LINE = 'rgba(235, 156, 239, .3)'
TXT = '#F6E9FA'; SEC = '#D6AEE0'
HEX = {}
def add(vals, to):
    for v in vals.split():
        HEX[v.lower()] = to
add('#270827 #1a0a1f #2b1230 #3a1f3f', TXT)
add('#883288 #682768 #6b4a73 #7a5a85 #9a7aa3 #a77fb0 #7a2e7a #8b5a93 #8a6a98 #7a5a84 #6a6577', SEC)
add('#661466 #882888 #b544b5 #ae40ae', '#EB9CEF')
add('#168a3a #1f9d55 #14532d #12a144 #1b7a45', '#4BE07F')
add('#946200 #b7700a #78350f #8a5a00 #a16207', '#FBBF24')
add('#c23232 #9b2222 #8a1c1c #b42318 #c2352f', '#FF8A8A')
add('#1a56a8 #2a5fb0 #1d4ed8 #2563eb', '#7FB2FF')
add('#ebc6eb #eadcf0 #ebd0f2 #e1b8e6 #f0ddf0 #d9a6df #ddefe2 #e3e1ea #e4c3eb #d9c6df #ead0ee #e8d4ec #edd6f1', LINE)
add('#fff #ffffff #fefbfe #fdf9fe #faf7fb #fcf9fd #fbf7fc', BG_SOFT)
add('#f9edf9 #f3e3f7 #f6eaf8 #fbf3fc #f6eef8 #efe6f3 #f3eef6 #fbf4fc #f8f2fa #f6edf8 #f3e7f6 #f5ecf7 #faf0fb', BG_SOFT)
add('#f1dcf5 #ebd0f2', 'rgba(235, 156, 239, .16)')
add('#e3f6e8 #dcfce7 #e8f7ee #f4fbf6', 'rgba(75, 224, 127, .16)')
add('#fbf0d5 #fffbeb #fef3c7', 'rgba(251, 191, 36, .16)')
add('#fbeaea #fdecec #fdf0f0', 'rgba(255, 138, 138, .16)')
add('#e4eefb #e8f1fd #eaf2ff', 'rgba(127, 178, 255, .16)')
add('#e5e7eb #eadff0 #e3d2ea #e8cdee #e3cbf0 #d8c4e4 #cdb1dd #ddd6fe #ecebf1 #e3d2ea', LINE)
add('#f3f4f6 #f7f6fa #f3edf7 #f3eef8 #f7f1fa #f8f4fc #fbf5fd #fbf7fd #fbf8fc #f3e8f9 #ede9fe', BG_SOFT)
add('#e6f4ec #f1fbf4 #fbfffc', 'rgba(75, 224, 127, .16)')
add('#cdefd6 #8fdda9', 'rgba(75, 224, 127, .4)')
add('#146b32 #166534 #16a34a #1e7a4d', '#4BE07F')
add('#fff1d6 #fbf0da #fde68a', 'rgba(251, 191, 36, .16)')
add('#7a4a00 #7a5200 #92400e #96610a #9a5b00 #b7791f #b86e00', '#FBBF24')
add('#e7eefb #e8f0fe', 'rgba(127, 178, 255, .16)')
add('#1d4fb3 #2b58a8', '#7FB2FF')
add('#ebc3c0', 'rgba(255, 138, 138, .35)')
add('#b3261e #d9534f #dc2626', '#FF8A8A')
add('#4a2a66 #5b21b6 #7a5a7d #9a7aa5 #5c5870 #4b5563', SEC)
add('#702094 #9225bd #b83ed4 #882e88', '#EB9CEF')
add('#8e2e93', '#EB9CEF')
add('#a98bb3', SEC)
add('#d92d2d #ff7a7a', '#FF8A8A')
add('#e58a8a', 'rgba(255, 138, 138, .5)')
add('#e6d7ea', LINE)
add('#e9f7ef', 'rgba(75, 224, 127, .16)')
add('#f6e8f9', BG_SOFT)
add('#fbf3df', 'rgba(251, 191, 36, .16)')
add('#fde6a8', 'rgba(251, 191, 36, .4)')
ACCENT = {'#661466', '#882888', '#b544b5', '#ae40ae', '#702094', '#9225bd', '#b83ed4', '#882e88'}
VARS = {'var(--ink)': TXT, 'var(--ink-soft)': SEC, 'var(--muted)': SEC}

P1 = re.compile(r'linear-gradient\(\s*(?:#fff|#ffffff)\s*,\s*(?:#fff|#ffffff)\s*\)\s*padding-box\s*,\s*linear-gradient\([^)]*\)\s*border-box', re.I)
unknown = set()
FILTER = {'projectHub.css': r'\.(prep-|ph-|bld-|wb|rw-|arc-|rg-|ch-|ds-|pk-field|picker|pf\b|empty-hint|report-section|pw-card|pw-notice|hub-title)'}
CUR = ['']

def map_value(prop, val):
    orig = val
    extra = []
    if P1.search(val):
        val = P1.sub(BG_CARD, val)
        extra.append(('border-color', 'rgba(235, 156, 239, .28)'))
    # shadows
    if 'shadow' in prop:
        val = re.sub(r'#68276[0-9a-f]{1,3}\b', 'rgba(0, 0, 0, .4)', val, flags=re.I)
        val = re.sub(r'#2708276[0-9a-f]\b', 'rgba(0, 0, 0, .5)', val, flags=re.I)
    def rep(m):
        h = m.group(0)
        key = h.lower()
        if key in HEX:
            to = HEX[key]
            if prop.startswith('background') and 'gradient' in orig and key in ACCENT: return h
            # text on gradients stays white
            return to
        if len(key) in (4, 7):
            unknown.add(key)
        return h
    # colour keyword / hex replace; text colours: '#fff' as color must stay white
    if prop == 'color':
        val = re.sub(r'#[0-9a-fA-F]{3,8}\b', lambda m: m.group(0) if m.group(0).lower() in ('#fff', '#ffffff') else rep(m), val)
    elif prop in ('fill', 'stroke'):
        val = re.sub(r'#[0-9a-fA-F]{3,8}\b', lambda m: m.group(0) if m.group(0).lower() in ('#fff', '#ffffff') else rep(m), val)
    elif prop.startswith('background') and 'gradient' in val:
        # gradients with light stops: soften all stops
        val = re.sub(r'#[0-9a-fA-F]{3,8}\b', rep, val)
    else:
        val = re.sub(r'#[0-9a-fA-F]{3,8}\b', rep, val)
    for k, v in VARS.items():
        val = val.replace(k, v)
    return val, extra, (val != orig)

def split_decls(body):
    out = []; cur = ''; depth = 0
    for ch in body:
        if ch == '(': depth += 1
        elif ch == ')': depth -= 1
        if ch == ';' and depth == 0:
            if cur.strip(): out.append(cur.strip())
            cur = ''
        else: cur += ch
    if cur.strip(): out.append(cur.strip())
    return out

def scope(sel):
    parts = [p.strip() for p in re.split(r',(?![^(]*\))', sel)]
    res = []
    for p in parts:
        q = p
        for lead in ('.projects-page.folder-design', '.projects-page', '.folder-design'):
            if q.startswith(lead):
                q = q[len(lead):].strip(); break
        res.append(PREFIX + (' ' + q if q else ''))
    return ', '.join(res)

def parse(css):
    css = re.sub(r'/\*.*?\*/', '', css, flags=re.S)
    i = 0; rules = []
    def block(i, ctx):
        out = []
        while i < len(css):
            j = css.find('{', i)
            k = css.find('}', i)
            if k != -1 and (j == -1 or k < j):
                return out, k + 1
            if j == -1: break
            head = css[i:j].strip()
            if head.startswith('@media') or head.startswith('@supports'):
                inner, i = block(j + 1, head)
                out.append(('at', head, inner))
            elif head.startswith('@keyframes') or head.startswith('@font-face'):
                depth = 1; i2 = j + 1
                while depth and i2 < len(css):
                    depth += (css[i2] == '{') - (css[i2] == '}'); i2 += 1
                i = i2
            else:
                e = css.find('}', j)
                out.append(('rule', head, css[j + 1:e]))
                i = e + 1
        return out, i
    return block(0, None)[0]

def emit(items, indent=''):
    lines = []
    for it in items:
        if it[0] == 'at':
            inner = emit(it[2], indent + '  ')
            if inner: lines.append(f'{indent}{it[1]} {{\n' + '\n'.join(inner) + f'\n{indent}}}')
        else:
            sel, body = it[1], it[2]
            if re.search(r'\.(modal|proj-modal|pmh-|pf\b|pf-|svc-opt|status-btn)', sel) or sel.startswith('@'): continue
            if FILTER.get(CUR[0]) and not re.search(FILTER[CUR[0]], sel): continue
            decls = []
            for d in split_decls(body):
                if ':' not in d: continue
                prop, val = d.split(':', 1)
                prop = prop.strip(); val = val.strip()
                new, extra, changed = map_value(prop, val)
                if changed:
                    decls.append(f'{prop}: {new}')
                    for ep, ev in extra: decls.append(f'{ep}: {ev}')
            if decls and scope(sel) != PREFIX:
                lines.append(f'{indent}{scope(sel)} {{ ' + '; '.join(decls) + '; }')
    return lines

out = ['/* GENERATED dark plum overrides for the main page «Проєкти» (owner\'s picks 2026-11-12). Made by scratchpad/gen_dark.py from builderHub, composeHub, historyHub, workbenchHub, projectReports and projectHistory: every light colour is mapped to the plum palette; edit by hand below the marker «HAND-MADE». Scoped to .pw-rep. */']
for f in FILES:
    css = open(SRC + '\\' + f, encoding='utf-8').read()
    CUR[0] = f
    out.append(f'/* ---- {f} ---- */')
    out += emit(parse(css))
open(SRC + r'\projectsPlum.generated.css', 'w', encoding='utf-8').write('\n'.join(out) + '\n')
print('rules:', len(out), 'unknown colours:', sorted(unknown))
