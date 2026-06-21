const SPEED_OF_SOUND = 343;
const REFERENCE_PRESSURE = 20e-6;
const SOURCE_PRESSURE_AMPLITUDE = 1;

function distance(x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return Math.sqrt(dx * dx + dy * dy);
}

function wavelength(frequency) {
  return SPEED_OF_SOUND / frequency;
}

function pressureFromSource(sourceX, sourceY, pointX, pointY, frequency, time = 0) {
  const r = distance(sourceX, sourceY, pointX, pointY);
  if (r < 0.001) return SOURCE_PRESSURE_AMPLITUDE;
  const k = (2 * Math.PI) / wavelength(frequency);
  const omega = 2 * Math.PI * frequency;
  const amplitude = SOURCE_PRESSURE_AMPLITUDE / r;
  return amplitude * Math.sin(k * r - omega * time);
}

function totalPressure(source1, source2, pointX, pointY, frequency, time = 0) {
  const p1 = pressureFromSource(source1.x, source1.y, pointX, pointY, frequency, time);
  const p2 = pressureFromSource(source2.x, source2.y, pointX, pointY, frequency, time);
  return p1 + p2;
}

function spl(pressure) {
  if (pressure <= 0) return -Infinity;
  return 20 * Math.log10(pressure / REFERENCE_PRESSURE);
}

function splAtPoint(source1, source2, pointX, pointY, frequency) {
  const r1 = distance(source1.x, source1.y, pointX, pointY);
  const r2 = distance(source2.x, source2.y, pointX, pointY);

  if (r1 < 0.001 || r2 < 0.001) {
    return spl(SOURCE_PRESSURE_AMPLITUDE / Math.min(r1, r2));
  }

  const pAmp1 = SOURCE_PRESSURE_AMPLITUDE / r1;
  const pAmp2 = SOURCE_PRESSURE_AMPLITUDE / r2;
  const phaseDiff = (2 * Math.PI * Math.abs(r1 - r2)) / wavelength(frequency);

  const resultantAmplitude = Math.sqrt(
    pAmp1 * pAmp1 + pAmp2 * pAmp2 + 2 * pAmp1 * pAmp2 * Math.cos(phaseDiff)
  );

  return spl(resultantAmplitude);
}

function interferenceType(source1, source2, pointX, pointY, frequency) {
  const r1 = distance(source1.x, source1.y, pointX, pointY);
  const r2 = distance(source2.x, source2.y, pointX, pointY);
  const pathDiff = Math.abs(r1 - r2);
  const lambda = wavelength(frequency);
  const ratio = pathDiff / lambda;
  const fractional = ratio - Math.floor(ratio);

  if (fractional < 0.25 || fractional > 0.75) {
    return 'constructive';
  } else if (fractional > 0.25 && fractional < 0.75) {
    return 'destructive';
  }
  return 'intermediate';
}

function generateSpectrum(baseFrequency, numBands = 64) {
  const spectrum = [];
  for (let i = 0; i < numBands; i++) {
    const freq = baseFrequency * Math.pow(2, (i - numBands / 2) / 12);
    const amplitude = Math.exp(-Math.pow((i - numBands / 2) / (numBands / 4), 2));
    const noise = (Math.random() - 0.5) * 0.1;
    spectrum.push({
      frequency: Math.max(20, freq),
      amplitude: Math.max(0, amplitude + noise)
    });
  }
  return spectrum;
}

module.exports = {
  distance,
  wavelength,
  pressureFromSource,
  totalPressure,
  spl,
  splAtPoint,
  interferenceType,
  generateSpectrum,
  SPEED_OF_SOUND,
  REFERENCE_PRESSURE,
  SOURCE_PRESSURE_AMPLITUDE
};
