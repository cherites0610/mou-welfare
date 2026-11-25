#!/usr/bin/env python3
"""Generate mou-welfare v2 diagrams (diagram-design skill, 哞福利 skin)."""
import sys, unicodedata, math
from pathlib import Path

OUT = Path(sys.argv[1] if len(sys.argv) > 1 else '.')

# ---- skin (references/style-guide.md, mou-welfare profile) ----
PAPER = '#f7f7f5'
INK = '#1f2328'; INK_RGB = '31,35,40'
MUTED = '#5c6366'; MUTED_RGB = '92,99,102'
SOFT = '#6b7280'; SOFT_RGB = '107,114,128'
ACCENT = '#5d7a00'; ACCENT_RGB = '93,122,0'
LINK = '#2a6db0'
SANS = "'Geist', 'Noto Sans TC', 'PingFang TC', 'Microsoft JhengHei', sans-serif"
MONO = "'Geist Mono', ui-monospace, monospace"

def ink(a): return f'rgba({INK_RGB},{a})'

def is_wide(ch):
    return unicodedata.east_asian_width(ch) in ('W', 'F')

def text_w(s, size, mono=False, spacing=0.0):
    w = 0.0
    for ch in s:
        if unicodedata.combining(ch):
            continue
        w += size if is_wide(ch) else size * (0.62 if mono else 0.60)
        w += spacing * size
    return w

def up4(v): return int(math.ceil(v / 4.0) * 4)

def has_cjk(s): return any(is_wide(c) for c in s)

TREAT = {
    'focal':    dict(fill=f'rgba({ACCENT_RGB},0.08)', stroke=ACCENT, tag_stroke=f'rgba({ACCENT_RGB},0.50)', tag_text=ACCENT),
    'backend':  dict(fill='#ffffff', stroke=INK, tag_stroke=ink(0.40), tag_text=INK),
    'store':    dict(fill=ink(0.05), stroke=MUTED, tag_stroke=f'rgba({MUTED_RGB},0.50)', tag_text=MUTED),
    'external': dict(fill=ink(0.03), stroke=ink(0.30), tag_stroke=ink(0.22), tag_text=SOFT),
    'input':    dict(fill=f'rgba({MUTED_RGB},0.10)', stroke=SOFT, tag_stroke=f'rgba({SOFT_RGB},0.40)', tag_text=SOFT),
}

