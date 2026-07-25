export type BadgeKind = 'verified' | 'pending' | 'revoked' | 'none';

const STYLES: Record<BadgeKind, string> = {
  verified: 'border-seal/30 bg-seal-wash text-seal',
  pending: 'border-goldleaf/30 bg-gold-wash text-goldleaf',
  revoked: 'border-alarm/30 bg-alarm-wash text-alarm',
  none: 'border-rule bg-paper text-ink-soft',
};

const DEFAULT_LABEL: Record<BadgeKind, string> = {
  verified: 'VERIFIED',
  pending: 'PENDING',
  revoked: 'REVOKED',
  none: 'NOT FOUND',
};

export default function StatusBadge({
  kind,
  label,
}: {
  kind: BadgeKind;
  label?: string;
}) {
  return (
    <span
      className={`inline-block rounded-full border px-3 py-0.5 font-mono text-xs font-semibold uppercase tracking-wide ${STYLES[kind]}`}
    >
      {label ?? DEFAULT_LABEL[kind]}
    </span>
  );
}
