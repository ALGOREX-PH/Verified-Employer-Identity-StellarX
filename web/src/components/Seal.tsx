import { useId } from 'react';

type SealTone = 'seal' | 'alarm';

const TONE_COLOR: Record<SealTone, string> = {
  seal: 'var(--color-seal)',
  alarm: 'var(--color-alarm)',
};

export default function Seal({
  tone = 'seal',
  size = 112,
  ringText = 'LEHITIMO · VERIFIED EMPLOYER · LEHITIMO · VERIFIED EMPLOYER ·',
  center = '✓',
  className = '',
}: {
  tone?: SealTone;
  size?: number;
  ringText?: string;
  center?: string;
  className?: string;
}) {
  const id = useId();
  const pathId = `seal-ring-${id}`;
  const color = TONE_COLOR[tone];

  return (
    <span
      aria-hidden="true"
      className={`inline-block select-none rotate-[-8deg] ${className}`}
      style={{ width: size, height: size }}
    >
      <svg viewBox="0 0 200 200" width={size} height={size} className="block overflow-visible">
        <path
          id={pathId}
          d="M 100,100 m -87,0 a 87,87 0 1,1 174,0 a 87,87 0 1,1 -174,0"
          fill="none"
        />
        <circle cx="100" cy="100" r="92" fill="none" stroke={color} strokeWidth="2" />
        <circle cx="100" cy="100" r="80" fill="none" stroke={color} strokeWidth="1" />
        <text fontSize="9" fontFamily="var(--font-mono)" fill={color} letterSpacing="2">
          <textPath href={`#${pathId}`} startOffset="0%">
            {ringText.toUpperCase()}
          </textPath>
        </text>
        <text
          x="100"
          y="100"
          textAnchor="middle"
          dominantBaseline="central"
          fontSize="64"
          fontFamily="var(--font-sans)"
          fontWeight="700"
          fill={color}
        >
          {center}
        </text>
      </svg>
    </span>
  );
}