class SVG:
    def __init__(self):
        self.zones, self.arrows, self.labels, self.nodes, self.legend = [], [], [], [], []

    # zones drawn first
    def zone(self, x, y, w, h, label, dashed=False):
        dash = ' stroke-dasharray="4,4"' if dashed else ''
        stroke = ink(0.20) if dashed else ink(0.10)
        self.zones.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="8" fill="{ink(0.02)}" stroke="{stroke}" stroke-width="0.8"{dash}/>')
        # label sits inside the zone (not on its border), so no mask is needed; Han switches register to 12px sans 500
        self.zones.append(f'<text x="{x+12}" y="{y+20}" fill="{SOFT}" font-size="12" font-weight="500" font-family="{SANS}">{label}</text>')

    def path(self, d, kind='muted', dashed=False):
        color, marker, sw = {'muted': (MUTED, 'arrow', 1.2), 'link': (LINK, 'arrow-link', 1.2), 'accent': (ACCENT, 'arrow-accent', 1.4)}[kind]
        dash = ''
        if dashed:
            dash, sw = ' stroke-dasharray="5,4"', 1
        self.arrows.append(f'<path d="{d}" fill="none" stroke="{color}" stroke-width="{sw}"{dash} marker-end="url(#{marker})"/>')

    def label(self, x, y, s, kind='muted'):
        """Arrow label; (x, y) = mask top-left. Latin mono 8px."""
        color = {'muted': SOFT, 'link': LINK, 'accent': ACCENT}[kind]
        w = up4(text_w(s, 8, mono=True, spacing=0.06) + 8)
        self.labels.append(f'<rect x="{x}" y="{y}" width="{w}" height="12" rx="2" fill="{PAPER}"/>')
        self.labels.append(f'<text x="{x + w/2:g}" y="{y+9}" fill="{color}" font-size="8" font-family="{MONO}" text-anchor="middle" letter-spacing="0.06em">{s}</text>')
        return w

    def _tag(self, x, y, tag, t):
        tw = up4(text_w(tag, 7, mono=True, spacing=0.08) + 10)
        self.nodes.append(f'<rect x="{x+8}" y="{y+6}" width="{tw}" height="12" rx="2" fill="transparent" stroke="{t["tag_stroke"]}" stroke-width="0.8"/>')
        self.nodes.append(f'<text x="{x+8+tw/2:g}" y="{y+15}" fill="{t["tag_text"]}" font-size="7" font-family="{MONO}" text-anchor="middle" letter-spacing="0.08em">{tag}</text>')

    def node(self, x, y, w, h, kind, tag, name, subs=()):
        t = TREAT[kind]
        n = self.nodes
        n.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="6" fill="{PAPER}"/>')
        n.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="6" fill="{t["fill"]}" stroke="{t["stroke"]}" stroke-width="1"/>')
        self._tag(x, y, tag, t)
        cx = x + w / 2
        lines = 1 + len(subs)
        block = 14 + 16 * len(subs)
        top = y + 18 + (h - 18 - block) / 2  # below tag strip
        ny = top + 11
        n.append(f'<text x="{cx:g}" y="{ny:g}" fill="{INK}" font-size="12" font-weight="600" font-family="{SANS}" text-anchor="middle">{name}</text>')
        for i, s in enumerate(subs):
            n.append(f'<text x="{cx:g}" y="{ny + 16*(i+1):g}" fill="{MUTED}" font-size="9" font-family="{MONO}" text-anchor="middle">{s}</text>')

    def infra(self, x, y, w, kind, tag, name, chips, badge=None):
        """Deployment node: tag, name, then 24px artifact chips (8px gap)."""
        h = 48 + 32 * len(chips) - 8 + 12
        t = TREAT[kind]
        n = self.nodes
        n.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="6" fill="{PAPER}"/>')
        n.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="6" fill="{t["fill"]}" stroke="{t["stroke"]}" stroke-width="1"/>')
        self._tag(x, y, tag, t)
        if badge:
            bw = up4(text_w(badge, 8, mono=True) + 12)
            n.append(f'<rect x="{x+w-8-bw}" y="{y+6}" width="{bw}" height="12" rx="2" fill="transparent" stroke="{t["tag_stroke"]}" stroke-width="0.8"/>')
            n.append(f'<text x="{x+w-8-bw/2:g}" y="{y+15}" fill="{t["tag_text"]}" font-size="8" font-family="{MONO}" text-anchor="middle">{badge}</text>')
        n.append(f'<text x="{x + w/2:g}" y="{y+38}" fill="{INK}" font-size="12" font-weight="600" font-family="{SANS}" text-anchor="middle">{name}</text>')
        cy = y + 48
        for cname, ver in chips:
            n.append(f'<rect x="{x+8}" y="{cy}" width="{w-16}" height="24" rx="4" fill="{ink(0.05)}" stroke="{MUTED}" stroke-width="0.8"/>')
            n.append(f'<text x="{x+16}" y="{cy+16}" fill="{INK}" font-size="12" font-family="{SANS}">{cname}</text>')
            n.append(f'<text x="{x+w-16}" y="{cy+16}" fill="{MUTED}" font-size="9" font-family="{MONO}" text-anchor="end">{ver}</text>')
            cy += 32
        return h

    def legend_strip(self, x0, x1, y, items):
        L = self.legend
        L.append(f'<line x1="{x0}" y1="{y}" x2="{x1}" y2="{y}" stroke="{ink(0.10)}" stroke-width="0.8"/>')
        L.append(f'<text x="{x0}" y="{y+16}" fill="{MUTED}" font-size="8" font-family="{MONO}" letter-spacing="0.18em">LEGEND</text>')
        x = x0
        iy = y + 32
        for kind, what, text in items:
            if kind == 'box':
                t = TREAT[what]
                dash = ''
                L.append(f'<rect x="{x}" y="{iy}" width="14" height="10" rx="2" fill="{t["fill"]}" stroke="{t["stroke"]}" stroke-width="1"{dash}/>')
                tx = x + 20
            else:
                color, marker, sw = {'muted': (MUTED, 'arrow', 1.2), 'link': (LINK, 'arrow-link', 1.2), 'accent': (ACCENT, 'arrow-accent', 1.4)}[what[0]]
                dash = ' stroke-dasharray="5,4"' if what[1] else ''
                if what[1]: sw = 1
                L.append(f'<line x1="{x}" y1="{iy+5}" x2="{x+28}" y2="{iy+5}" stroke="{color}" stroke-width="{sw}"{dash} marker-end="url(#{marker})"/>')
                tx = x + 36
            # Han legend text switches register: 12px sans 500
            L.append(f'<text x="{tx}" y="{iy+10}" fill="{MUTED}" font-size="12" font-weight="500" font-family="{SANS}">{text}</text>')
            x = up4(tx + text_w(text, 12) + 28)

    def body(self):
        return '\n'.join(['<!-- zones -->', *self.zones, '<!-- arrows -->', *self.arrows,
                          '<!-- arrow labels -->', *self.labels, '<!-- nodes -->', *self.nodes,
                          '<!-- legend -->', *self.legend])


