import express from 'express';
import crypto from 'node:crypto';
import db from './db.mjs';
import { startBot, send, norm } from './bot.mjs';

db.exec('CREATE TABLE IF NOT EXISTS login_codes (token TEXT PRIMARY KEY, phone TEXT, code TEXT, created INTEGER DEFAULT (strftime(\'%s\',\'now\')))');

db.exec(`CREATE TABLE IF NOT EXISTS matches (
  id INTEGER PRIMARY KEY,
  worker_req INTEGER NOT NULL,
  contractor_req INTEGER NOT NULL,
  created INTEGER DEFAULT (strftime('%s','now')),
  UNIQUE(worker_req, contractor_req)
)`);

const ADMINS = (process.env.ADMIN_PHONES || '').split(',').map(norm).filter(Boolean);
const BOT = 'binaa_dz_bot';
const rnd = n => crypto.randomBytes(n).toString('hex');
const app = express();
app.use(express.json());
app.use(express.static('public'));

function newSession(phone) {
  const u = db.prepare('SELECT * FROM users WHERE phone=?').get(phone);
  const s = rnd(24);
  db.prepare('INSERT INTO sessions (token, user_id) VALUES (?,?)').run(s, u.id);
  return { session: s, role: ADMINS.includes(phone) ? 'admin' : u.role, name: u.name };
}

app.post('/api/login/start', async (req, res) => {
  const phone = norm(req.body.phone || '');
  const role = ['worker', 'contractor'].includes(req.body.role) ? req.body.role : 'worker';
  if (!/^0[567]\d{8}$/.test(phone)) return res.status(400).json({ error: 'رقم غير صالح' });
  db.prepare('INSERT OR IGNORE INTO users (phone, role, name, wilaya) VALUES (?,?,?,?)')
    .run(phone, role, req.body.name || '', req.body.wilaya || '');
  const token = rnd(8);
  const chat = db.prepare('SELECT chat_id FROM tg_chats WHERE phone=?').get(phone);
  if (chat) {
    const code = String(crypto.randomInt(100000, 999999));
    db.prepare('INSERT INTO login_codes (token, phone, code) VALUES (?,?,?)').run(token, phone, code);
    await send(chat.chat_id, 'Binaa: ' + code);
    return res.json({ mode: 'code', token });
  }
  db.prepare('INSERT INTO login_links (token, phone) VALUES (?,?)').run(token, phone);
  res.json({ mode: 'link', token, url: `https://t.me/${BOT}?start=${token}` });
});

app.get('/api/login/poll', (req, res) => {
  const l = db.prepare('SELECT * FROM login_links WHERE token=?').get(String(req.query.token));
  if (!l || !l.verified) return res.json({ ok: false });
  db.prepare('UPDATE login_links SET verified=2 WHERE token=? AND verified=1').run(l.token);
  res.json({ ok: true, ...newSession(norm(l.phone)) });
});

app.post('/api/login/verify', (req, res) => {
  const c = db.prepare('SELECT * FROM login_codes WHERE token=?').get(String(req.body.token));
  const fresh = c && Date.now() / 1000 - c.created < 300;
  if (!fresh || c.code !== String(req.body.code)) return res.status(400).json({ error: 'رمز خاطئ' });
  db.prepare('DELETE FROM login_codes WHERE token=?').run(c.token);
  res.json({ ok: true, ...newSession(c.phone) });
});

function auth(req, res, next) {
  const s = db.prepare('SELECT user_id FROM sessions WHERE token=?').get(req.get('x-session') || '');
  if (!s) return res.status(401).json({ error: 'سجّل الدخول' });
  req.user = db.prepare('SELECT * FROM users WHERE id=?').get(s.user_id);
  req.isAdmin = ADMINS.includes(norm(req.user.phone));
  next();
}
const admin = (req, res, next) => (req.isAdmin ? next() : res.status(403).json({ error: 'للمدير فقط' }));

app.post('/api/requests', auth, (req, res) => {
  const { specialty, wilaya, details } = req.body;
  if (!specialty) return res.status(400).json({ error: 'اختر التخصص' });
  const r = db.prepare('INSERT INTO requests (user_id, specialty, wilaya, details) VALUES (?,?,?,?)')
    .run(req.user.id, specialty, wilaya || '', details || '');
  res.json({ ok: true, id: Number(r.lastInsertRowid) });
});

app.get('/api/requests/mine', auth, (req, res) => {
  res.json(db.prepare('SELECT * FROM requests WHERE user_id=? ORDER BY id DESC').all(req.user.id));
});

