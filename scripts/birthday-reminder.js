// Sends a birthday reminder email to every administrator.
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const nodemailer = require('nodemailer');

const MO = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const OWNER = (process.env.ADMIN_EMAIL || 'princemichael612@gmail.com').toLowerCase();
const AHEAD = parseInt(process.env.DAYS_AHEAD || '1', 10);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

(async () => {
  for (const k of ['FIREBASE_SERVICE_ACCOUNT', 'GMAIL_USER', 'GMAIL_APP_PASSWORD'])
    if (!process.env[k]) throw new Error('Missing secret: ' + k);

  initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
  const db = process.env.FIRESTORE_DATABASE_ID ? getFirestore(process.env.FIRESTORE_DATABASE_ID) : getFirestore();

  // Target date, in Lagos time
  const [y, mo, d] = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos' }).format(new Date()).split('-').map(Number);
  const t = new Date(Date.UTC(y, mo - 1, d + AHEAD));
  const tm = t.getUTCMonth() + 1, td = t.getUTCDate(), ty = t.getUTCFullYear();
  const leap = (ty % 4 === 0 && ty % 100 !== 0) || ty % 400 === 0;
  const hit = m => (+m.month === tm && +m.day === td) || (!leap && tm === 3 && td === 1 && +m.month === 2 && +m.day === 29);

  const members = (await db.collection('members').get()).docs.map(x => x.data()).filter(hit)
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));
  if (!members.length) { console.log('No birthdays for', td, MO[tm - 1], '- nothing to send.'); return; }

  const roles = await db.collection('roles').where('role', '==', 'admin').get();
  const admins = [...new Set([OWNER, ...roles.docs.map(x => x.id.toLowerCase())])];

  const when = AHEAD === 0 ? 'Today' : AHEAD === 1 ? 'Tomorrow' : `In ${AHEAD} days`;
  const dateLabel = `${t.toLocaleDateString('en-GB', { weekday: 'long', timeZone: 'UTC' })}, ${td} ${MO[tm - 1]} ${ty}`;
  const subject = `Birthday reminder: ${when} - ${members.length} YAYA member${members.length > 1 ? 's' : ''}`;

  const rows = members.map(m => `<tr><td style="padding:8px 12px;border-bottom:1px solid #dbe2f0"><b>${esc(m.name)}</b></td><td style="padding:8px 12px;border-bottom:1px solid #dbe2f0">${esc(m.cls)}</td><td style="padding:8px 12px;border-bottom:1px solid #dbe2f0">${esc(m.phone || '-')}</td></tr>`).join('');
  const html = `<div style="font-family:Segoe UI,Arial,sans-serif;max-width:560px;margin:auto;border:1px solid #dbe2f0;border-radius:12px;overflow:hidden">
<div style="background:#0b1f4d;color:#fff;padding:16px 20px;border-bottom:3px solid #c9a24b"><div style="font-size:18px;font-weight:700">YAYA Sunday School</div><div style="font-size:13px;color:#b9c6f0">RCCG LifeGate Parish - Birthday reminder</div></div>
<div style="padding:18px 20px;color:#0f1b3d"><p style="margin:0 0 12px"><b>${when}</b> (${dateLabel}) ${members.length > 1 ? 'these members celebrate' : 'this member celebrates'} a birthday:</p>
<table style="border-collapse:collapse;width:100%;font-size:14px"><tr style="background:#0b1f4d;color:#fff;text-align:left"><th style="padding:8px 12px">Name</th><th style="padding:8px 12px">Class</th><th style="padding:8px 12px">Phone</th></tr>${rows}</table>
<p style="color:#5b6685;font-size:12px;margin:16px 0 0">Automatic message from the YAYA Attendance &amp; Tracker.</p></div></div>`;
  const text = `${when} (${dateLabel}):\n` + members.map(m => `- ${m.name} (${m.cls}) ${m.phone || ''}`).join('\n');

  const mail = nodemailer.createTransport({ service: 'gmail', auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD } });
  await mail.sendMail({ from: `"YAYA Sunday School" <${process.env.GMAIL_USER}>`, to: admins.join(','), subject, html, text });
  console.log(`Sent to ${admins.length} admin(s): ${members.length} birthday(s).`);
})().catch(e => { console.error(e); process.exit(1); });