def page(slug, eyebrow, title, desc, vb_w, vb_h, body, note):
    return f'''<!DOCTYPE html>
<html lang="zh-Hant-TW">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{title}</title>
  <link href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Geist:wght@400;500;600&family=Geist+Mono:wght@400;500;600&family=Noto+Serif:ital@0;1&family=Noto+Sans+TC:wght@400;500;600&family=Noto+Serif+TC:wght@400&display=swap" rel="stylesheet">
  <style>
    *, *::before, *::after {{ box-sizing: border-box; margin: 0; padding: 0; }}
    :root {{
      --color-paper:  {PAPER};
      --color-ink:    {INK};
      --color-muted:  {MUTED};
      --color-accent: {ACCENT};
      --font-sans:    'Geist', 'Noto Sans TC', 'PingFang TC', system-ui, sans-serif;
      --font-serif:   'Instrument Serif', 'Noto Serif', 'Noto Serif TC', serif;
      --font-mono:    'Geist Mono', ui-monospace, monospace;
    }}
    body {{
      font-family: var(--font-sans);
      background: var(--color-paper);
      color: var(--color-ink);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 3rem 2rem;
    }}
    .frame {{ max-width: {vb_w}px; width: 100%; min-width: 0; }}
    .diagram-container {{ width: 100%; overflow-x: auto; }}
    .eyebrow {{
      font-family: var(--font-mono);
      font-size: 0.66rem;
      font-weight: 500;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      color: var(--color-muted);
      margin-bottom: 0.5rem;
    }}
    h1 {{
      font-family: var(--font-serif);
      font-size: clamp(1.5rem, 2.4vw + 0.75rem, 2rem);
      font-weight: 400;
      letter-spacing: -0.02em;
      line-height: 1.15;
      color: var(--color-ink);
      margin-bottom: 1.5rem;
    }}
    .note {{ font-size: 0.8rem; color: var(--color-muted); margin-top: 1rem; line-height: 1.6; }}
    svg {{ width: 100%; min-width: {vb_w}px; display: block; }}
    @media print {{
      .diagram-container {{ overflow-x: visible; }}
      svg {{ min-width: 0; }}
    }}
  </style>
</head>
<body>
  <div class="frame">
    <p class="eyebrow">{eyebrow}</p>
    <h1>{title}</h1>
    <div class="diagram-container">
      <svg viewBox="0 0 {vb_w} {vb_h}" xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="{slug}-title {slug}-desc">
        <title id="{slug}-title">{title}</title>
        <desc id="{slug}-desc">{desc}</desc>
        <defs>
          <marker id="arrow" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto"><polygon points="0 0, 8 3, 0 6" fill="{MUTED}"/></marker>
          <marker id="arrow-accent" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto"><polygon points="0 0, 8 3, 0 6" fill="{ACCENT}"/></marker>
          <marker id="arrow-link" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto"><polygon points="0 0, 8 3, 0 6" fill="{LINK}"/></marker>
        </defs>
        <rect width="100%" height="100%" fill="{PAPER}"/>
{body}
      </svg>
    </div>
    <p class="note">{note}</p>
  </div>
</body>
</html>
'''


