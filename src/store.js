import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { EventEmitter } from 'node:events';

export const events = new EventEmitter();

const SCHEMA = `
CREATE TABLE IF NOT EXISTS services (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, duration_min INTEGER NOT NULL, price TEXT);
CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY, phone TEXT UNIQUE, name TEXT, notes TEXT DEFAULT '',
  created_at TEXT NOT NULL, last_seen TEXT);
CREATE TABLE IF NOT EXISTS bookings (
  id TEXT PRIMARY KEY, customer_id TEXT NOT NULL REFERENCES customers(id),
  service_id TEXT NOT NULL REFERENCES services(id),
  start TEXT NOT NULL, end TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'confirmed',
  channel TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_bookings_start ON bookings(start);
`;

export const DEFAULT_SERVICES = [
  { id: 'consult', name: 'General consultation', duration_min: 30, price: '$60' },
  { id: 'physio', name: 'Physiotherapy session', duration_min: 60, price: '$95' },
  { id: 'checkup', name: 'Quick check-up', duration_min: 15, price: '$35' },
];

// Opening hours: Mon-Sat 09:00-17:00, closed Sunday. Slots every 15 min.
export const HOURS = { open: 9 * 60, close: 17 * 60, closedDays: [0], step: 15 };

// Normalize a phone number to digits with leading + (E.164-ish). Returns null if too short.
export function normalizePhone(p) {
  if (!p) return null;
  const s = String(p).trim();
  const digits = s.replace(/\D/g, '');
  if (digits.length < 6) return null;
  return '+' + digits;
}

// Napster memory needs ^[A-Za-z0-9_-]{1,32}$, so phones are hashed to a stable id.
export function memoryIdForPhone(phone) {
  const n = normalizePhone(phone);
  if (!n) return null;
  return 'c_' + crypto.createHash('sha256').update(n).digest('hex').slice(0, 24);
}

const pad = (n) => String(n).padStart(2, '0');
const toLocal = (d) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
const parseLocal = (s) => {
  const m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
  if (!m) return null;
  return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
};

export class Store {
  constructor(dbPath = ':memory:', { now = () => new Date() } = {}) {
    if (dbPath !== ':memory:') fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    this.db = new DatabaseSync(dbPath);
    this.db.exec('PRAGMA foreign_keys = ON;' + SCHEMA);
    this.now = now;
    const ins = this.db.prepare('INSERT OR IGNORE INTO services (id,name,duration_min,price) VALUES (?,?,?,?)');
    for (const s of DEFAULT_SERVICES) ins.run(s.id, s.name, s.duration_min, s.price);
  }

  services() { return this.db.prepare('SELECT * FROM services').all(); }
  service(id) {
    return this.db.prepare('SELECT * FROM services WHERE id = ? OR lower(name) = lower(?)').get(id, id) || null;
  }

  // ---- customers / memory ----
  lookupCustomer({ phone, customer_id } = {}) {
    let c = null;
    if (customer_id) c = this.db.prepare('SELECT * FROM customers WHERE id = ?').get(customer_id);
    const n = normalizePhone(phone);
    if (!c && n) c = this.db.prepare('SELECT * FROM customers WHERE phone = ?').get(n);
    if (!c) return { found: false };
    const history = this.db.prepare(
      `SELECT b.id, b.start, b.status, s.name AS service FROM bookings b JOIN services s ON s.id=b.service_id
       WHERE b.customer_id = ? ORDER BY b.start DESC LIMIT 5`).all(c.id);
    const nowS = toLocal(this.now());
    return {
      found: true,
      customer: { id: c.id, name: c.name, phone: c.phone, notes: c.notes },
      upcoming: history.filter((h) => h.status === 'confirmed' && h.start >= nowS),
      recent: history,
    };
  }

  upsertCustomer({ phone, name, notes }) {
    const n = normalizePhone(phone);
    if (!n) throw new BookingError('invalid_phone', 'A valid phone number is required.');
    const ts = this.now().toISOString();
    const existing = this.db.prepare('SELECT * FROM customers WHERE phone = ?').get(n);
    if (existing) {
      this.db.prepare('UPDATE customers SET name = COALESCE(?, name), notes = CASE WHEN ? IS NULL THEN notes ELSE trim(notes || char(10) || ?) END, last_seen = ? WHERE id = ?')
        .run(name || null, notes || null, notes || null, ts, existing.id);
      return this.db.prepare('SELECT * FROM customers WHERE id = ?').get(existing.id);
    }
    const id = memoryIdForPhone(n);
    this.db.prepare('INSERT INTO customers (id,phone,name,notes,created_at,last_seen) VALUES (?,?,?,?,?,?)')
      .run(id, n, name || null, notes || '', ts, ts);
    return this.db.prepare('SELECT * FROM customers WHERE id = ?').get(id);
  }