app.get('/api/admin/requests', auth, admin, (req, res) => {
  res.json(db.prepare(`SELECT r.*, u.phone, u.name, u.role FROM requests r
    JOIN users u ON u.id=r.user_id ORDER BY r.id DESC`).all());
});

app.post('/api/admin/requests/:id', auth, admin, async (req, res) => {
  const st = req.body.status;
  if (!['approved', 'rejected'].includes(st)) return res.status(400).json({ error: 'حالة خاطئة' });
  db.prepare('UPDATE requests SET status=? WHERE id=?').run(st, req.params.id);
  const r = db.prepare('SELECT u.phone FROM requests r JOIN users u ON u.id=r.user_id WHERE r.id=?').get(req.params.id);
  const chat = r && db.prepare('SELECT chat_id FROM tg_chats WHERE phone=?').get(norm(r.phone));
  if (chat) await send(chat.chat_id, st === 'approved' ? '✅ تمت الموافقة على طلبك' : '❌ تم رفض طلبك');
  res.json({ ok: true });
});

// ===== ربط الطرفين =====
const reqWithUser = id => db.prepare(`SELECT r.*, u.phone, u.name, u.role FROM requests r
  JOIN users u ON u.id=r.user_id WHERE r.id=?`).get(id);

// المدير: طلبات مقبولة من الطرف الآخر بنفس التخصص (نفس الولاية أولاً)
app.get('/api/admin/requests/:id/candidates', auth, admin, (req, res) => {
  const r = reqWithUser(req.params.id);
  if (!r) return res.status(404).json({ error: 'الطلب غير موجود' });
  const other = r.role === 'worker' ? 'contractor' : 'worker';
  res.json(db.prepare(`SELECT r.*, u.phone, u.name, u.role FROM requests r
    JOIN users u ON u.id=r.user_id
    WHERE r.status='approved' AND u.role=? AND r.specialty=?
    ORDER BY (r.wilaya=?) DESC, r.id DESC`).all(other, r.specialty, r.wilaya));
});

// المدير: ربط طلب عامل بطلب مقاول (الأرقام لا تظهر إلا بعد هذا الربط)
app.post('/api/admin/match', auth, admin, async (req, res) => {
  const ra = reqWithUser(Number(req.body.a));
  const rb = reqWithUser(Number(req.body.b));
  if (!ra || !rb) return res.status(404).json({ error: 'طلب غير موجود' });
  if (ra.role === rb.role) return res.status(400).json({ error: 'اربط عاملاً بمقاول' });
  if (ra.status !== 'approved' || rb.status !== 'approved')
    return res.status(400).json({ error: 'اقبل الطلبين أولاً' });
  const w = ra.role === 'worker' ? ra : rb;
  const c = ra.role === 'worker' ? rb : ra;
  try {
    db.prepare('INSERT INTO matches (worker_req, contractor_req) VALUES (?,?)').run(w.id, c.id);
  } catch {
    return res.status(400).json({ error: 'هذان الطلبان مربوطان من قبل' });
  }
  const msg = (who, role) =>
    `🤝 تم ربطك ${role}\nالاسم: ${who.name || '-'}\nالهاتف: ${who.phone}\nالتخصص: ${who.specialty}`;
  for (const [to, other, role] of [[w, c, 'بمقاول'], [c, w, 'بعامل']]) {
    const chat = db.prepare('SELECT chat_id FROM tg_chats WHERE phone=?').get(norm(to.phone));
    if (chat) { try { await send(chat.chat_id, msg(other, role)); } catch {} }
  }
  res.json({ ok: true });
});

// المستخدم: الأطراف المربوطة به (الاسم والهاتف)
app.get('/api/matches/mine', auth, (req, res) => {
  const rows = db.prepare(`SELECT m.id, w.specialty, w.wilaya,
      wu.id AS wid, wu.name AS wname, wu.phone AS wphone,
      cu.id AS cid, cu.name AS cname, cu.phone AS cphone
    FROM matches m
    JOIN requests w ON w.id=m.worker_req JOIN users wu ON wu.id=w.user_id
    JOIN requests c ON c.id=m.contractor_req JOIN users cu ON cu.id=c.user_id
    WHERE wu.id=? OR cu.id=? ORDER BY m.id DESC`).all(req.user.id, req.user.id);
  res.json(rows.map(r => r.wid === req.user.id
    ? { id: r.id, specialty: r.specialty, wilaya: r.wilaya, with_role: 'contractor', name: r.cname, phone: r.cphone }
    : { id: r.id, specialty: r.specialty, wilaya: r.wilaya, with_role: 'worker', name: r.wname, phone: r.wphone }));
});

app.listen(process.env.PORT || 3000, () => console.log('server on', process.env.PORT || 3000));
startBot();
