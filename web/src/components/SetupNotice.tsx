export default function SetupNotice({ missing }: { missing: 'issuer' | 'contract' }) {
  const lines =
    missing === 'issuer'
      ? ['cd web && npm run setup:issuer']
      : ['.\\scripts\\deploy.ps1', '# macOS/Linux: ./scripts/deploy.sh'];

  return (
    <div className="relative rounded border border-rule bg-surface p-6">
      <div className="pointer-events-none absolute inset-2 rounded border border-rule/70" />
      <div className="relative">
        <h2 className="font-display text-lg text-ink">Setup needed</h2>
        <p className="mt-2 text-sm text-ink-soft">
          {missing === 'issuer'
            ? 'The DTI issuer account is not configured yet. Create it with:'
            : 'The employer registry contract is not deployed yet. Deploy it with:'}
        </p>
        <pre className="mt-3 overflow-x-auto rounded bg-ink p-3 font-mono text-xs text-paper">
          {lines.join('\n')}
        </pre>
        <p className="mt-2 text-xs text-ink-soft">
          Then restart <code className="font-mono">npm run dev</code> so the new{' '}
          <code className="font-mono">.env.local</code> is picked up.
        </p>
      </div>
    </div>
  );
}
