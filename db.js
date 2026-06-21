const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'measurements.db');
const db = new Database(dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS measurements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source1_x REAL NOT NULL,
    source1_y REAL NOT NULL,
    source2_x REAL NOT NULL,
    source2_y REAL NOT NULL,
    point_x REAL NOT NULL,
    point_y REAL NOT NULL,
    frequency REAL NOT NULL,
    spl REAL NOT NULL,
    interference_type TEXT NOT NULL,
    created_at DATETIME DEFAULT (datetime('now', '+8 hours'))
  )
`);

function getUTC8Timestamp() {
  const now = new Date();
  const utc8 = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  return utc8.toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, '');
}

function isValidPoint(p) {
  return p && typeof p.x === 'number' && typeof p.y === 'number' &&
         Number.isFinite(p.x) && Number.isFinite(p.y);
}

function addMeasurement(data) {
  if (!isValidPoint(data.source1) || !isValidPoint(data.source2) || !isValidPoint(data.point)) {
    throw new Error('Invalid point data: coordinates must be finite numbers');
  }
  if (typeof data.frequency !== 'number' || !Number.isFinite(data.frequency) || data.frequency <= 0) {
    throw new Error('Invalid frequency');
  }
  if (typeof data.spl !== 'number' || !Number.isFinite(data.spl)) {
    throw new Error('Invalid SPL value');
  }
  if (typeof data.interferenceType !== 'string') {
    throw new Error('Invalid interference type');
  }

  const stmt = db.prepare(`
    INSERT INTO measurements
    (source1_x, source1_y, source2_x, source2_y, point_x, point_y, frequency, spl, interference_type, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const result = stmt.run(
    data.source1.x, data.source1.y,
    data.source2.x, data.source2.y,
    data.point.x, data.point.y,
    data.frequency, data.spl, data.interferenceType,
    getUTC8Timestamp()
  );
  return result.lastInsertRowid;
}

function getMeasurements(limit = 50) {
  const stmt = db.prepare(`
    SELECT * FROM measurements ORDER BY created_at DESC LIMIT ?`);
  return stmt.all(limit);
}

function getMeasurementById(id) {
  const stmt = db.prepare(`SELECT * FROM measurements WHERE id = ?`);
  return stmt.get(id);
}

function deleteMeasurement(id) {
  const stmt = db.prepare(`DELETE FROM measurements WHERE id = ?`);
  const result = stmt.run(id);
  return result.changes > 0;
}

function clearAllMeasurements() {
  const stmt = db.prepare(`DELETE FROM measurements`);
  const result = stmt.run();
  return result.changes;
}

function getStats() {
  const stmt = db.prepare(`SELECT COUNT(*) as count FROM measurements`);
  const result = stmt.get();
  return { count: result.count };
}

module.exports = {
  addMeasurement,
  getMeasurements,
  getMeasurementById,
  deleteMeasurement,
  clearAllMeasurements,
  getStats,
  db
};
