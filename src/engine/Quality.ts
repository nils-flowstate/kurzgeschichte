export type QualityLevel = 'high' | 'medium' | 'low';

export interface QualitySettings {
  level: QualityLevel;
  label: string;
  pixelRatio: number;
  shadowMap: number;
  softShadows: boolean;
  ao: boolean;
  aoSamples: number;
  dof: boolean;
  bloom: boolean;
  msaa: number;
}

const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;

export const QUALITY: Record<QualityLevel, QualitySettings> = {
  high: { level: 'high', label: 'Hoch', pixelRatio: Math.min(dpr, 1.5), shadowMap: 2048, softShadows: true, ao: true, aoSamples: 12, dof: true, bloom: true, msaa: 4 },
  medium: { level: 'medium', label: 'Mittel', pixelRatio: Math.min(dpr, 1.0), shadowMap: 1024, softShadows: true, ao: true, aoSamples: 8, dof: false, bloom: true, msaa: 2 },
  low: { level: 'low', label: 'Niedrig', pixelRatio: Math.min(dpr, 0.75), shadowMap: 512, softShadows: false, ao: false, aoSamples: 4, dof: false, bloom: false, msaa: 0 },
};