def architecture():
    s = SVG()
    D = 76  # horizontal offset to centre content on the 1280 canvas
    X = lambda v: v + D

    s.zone(X(232), 160, 280, 356, 'Cloudflare')
    s.zone(X(600), 160, 488, 356, '自有主機（騰訊雲東京）')

    # arrows
    s.path(f'M {X(176)},220 H {X(264)}', 'link')                                                       # user -> web
    s.path(f'M {X(176)},244 H {X(212)} Q {X(220)},244 {X(220)},252 V 296 Q {X(220)},304 {X(228)},304 H {X(264)}', 'link')  # user -> admin
    s.path(f'M {X(480)},232 H {X(552)} Q {X(560)},232 {X(560)},240 V 268 Q {X(560)},276 {X(568)},276 H {X(640)}', 'accent')  # web -> api
    s.path(f'M {X(480)},304 H {X(640)}', 'link')                                                       # admin -> api
    s.path(f'M {X(640)},332 H {X(592)} Q {X(584)},332 {X(584)},340 V 444 Q {X(584)},452 {X(576)},452 H {X(480)}', 'link')  # api -> r2
    s.path(f'M {X(864)},304 H {X(920)}', 'muted')                                                      # api -> pg
    s.path(f'M {X(816)},248 V 104', 'link')                                                            # api -> gemini
    s.path(f'M {X(716)},420 V 360', 'link')                                                            # scraper -> api
    s.path(f'M {X(176)},600 H {X(780)} Q {X(788)},600 {X(788)},592 V 360', 'link')                    # line -> api

    # labels
    s.label(X(202), 200, 'HTTPS', 'link')
    s.label(X(492), 212, 'SSR+CSR', 'accent')
    s.label(X(488), 284, '/V1/ADMIN', 'link')
    s.label(X(500), 432, 'S3 PUT', 'link')
    s.label(X(876), 284, 'SQL')
    s.label(X(824), 196, 'LLM · EMBED', 'link')
    s.label(X(628), 384, 'INGEST · HMAC', 'link')
    s.label(X(380), 580, 'WEBHOOK', 'link')

    # nodes
    s.node(X(40), 200, 136, 64, 'input', 'USER', '使用者', ['browser · LIFF'])
    s.node(X(40), 568, 136, 64, 'external', 'EXT', 'LINE Platform', ['Messaging API'])
    s.node(X(264), 200, 216, 64, 'backend', 'WORKER', '前台', ['Nuxt SSR · mou-welfare.com'])
    s.node(X(264), 272, 216, 64, 'backend', 'WORKER', '管理後台', ['Nuxt SPA · admin.mou-welfare.com'])
    s.node(X(264), 420, 216, 64, 'store', 'R2', '物件儲存', ['file.mou-welfare.com'])
    s.node(X(640), 248, 224, 112, 'focal', 'API', 'Hono API', ['api.mou-welfare.com', 'Caddy → :5030 · pg-boss'])
    s.node(X(920), 272, 136, 64, 'store', 'DB', 'Postgres 16', ['mou_welfare · :5432'])
    s.node(X(656), 420, 120, 64, 'backend', 'CRON', '爬蟲', ['Python · cron 3d'])
    s.node(X(736), 40, 160, 64, 'external', 'EXT', 'Gemini API', ['LLM · embedding'])

    s.legend_strip(X(40), X(1088), 656, [
        ('box', 'focal', '核心 API'), ('box', 'backend', '服務'), ('box', 'store', '儲存'),
        ('box', 'external', '外部服務'), ('box', 'input', '使用者'),
        ('line', ('accent', False), '主要請求'), ('line', ('link', False), 'HTTP 呼叫'), ('line', ('muted', False), '本機連線'),
    ])
    return page('mou-welfare-architecture', 'Architecture · 哞福利 v2', '哞福利 v2 系統架構',
                '哞福利 v2 的系統架構：前台與管理後台跑在 Cloudflare Workers，透過 HTTPS 呼叫自有主機上的 Hono API；API 連接 Postgres、Gemini 與 R2，並接收爬蟲推送與 LINE webhook。',
                1280, 720, s.body(),
                '未畫入：Resend 寄信、每日備份到 R2、GitHub Actions 自動部署（見部署圖）、規劃中的 Windows 爬蟲 agent。資料來源：docs/backend.md、docs/scraper.md（2026-11-25）。')


