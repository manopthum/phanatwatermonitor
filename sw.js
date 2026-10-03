/* Service worker — ศูนย์ติดตามสถานการณ์น้ำพนัสนิคม
   หน้าเว็บและข้อมูล: ดึงจากเครือข่ายก่อนเสมอ (ข้อมูลสด) ถ้าออฟไลน์ใช้ชุดล่าสุดที่เก็บไว้
   ไฟล์คงที่ (ไอคอน, ไลบรารี): ใช้จากแคชได้ทันที */
const V = 'pn-v4';
const CORE = ['./', 'index.html', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'vendor/chart.umd.js'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(V).then(c => Promise.all(CORE.map(u => c.add(new Request(u, {cache: 'reload'})).catch(() => null)))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
const key = u => { const x = new URL(u); x.search = ''; x.hash = ''; return x.href; };
self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET') return;
  const u = new URL(r.url);
  if (u.origin !== location.origin || u.pathname.includes('/api/') || u.pathname.includes('/line/')) return;
  const isStatic = /\/(icons|vendor)\//.test(u.pathname) || u.pathname.endsWith('.webmanifest');
  if (isStatic) {
    e.respondWith(caches.match(key(r.url)).then(m => m || fetch(r).then(res => { if (res.ok) { const c = res.clone(); caches.open(V).then(ca => ca.put(key(r.url), c)); } return res; })));
    return;
  }
  const nav = r.mode === 'navigate';
  e.respondWith(fetch(r).then(res => {
    if (res.ok && (nav || /\/data\//.test(u.pathname) || u.pathname.endsWith('.html'))) {
      const c = res.clone(); caches.open(V).then(ca => ca.put(nav ? key(new URL('./', self.registration.scope).href) : key(r.url), c));
    }
    return res;
  }).catch(() => caches.match(nav ? key(new URL('./', self.registration.scope).href) : key(r.url)).then(m => m || (nav ? caches.match(key(new URL('index.html', self.registration.scope).href)) : null)).then(m => m || new Response('ออฟไลน์ — ยังไม่มีข้อมูลที่เก็บไว้', {status: 503, headers: {'Content-Type': 'text/plain; charset=utf-8'}}))));
});

/* แจ้งเตือนสถานการณ์น้ำ (Web Push) — แสดงได้แม้ปิดแอป */
self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (x) { d = {body: e.data ? e.data.text() : ''}; }
  const title = d.title || 'ศูนย์ติดตามสถานการณ์น้ำพนัสนิคม';
  e.waitUntil(self.registration.showNotification(title, {
    body: d.body || '', icon: 'icons/icon-192.png', badge: 'icons/favicon-64.png',
    tag: d.tag || 'pn-alert', renotify: true, lang: 'th', vibrate: [200, 100, 200],
    data: {url: new URL(d.url || './', self.registration.scope).href}
  }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || self.registration.scope;
  e.waitUntil(self.clients.matchAll({type: 'window', includeUncontrolled: true}).then(cs => {
    for (const c of cs) { if (c.url.startsWith(self.registration.scope) && 'focus' in c) { c.navigate && c.navigate(url).catch(() => {}); return c.focus(); } }
    return self.clients.openWindow(url);
  }));
});