  // ---- availability ----
  isOpenSlot(start, durationMin, ignoreBookingId = null) {
    const d = parseLocal(start);
    if (!d) return false;
    if (d < this.now()) return false;
    if (HOURS.closedDays.includes(d.getDay())) return false;
    const mins = d.getHours() * 60 + d.getMinutes();
    if (mins < HOURS.open || mins + durationMin > HOURS.close || mins % HOURS.step) return false;
    const end = toLocal(new Date(d.getTime() + durationMin * 60000));
    const clash = this.db.prepare(
      `SELECT 1 FROM bookings WHERE status='confirmed' AND start < ? AND end > ? AND id IS NOT ?`)
      .get(end, toLocal(d), ignoreBookingId);
    return !clash;
  }

  checkAvailability({ date, service, limit = 6 } = {}) {
    const svc = this.service(service || 'consult');
    if (!svc) throw new BookingError('unknown_service', `Unknown service. Options: ${this.services().map((s) => s.name).join(', ')}`);
    let day = date ? parseLocal(`${date}T00:00`) : this.now();
    if (!day) throw new BookingError('invalid_date', 'Date must be YYYY-MM-DD.');
    const slots = [];
    // search up to 14 days ahead from the requested date
    for (let i = 0; i < 14 && slots.length < limit; i++) {
      const d = new Date(day.getFullYear(), day.getMonth(), day.getDate() + i);
      if (HOURS.closedDays.includes(d.getDay())) continue;
      for (let m = HOURS.open; m + svc.duration_min <= HOURS.close && slots.length < limit; m += HOURS.step * 2) {
        const s = toLocal(new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, m));
        if (this.isOpenSlot(s, svc.duration_min)) slots.push(s);
      }
      if (date && slots.length) break; // a specific date was asked: only show that (or next open) day
    }
    return { service: svc.name, service_id: svc.id, duration_min: svc.duration_min, price: svc.price, slots };
  }

  // ---- bookings ----
  book({ phone, name, service, start, channel = 'web', notes }) {
    const svc = this.service(service || 'consult');
    if (!svc) throw new BookingError('unknown_service', 'Unknown service.');
    if (!this.isOpenSlot(start, svc.duration_min)) {
      throw new BookingError('slot_unavailable', 'That time is not available.', this.checkAvailability({ date: String(start).slice(0, 10), service: svc.id }).slots);
    }
    const c = this.upsertCustomer({ phone, name, notes });
    const d = parseLocal(start);
    const id = 'BK-' + crypto.randomBytes(3).toString('hex').toUpperCase();
    const ts = this.now().toISOString();
    this.db.prepare(`INSERT INTO bookings (id,customer_id,service_id,start,end,status,channel,created_at,updated_at)
      VALUES (?,?,?,?,?,'confirmed',?,?,?)`).run(id, c.id, svc.id, toLocal(d), toLocal(new Date(d.getTime() + svc.duration_min * 60000)), channel, ts, ts);
    const b = this.get(id);
    events.emit('change', { type: 'booked', booking: b });
    return b;
  }

  get(id) {
    return this.db.prepare(`SELECT b.*, s.name AS service, c.name AS customer_name, c.phone FROM bookings b
      JOIN services s ON s.id=b.service_id JOIN customers c ON c.id=b.customer_id WHERE b.id = ?`).get(String(id || '').toUpperCase()) || null;
  }

  _own(id, phone) {
    const b = this.get(id);
    if (!b) throw new BookingError('not_found', 'No booking with that reference.');
    const n = normalizePhone(phone);
    if (n && b.phone !== n) throw new BookingError('not_owner', 'That booking belongs to a different phone number.');
    if (b.status !== 'confirmed') throw new BookingError('not_active', `Booking is already ${b.status}.`);
    return b;
  }

  reschedule({ booking_id, new_start, phone }) {
    const b = this._own(booking_id, phone);
    const svc = this.service(b.service_id);
    if (!this.isOpenSlot(new_start, svc.duration_min, b.id)) {
      throw new BookingError('slot_unavailable', 'That new time is not available.', this.checkAvailability({ date: String(new_start).slice(0, 10), service: svc.id }).slots);
    }
    const d = parseLocal(new_start);
    this.db.prepare('UPDATE bookings SET start=?, end=?, updated_at=? WHERE id=?')
      .run(toLocal(d), toLocal(new Date(d.getTime() + svc.duration_min * 60000)), this.now().toISOString(), b.id);
    const nb = this.get(b.id);
    events.emit('change', { type: 'rescheduled', booking: nb });
    return nb;
  }

  cancel({ booking_id, phone }) {
    const b = this._own(booking_id, phone);
    this.db.prepare("UPDATE bookings SET status='cancelled', updated_at=? WHERE id=?").run(this.now().toISOString(), b.id);
    const nb = this.get(b.id);
    events.emit('change', { type: 'cancelled', booking: nb });
    return nb;
  }

  list({ from } = {}) {
    return this.db.prepare(`SELECT b.*, s.name AS service, c.name AS customer_name, c.phone FROM bookings b
      JOIN services s ON s.id=b.service_id JOIN customers c ON c.id=b.customer_id
      WHERE b.start >= ? ORDER BY b.start`).all(from || '0000');
  }
}

export class BookingError extends Error {
  constructor(code, message, alternatives) { super(message); this.code = code; this.alternatives = alternatives; }
}