def deployment():
    s = SVG()
    s.zone(40, 256, 224, 148, 'GitHub')
    s.zone(320, 96, 592, 528, '自有主機（騰訊雲東京）', dashed=True)
    s.zone(968, 96, 272, 528, 'Cloudflare', dashed=True)

    # network paths
    s.path('M 152,296 V 80 Q 152,72 160,72 H 1096 Q 1104,72 1104,80 V 136', 'link')     # actions -> workers
    s.path('M 240,338 H 640', 'link')                                                     # actions -> pm2 (ssh)
    s.path('M 992,178 H 880', 'link')                                                     # workers -> caddy
    s.path('M 760,220 V 280')                                                             # caddy -> pm2
    s.path('M 760,396 V 456')                                                             # pm2 -> pg
    s.path('M 452,456 V 346 A 8,8 0 0,1 452,330 V 186 Q 452,178 460,178 H 640')          # cron -> caddy (hop over ssh)
    s.path('M 560,498 H 640')                                                             # cron -> pg
    s.path('M 452,572 V 592 Q 452,600 460,600 H 1096 Q 1104,600 1104,592 V 572', 'link', dashed=True)  # cron -> r2 backup

    s.label(640, 52, 'WRANGLER DEPLOY', 'link')
    s.label(276, 318, 'SSH · DEPLOY', 'link')
    s.label(904, 158, 'HTTPS:443', 'link')
    s.label(768, 244, 'HTTP:5030')
    s.label(768, 420, 'TCP:5432')
    s.label(460, 248, 'HTTPS INGEST')
    s.label(572, 478, 'PG_DUMP')
    s.label(700, 580, 'S3 · DAILY', 'link')

    s.infra(64, 296, 176, 'external', 'CI', 'GitHub Actions', [('deploy.yml', 'after ci')])
    s.infra(640, 136, 240, 'backend', 'PROXY', 'Caddy', [('api.mou-welfare.com', 'v2.11.9')])
    s.infra(640, 280, 240, 'focal', 'PM2', 'pm2', [('mou-welfare-v2-api', 'f401f15'), ('pg-boss worker', 'inline')], badge='x1')
    s.infra(640, 456, 240, 'store', 'DB', 'Postgres', [('mou_welfare', '16.15')])
    s.infra(344, 456, 216, 'backend', 'CRON', 'crontab', [('scrape-scheduled', '02:23'), ('mou-welfare-backup', '03:17')])
    s.infra(992, 136, 224, 'external', 'MANAGED', 'Workers', [('mou-welfare-web', 'SSR'), ('mou-welfare-admin', 'SPA')])
    s.infra(992, 456, 224, 'store', 'MANAGED', 'R2', [('mou-welfare-uploads', 'public'), ('mou-welfare-backups', '30d')])

    s.legend_strip(40, 1240, 652, [
        ('box', 'focal', '單點（唯一 API 程序）'), ('box', 'backend', '主機上的程序'), ('box', 'store', '資料'),
        ('box', 'external', '代管服務'),
        ('line', ('link', False), '跨區連線'), ('line', ('muted', False), '主機內連線'), ('line', ('link', True), '非同步／備份'),
    ])
    return page('mou-welfare-deployment', 'Deployment · 哞福利 v2', '哞福利 v2 部署',
                '哞福利 v2 的部署：GitHub Actions 透過 SSH 部署主機上的 pm2 API、以 wrangler 部署 Cloudflare Workers；主機上 Caddy 代理到 127.0.0.1:5030，API 連 Postgres，crontab 執行爬蟲與每日備份到 R2。',
                1280, 720, s.body(),
                'pm2 與 Postgres 只聽 localhost，對外只有 Caddy 的 443。版本為 2026-11-25 在主機上查得：部署 commit f401f15、Caddy v2.11.9、PostgreSQL 16.15、Node v24.22.3。')


OUT.mkdir(parents=True, exist_ok=True)
(OUT / 'mou-welfare-architecture.html').write_text(architecture())
(OUT / 'mou-welfare-deployment.html').write_text(deployment())
print('ok')
