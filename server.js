const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const dbUrl = process.env.DATABASE_URL;
console.log('DATABASE_URL present:', !!dbUrl);
const pool = dbUrl
  ? new Pool({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } })
  : new Pool({ user: 'postgres', host: 'localhost', database: 'agile_db', password: 'jimmy', port: 5432 });
pool.on('error', (err) => console.error('Pool error:', err.message || JSON.stringify(err)));

// Create tables needed by the app if they don't exist
pool.query(`
  CREATE TABLE IF NOT EXISTS staff_service (
    id SERIAL PRIMARY KEY,
    staff_id INTEGER REFERENCES staff(staff_id) ON DELETE CASCADE,
    service_id INTEGER REFERENCES service(service_id) ON DELETE CASCADE,
    UNIQUE(staff_id, service_id)
  )
`).catch(err => console.error('staff_service init:', err.message));

pool.query(`
  CREATE TABLE IF NOT EXISTS audit_log (
    id SERIAL PRIMARY KEY,
    type VARCHAR(50),
    message TEXT,
    timestamp TIMESTAMPTZ DEFAULT NOW()
  )
`).catch(err => console.error('audit_log init:', err.message));

async function logAudit(type, message) {
  await pool.query('INSERT INTO audit_log (type, message) VALUES ($1, $2)', [type, message]);
}

// LOGIN
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  if (username === 'admin' && password === 'password') {
    res.json({ success: true });
  } else {
    res.status(401).json({ success: false, error: 'Invalid credentials' });
  }
});

