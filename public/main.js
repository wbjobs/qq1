const SPEED_OF_SOUND = 343;

const canvas = document.getElementById('waveCanvas');
const ctx = canvas.getContext('2d');
const spectrumCanvas = document.getElementById('spectrumCanvas');
const spectrumCtx = spectrumCanvas.getContext('2d');

const frequencySlider = document.getElementById('frequency');
const distanceSlider = document.getElementById('sourceDistance');
const showWavesCheckbox = document.getElementById('showWaves');
const showInterferenceCheckbox = document.getElementById('showInterference');
const clickModeCheckbox = document.getElementById('clickMode');

const freqValueSpan = document.getElementById('freqValue');
const distValueSpan = document.getElementById('distValue');
const splDisplay = document.getElementById('splDisplay');
const interferenceDisplay = document.getElementById('interferenceDisplay');
const source1PosSpan = document.getElementById('source1Pos');
const source2PosSpan = document.getElementById('source2Pos');
const clickPosSpan = document.getElementById('clickPos');
const wavelengthSpan = document.getElementById('wavelength');
const wsStatusSpan = document.getElementById('wsStatus');
const historyList = document.getElementById('historyList');
const refreshHistoryBtn = document.getElementById('refreshHistory');

let frequency = 440;
let sourceDistance = 200;
let showWaves = true;
let showInterference = true;
let clickMode = true;

let source1 = { x: 0, y: 0 };
let source2 = { x: 0, y: 0 };
let clickPoint = null;
let time = 0;
let animationId = null;
let ws = null;
let spectrumData = [];

function init() {
  const centerX = canvas.width / 2;
  const centerY = canvas.height / 2;
  source1 = { x: centerX - sourceDistance / 2, y: centerY };
  source2 = { x: centerX + sourceDistance / 2, y: centerY };

  updateSourcePositions();
  updateWavelength();
  initWebSocket();
  generateInitialSpectrum();
  startAnimation();
  bindEvents();
  loadHistory();
}

function bindEvents() {
  frequencySlider.addEventListener('input', (e) => {
    frequency = parseFloat(e.target.value);
    freqValueSpan.textContent = frequency;
    updateWavelength();
    requestSpectrum();
  });

  distanceSlider.addEventListener('input', (e) => {
    sourceDistance = parseFloat(e.target.value);
    distValueSpan.textContent = sourceDistance;
    updateSourcePositions();
  });

  showWavesCheckbox.addEventListener('change', (e) => {
    showWaves = e.target.checked;
  });

  showInterferenceCheckbox.addEventListener('change', (e) => {
    showInterference = e.target.checked;
  });

  clickModeCheckbox.addEventListener('change', (e) => {
    clickMode = e.target.checked;
  });

  canvas.addEventListener('click', handleCanvasClick);
  canvas.addEventListener('mousemove', handleCanvasMove);
  refreshHistoryBtn.addEventListener('click', loadHistory);
}

function updateSourcePositions() {
  const centerX = canvas.width / 2;
  const centerY = canvas.height / 2;
  source1.x = centerX - sourceDistance / 2;
  source1.y = centerY;
  source2.x = centerX + sourceDistance / 2;
  source2.y = centerY;
  source1PosSpan.textContent = `(${Math.round(source1.x)}, ${Math.round(source1.y)})`;
  source2PosSpan.textContent = `(${Math.round(source2.x)}, ${Math.round(source2.y)})`;
}

function updateWavelength() {
  const lambda = SPEED_OF_SOUND / frequency;
  wavelengthSpan.textContent = `${lambda.toFixed(3)} m`;
}

function initWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}`;

  try {
    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      wsStatusSpan.textContent = '已连接';
      wsStatusSpan.className = 'info-value status-connected';
      requestSpectrum();
    };

    ws.onclose = () => {
      wsStatusSpan.textContent = '已断开';
      wsStatusSpan.className = 'info-value status-disconnected';
      setTimeout(initWebSocket, 2000);
    };

    ws.onerror = () => {
      wsStatusSpan.textContent = '连接错误';
      wsStatusSpan.className = 'info-value status-disconnected';
    };

    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      handleWebSocketMessage(message);
    };
  } catch (e) {
    console.error('WebSocket error:', e);
  }
}

function handleWebSocketMessage(message) {
  switch (message.type) {
    case 'spl_result':
      handleSplResult(message);
      break;
    case 'spectrum_data':
      handleSpectrumData(message);
      break;
    case 'history_data':
      handleHistoryData(message);
      break;
    case 'error':
      console.error('Server error:', message.message);
      break;
  }
}

function handleSplResult(message) {
  splDisplay.textContent = `SPL: ${message.spl.toFixed(2)} dB`;
  const typeText = message.interferenceType === 'constructive' ? '加强' :
                   message.interferenceType === 'destructive' ? '减弱' : '中间';
  interferenceDisplay.textContent = `干涉类型: ${typeText}`;
  loadHistory();
}

function handleSpectrumData(message) {
  spectrumData = message.spectrum;
}

function handleHistoryData(message) {
  renderHistory(message.measurements);
}

function handleCanvasClick(e) {
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  clickPoint = { x, y };
  clickPosSpan.textContent = `(${Math.round(x)}, ${Math.round(y)})`;

  if (clickMode) {
    source2 = { x, y };
    sourceDistance = Math.sqrt(
      Math.pow(source2.x - source1.x, 2) +
      Math.pow(source2.y - source1.y, 2)
    );
    distanceSlider.value = sourceDistance;
    distValueSpan.textContent = Math.round(sourceDistance);
    source2PosSpan.textContent = `(${Math.round(source2.x)}, ${Math.round(source2.y)})`;
  }

  sendCalculateSpl(x, y);
}

function handleCanvasMove(e) {
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  const localSpl = calculateSplLocal(source1, source2, x, y, frequency);
  const type = interferenceTypeLocal(source1, source2, x, y, frequency);
  const typeText = type === 'constructive' ? '加强' : type === 'destructive' ? '减弱' : '中间';
  splDisplay.textContent = `SPL: ${localSpl.toFixed(2)} dB`;
  interferenceDisplay.textContent = `干涉类型: ${typeText}`;
}

function sendCalculateSpl(x, y) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      type: 'calculate_spl',
      source1,
      source2,
      point: { x, y },
      frequency
    }));
  }
}

function requestSpectrum() {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      type: 'get_spectrum',
      frequency
    }));
  }
}

function loadHistory() {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      type: 'get_history',
      limit: 20
    }));
  }
}

function renderHistory(measurements) {
  if (!measurements || measurements.length === 0) {
    historyList.innerHTML = '<div style="color:#666;padding:10px;text-align:center;">暂无记录</div>';
    return;
  }

  historyList.innerHTML = measurements.map(m => `
    <div class="history-item">
      <span class="spl-value">${m.spl.toFixed(1)} dB</span>
      <span style="margin-left:8px;">${m.frequency}Hz</span>
      <div class="time">${new Date(m.created_at).toLocaleTimeString()}</div>
    </div>
  `).join('');
}

function distance(x1, y1, x2, y2) {
  return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
}

function wavelengthLocal(freq) {
  return SPEED_OF_SOUND / freq;
}

function calculateSplLocal(s1, s2, px, py, freq) {
  const r1 = distance(s1.x, s1.y, px, py);
  const r2 = distance(s2.x, s2.y, px, py);
  const refPressure = 20e-6;
  const sourceAmp = 1;

  if (r1 < 0.1 || r2 < 0.1) {
    return 20 * Math.log10(sourceAmp / Math.min(r1, r2) / refPressure);
  }

  const pAmp1 = sourceAmp / r1;
  const pAmp2 = sourceAmp / r2;
  const lambda = wavelengthLocal(freq);
  const phaseDiff = (2 * Math.PI * Math.abs(r1 - r2)) / lambda;

  const resultant = Math.sqrt(
    pAmp1 * pAmp1 + pAmp2 * pAmp2 + 2 * pAmp1 * pAmp2 * Math.cos(phaseDiff)
  );

  return 20 * Math.log10(resultant / refPressure);
}

function interferenceTypeLocal(s1, s2, px, py, freq) {
  const r1 = distance(s1.x, s1.y, px, py);
  const r2 = distance(s2.x, s2.y, px, py);
  const pathDiff = Math.abs(r1 - r2);
  const lambda = wavelengthLocal(freq);
  const ratio = pathDiff / lambda;
  const fractional = ratio - Math.floor(ratio);

  if (fractional < 0.25 || fractional > 0.75) {
    return 'constructive';
  } else if (fractional > 0.25 && fractional < 0.75) {
    return 'destructive';
  }
  return 'intermediate';
}

function generateInitialSpectrum() {
  spectrumData = [];
  for (let i = 0; i < 64; i++) {
    spectrumData.push({
      frequency: 100 + i * 50,
      amplitude: Math.random() * 0.5 + 0.2
    });
  }
}

function startAnimation() {
  function animate() {
    time += 0.02;
    draw();
    drawSpectrum();
    animationId = requestAnimationFrame(animate);
  }
  animate();
}

function draw() {
  ctx.fillStyle = '#0a0a1a';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  if (showInterference) {
    drawInterferencePattern();
  }

  if (showWaves) {
    drawWaves(source1, '#ef4444', time);
    drawWaves(source2, '#10b981', time);
  }

  drawSource(source1, '#ef4444', '1');
  drawSource(source2, '#10b981', '2');

  if (clickPoint) {
    drawClickPoint(clickPoint);
  }
}

function drawInterferencePattern() {
  const resolution = 4;
  const imageData = ctx.createImageData(canvas.width, canvas.height);
  const data = imageData.data;

  const minSpl = 0;
  const maxSpl = 140;

  for (let y = 0; y < canvas.height; y += resolution) {
    for (let x = 0; x < canvas.width; x += resolution) {
      const spl = calculateSplLocal(source1, source2, x, y, frequency);
      const normalized = Math.min(1, Math.max(0, (spl - minSpl) / (maxSpl - minSpl)));

      const intensity = Math.pow(normalized, 0.8);
      const r = Math.floor(intensity * 0 + intensity * 50);
      const g = Math.floor(intensity * 80 + intensity * 120);
      const b = Math.floor(intensity * 150 + intensity * 105);

      for (let dy = 0; dy < resolution && y + dy < canvas.height; dy++) {
        for (let dx = 0; dx < resolution && x + dx < canvas.width; dx++) {
          const idx = ((y + dy) * canvas.width + (x + dx)) * 4;
          data[idx] = r;
          data[idx + 1] = g;
          data[idx + 2] = b;
          data[idx + 3] = 255;
        }
      }
    }
  }

  ctx.putImageData(imageData, 0, 0);
}

function drawWaves(source, color, t) {
  const lambda = wavelengthLocal(frequency) * 20;
  const numWaves = 15;
  const maxRadius = 600;

  ctx.strokeStyle = color;
  ctx.lineWidth = 1;

  for (let i = 0; i < numWaves; i++) {
    const phase = (t * 50 + i * lambda) % (numWaves * lambda);
    const radius = phase;

    if (radius > 0 && radius < maxRadius) {
      const alpha = 1 - radius / maxRadius;
      ctx.globalAlpha = alpha * 0.6;
      ctx.beginPath();
      ctx.arc(source.x, source.y, radius, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  ctx.globalAlpha = 1;
}

function drawSource(source, color, label) {
  ctx.beginPath();
  ctx.arc(source.x, source.y, 10, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();

  ctx.beginPath();
  ctx.arc(source.x, source.y, 15, 0, Math.PI * 2);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.globalAlpha = 0.5;
  ctx.stroke();
  ctx.globalAlpha = 1;

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 12px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, source.x, source.y);
}

function drawClickPoint(point) {
  ctx.beginPath();
  ctx.arc(point.x, point.y, 6, 0, Math.PI * 2);
  ctx.fillStyle = '#fbbf24';
  ctx.fill();

  ctx.beginPath();
  ctx.arc(point.x, point.y, 12, 0, Math.PI * 2);
  ctx.strokeStyle = '#fbbf24';
  ctx.lineWidth = 2;
  ctx.stroke();
}

function drawSpectrum() {
  const w = spectrumCanvas.width;
  const h = spectrumCanvas.height;

  spectrumCtx.fillStyle = '#0d1117';
  spectrumCtx.fillRect(0, 0, w, h);

  if (spectrumData.length === 0) return;

  const barWidth = w / spectrumData.length;
  const maxAmp = 1;

  spectrumData.forEach((item, i) => {
    const barHeight = (item.amplitude / maxAmp) * (h - 20);
    const x = i * barWidth;
    const y = h - barHeight;

    const gradient = spectrumCtx.createLinearGradient(x, y, x, h);
    gradient.addColorStop(0, '#00d4ff');
    gradient.addColorStop(1, '#7c3aed');

    spectrumCtx.fillStyle = gradient;
    spectrumCtx.fillRect(x + 1, y, barWidth - 2, barHeight);
  });

  spectrumCtx.fillStyle = '#8892b0';
  spectrumCtx.font = '10px Arial';
  spectrumCtx.textAlign = 'left';
  spectrumCtx.fillText(`${frequency} Hz`, 5, 14);
}

init();
