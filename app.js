const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const { splAtPoint, interferenceType, generateSpectrum, wavelength, swrInRegion } = require('./utils/soundCalc');
const { addMeasurement, getMeasurements, getStats } = require('./db');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

app.get('/api/measurements', (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  const measurements = getMeasurements(limit);
  res.json({ measurements });
});

app.get('/api/stats', (req, res) => {
  const stats = getStats();
  res.json(stats);
});

app.get('/api/spectrum', (req, res) => {
  const freq = parseFloat(req.query.freq) || 440;
  const spectrum = generateSpectrum(freq);
  res.json({ spectrum });
});

app.get('/api/swr', (req, res) => {
  try {
    const s1x = parseFloat(req.query.s1x);
    const s1y = parseFloat(req.query.s1y);
    const s2x = parseFloat(req.query.s2x);
    const s2y = parseFloat(req.query.s2y);
    const freq = parseFloat(req.query.freq) || 440;
    const width = parseInt(req.query.width) || 800;
    const height = parseInt(req.query.height) || 600;
    const step = parseInt(req.query.step) || 10;

    if (isNaN(s1x) || isNaN(s1y) || isNaN(s2x) || isNaN(s2y)) {
      return res.status(400).json({ error: 'Invalid source coordinates' });
    }

    const result = swrInRegion(
      { x: s1x, y: s1y },
      { x: s2x, y: s2y },
      freq, width, height, step
    );

    res.json({
      swr: isFinite(result.swr) ? result.swr : null,
      maxPressure: result.maxPressure,
      minPressure: result.minPressure,
      maxSpl: result.maxSpl,
      minSpl: result.minSpl,
      validPoints: result.validPoints
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

wss.on('connection', (ws) => {
  console.log('New client connected');

  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data);
      handleMessage(ws, message);
    } catch (err) {
      console.error('Error parsing message:', err);
      ws.send(JSON.stringify({ type: 'error', message: 'Invalid JSON' }));
    }
  });

  ws.on('close', () => {
    console.log('Client disconnected');
  });
});

function handleMessage(ws, message) {
  switch (message.type) {
    case 'calculate_spl':
      handleCalculateSpl(ws, message);
      break;
    case 'get_spectrum':
      handleGetSpectrum(ws, message);
      break;
    case 'get_history':
      handleGetHistory(ws, message);
      break;
    case 'calculate_swr':
      handleCalculateSWR(ws, message);
      break;
    default:
      ws.send(JSON.stringify({ type: 'error', message: 'Unknown message type' }));
  }
}

function isValidPoint(p) {
  return p && typeof p.x === 'number' && typeof p.y === 'number' &&
         Number.isFinite(p.x) && Number.isFinite(p.y);
}

function handleCalculateSpl(ws, message) {
  try {
    const { source1, source2, point, frequency } = message;

    if (!source1 || !source2 || !point || !frequency) {
      ws.send(JSON.stringify({ type: 'error', message: 'Missing required parameters' }));
      return;
    }

    if (!isValidPoint(source1) || !isValidPoint(source2) || !isValidPoint(point)) {
      ws.send(JSON.stringify({ type: 'error', message: 'Invalid point coordinates' }));
      return;
    }

    if (typeof frequency !== 'number' || frequency <= 0 || !Number.isFinite(frequency)) {
      ws.send(JSON.stringify({ type: 'error', message: 'Invalid frequency' }));
      return;
    }

    const splValue = splAtPoint(source1, source2, point.x, point.y, frequency);
    const interference = interferenceType(source1, source2, point.x, point.y, frequency);
    const lambda = wavelength(frequency);

    const measurementData = {
      source1,
      source2,
      point,
      frequency,
      spl: splValue,
      interferenceType: interference
    };

    const id = addMeasurement(measurementData);

    ws.send(JSON.stringify({
      type: 'spl_result',
      id,
      spl: splValue,
      interferenceType: interference,
      wavelength: lambda,
      point,
      frequency
    }));
  } catch (err) {
    console.error('handleCalculateSpl error:', err.message);
    ws.send(JSON.stringify({ type: 'error', message: 'Calculation failed: ' + err.message }));
  }
}

function handleGetSpectrum(ws, message) {
  const freq = message.frequency || 440;
  const spectrum = generateSpectrum(freq);
  ws.send(JSON.stringify({
    type: 'spectrum_data',
    spectrum,
    baseFrequency: freq
  }));
}

function handleGetHistory(ws, message) {
  const limit = message.limit || 20;
  const measurements = getMeasurements(limit);
  ws.send(JSON.stringify({
    type: 'history_data',
    measurements
  }));
}

function handleCalculateSWR(ws, message) {
  try {
    const { source1, source2, frequency, width, height, step } = message;

    if (!isValidPoint(source1) || !isValidPoint(source2)) {
      ws.send(JSON.stringify({ type: 'error', message: 'Invalid source coordinates' }));
      return;
    }

    if (typeof frequency !== 'number' || frequency <= 0 || !Number.isFinite(frequency)) {
      ws.send(JSON.stringify({ type: 'error', message: 'Invalid frequency' }));
      return;
    }

    const w = width || 800;
    const h = height || 600;
    const s = step || 10;

    const result = swrInRegion(source1, source2, frequency, w, h, s);

    ws.send(JSON.stringify({
      type: 'swr_result',
      swr: isFinite(result.swr) ? result.swr : null,
      maxPressure: result.maxPressure,
      minPressure: result.minPressure,
      maxSpl: result.maxSpl,
      minSpl: result.minSpl,
      validPoints: result.validPoints
    }));
  } catch (err) {
    console.error('handleCalculateSWR error:', err.message);
    ws.send(JSON.stringify({ type: 'error', message: 'SWR calculation failed' }));
  }
}

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`WebSocket server ready`);
});