// SERVICES
app.get('/api/services', async (req, res) => {
  try {
    const r = await pool.query('SELECT service_id AS id, service_name AS name, service_description AS description, service_pricing AS price, service_duration AS duration FROM service ORDER BY service_id');
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/services', async (req, res) => {
  const { name, description, price, duration } = req.body;
  try {
    const r = await pool.query('INSERT INTO service (service_name, service_description, service_pricing, service_duration) VALUES ($1,$2,$3,$4) RETURNING service_id AS id, service_name AS name, service_description AS description, service_pricing AS price, service_duration AS duration', [name, description, price, duration]);
    await logAudit('service', `Service added: ${name}`);
    res.json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/services/:id', async (req, res) => {
  const { name, description, price, duration } = req.body;
  try {
    const r = await pool.query('UPDATE service SET service_name=$1, service_description=$2, service_pricing=$3, service_duration=$4 WHERE service_id=$5 RETURNING service_id AS id, service_name AS name, service_description AS description, service_pricing AS price, service_duration AS duration', [name, description, price, duration, req.params.id]);
    await logAudit('updated', `Service updated: ${name}`);
    res.json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/services/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM service WHERE service_id=$1', [req.params.id]);
    await logAudit('service', `Service deleted (ID: ${req.params.id})`);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// STAFF (providers)
app.get('/api/staff', async (req, res) => {
  try {
    const r = await pool.query('SELECT staff_id AS id, staff_name AS name, staff_role AS qualifications, staff_email AS email FROM staff ORDER BY staff_id');
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/staff', async (req, res) => {
  const { name, qualifications, email } = req.body;
  try {
    const r = await pool.query('INSERT INTO staff (staff_name, staff_role, staff_email) VALUES ($1,$2,$3) RETURNING staff_id AS id, staff_name AS name, staff_role AS qualifications, staff_email AS email', [name, qualifications, email]);
    await logAudit('provider', `Staff added: ${name}`);
    res.json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/staff/:id', async (req, res) => {
  const { name, qualifications, email } = req.body;
  try {
    const r = await pool.query('UPDATE staff SET staff_name=$1, staff_role=$2, staff_email=$3 WHERE staff_id=$4 RETURNING staff_id AS id, staff_name AS name, staff_role AS qualifications, staff_email AS email', [name, qualifications, email, req.params.id]);
    await logAudit('updated', `Staff updated: ${name}`);
    res.json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/staff/:id', async (req, res) => {
  try {
    const s = await pool.query('SELECT staff_name FROM staff WHERE staff_id=$1', [req.params.id]);
    await pool.query('DELETE FROM staff WHERE staff_id=$1', [req.params.id]);
    await logAudit('provider', `Staff deleted: ${s.rows[0]?.staff_name || req.params.id}`);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// USERS
app.get('/api/users', async (req, res) => {
  try {
    const r = await pool.query('SELECT user_id AS id, user_name AS name, user_email AS email, user_phone AS phone, user_dob AS dob FROM users ORDER BY user_id');
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/users', async (req, res) => {
  const { name, email, phone, dob } = req.body;
  try {
    const r = await pool.query('INSERT INTO users (user_name, user_email, user_phone, user_dob) VALUES ($1,$2,$3,$4) RETURNING user_id AS id, user_name AS name, user_email AS email, user_phone AS phone, user_dob AS dob', [name, email, phone, dob || null]);
    await logAudit('provider', `User added: ${name}`);
    res.json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/users/:id', async (req, res) => {
  const { name, email, phone, dob } = req.body;
  try {
    const r = await pool.query('UPDATE users SET user_name=$1, user_email=$2, user_phone=$3, user_dob=$4 WHERE user_id=$5 RETURNING user_id AS id, user_name AS name, user_email AS email, user_phone AS phone, user_dob AS dob', [name, email, phone, dob || null, req.params.id]);
    await logAudit('updated', `User updated: ${name}`);
    res.json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/users/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM users WHERE user_id=$1', [req.params.id]);
    await logAudit('provider', `User deleted (ID: ${req.params.id})`);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ASSIGNMENTS (staff <-> service)
app.get('/api/assignments', async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT ss.id, ss.staff_id AS "providerId", ss.service_id AS "serviceId",
             st.staff_name AS "providerName", sv.service_name AS "serviceName"
      FROM staff_service ss
      JOIN staff st ON st.staff_id = ss.staff_id
      JOIN service sv ON sv.service_id = ss.service_id
      ORDER BY ss.id
    `);
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/assignments', async (req, res) => {
  const { serviceId, providerId } = req.body;
  try {
    const r = await pool.query('INSERT INTO staff_service (staff_id, service_id) VALUES ($1,$2) RETURNING id, staff_id AS "providerId", service_id AS "serviceId"', [providerId, serviceId]);
    await logAudit('approval', `Provider assigned to service`);
    res.json(r.rows[0]);
  } catch (e) {
    if (e.code === '23505') res.status(409).json({ error: 'Assignment already exists.' });
    else res.status(500).json({ error: e.message });
  }
});

app.delete('/api/assignments/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM staff_service WHERE id=$1', [req.params.id]);
    await logAudit('approval', `Assignment removed`);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ACTIVITY LOG
app.get('/api/activity', async (req, res) => {
  try {
    const r = await pool.query('SELECT id, type, message, to_char(timestamp, \'DD/MM/YYYY HH24:MI\') AS timestamp FROM audit_log ORDER BY timestamp DESC LIMIT 50');
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});


// REPORTS
app.get('/api/reports', async (req, res) => {
  try {
    const r = await pool.query(`SELECT report_id, referral_id, document_path, summary, to_char(sent_at, 'DD/MM/YYYY HH24:MI') AS sent_at FROM report ORDER BY sent_at DESC`);
    res.json(r.rows);
  } catch (e) { console.error('API Error:', e); res.status(500).json({ error: e.message || e.toString() }); }
});

app.post('/api/reports', async (req, res) => {
  const { referral_id, document_path, summary } = req.body;
  try {
    const r = await pool.query(
      'INSERT INTO report (referral_id, document_path, summary, sent_at) VALUES ($1,$2,$3,NOW()) RETURNING *',
      [referral_id, document_path, summary]
    );
    res.json(r.rows[0]);
  } catch (e) { console.error('API Error:', e); res.status(500).json({ error: e.message || e.toString() }); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
