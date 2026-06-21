const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const { splAtPoint, interferenceType, generateSpectrum, wavelength } = require('./utils/soundCalc');
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
    default:
      ws.send(JSON.stringify({ type: 'error', message: 'Unknown message type' }));
  }
}

function handleCalculateSpl(ws, message) {
  const { source1, source2, point, frequency } = message;

  if (!source1 || !source2 || !point || !frequency) {
    ws.send(JSON.stringify({ type: 'error', message: 'Missing required parameters' }));
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

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`WebSocket server ready`);
});
