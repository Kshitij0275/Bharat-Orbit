export interface TelemetryData {
  temperature: number;
  humidity: number;
  pressure: number;
  co2: number;
  oxygen: number;
  heartRate: number;
  cameraFps: number;
  aiLatency: number;
  uptime: string;
  crewMotion: 'ACTIVE' | 'STABLE' | 'IDLE';
}

const fluctuate = (value: number, amount: number) =>
  Number((value + (Math.random() - 0.5) * amount).toFixed(1));

export function getSimulatedTelemetry(previous?: TelemetryData): TelemetryData {
  const base = previous ?? {
    temperature: 23.7,
    humidity: 48.2,
    pressure: 101.2,
    co2: 612,
    oxygen: 20.8,
    heartRate: 72,
    cameraFps: 24,
    aiLatency: 38,
    uptime: '02:18:42',
    crewMotion: 'ACTIVE' as const,
  };

  const [hours, minutes, seconds] = base.uptime.split(':').map(Number);
  const nextSeconds = (seconds + 4) % 60;
  const nextMinutes = minutes + (seconds + 4 >= 60 ? 1 : 0);
  const nextHours = hours + (nextMinutes >= 60 ? 1 : 0);

  return {
    temperature: fluctuate(base.temperature, 0.18),
    humidity: fluctuate(base.humidity, 0.7),
    pressure: fluctuate(base.pressure, 0.12),
    co2: Math.round(fluctuate(base.co2, 8)),
    oxygen: fluctuate(base.oxygen, 0.08),
    heartRate: Math.round(fluctuate(base.heartRate, 3)),
    cameraFps: 24,
    aiLatency: Math.round(fluctuate(base.aiLatency, 5)),
    uptime: `${String(nextHours % 100).padStart(2, '0')}:${String(nextMinutes % 60).padStart(2, '0')}:${String(nextSeconds).padStart(2, '0')}`,
    crewMotion: base.crewMotion,
  };
}