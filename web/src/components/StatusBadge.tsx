export type BadgeKind = 'verified' | 'pending' | 'revoked' | 'none';

const STYLES: Record<BadgeKind, string> = {
  verified: 'border-emerald-300 bg-emerald-100 text-emerald-800',
  pending: 'border-amber-300 bg-amber-100 text-amber-800',
  revoked: 'border-red-300 bg-red-100 text-red-800',
  none: 'border-gray-300 bg-gray-100 text-gray-600',
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
      className={`inline-block rounded-full border px-3 py-0.5 text-xs font-semibold tracking-wide ${STYLES[kind]}`}
    >
      {label ?? DEFAULT_LABEL[kind]}
    </span>
  );
}
