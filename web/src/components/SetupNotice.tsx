export default function SetupNotice({ missing }: { missing: 'issuer' | 'contract' }) {
  const cmd =
    missing === 'issuer'
      ? 'cd web && npm run setup:issuer'
      : '.\\scripts\\deploy.ps1   (macOS/Linux: ./scripts/deploy.sh)';
  return (
    <div className="rounded border border-dashed border-gray-300 bg-gray-50 p-6">
      <h2 className="text-lg font-semibold text-gray-900">Setup needed</h2>
      <p className="mt-2 text-sm text-gray-600">
        {missing === 'issuer'
          ? 'The DTI issuer account is not configured yet. Create it with:'
          : 'The employer registry contract is not deployed yet. Deploy it with:'}
      </p>
      <pre className="mt-2 overflow-x-auto rounded bg-gray-900 p-3 text-xs text-gray-100">{cmd}</pre>
      <p className="mt-2 text-xs text-gray-500">
        Then restart <code>npm run dev</code> so the new <code>.env.local</code> is
        picked up.
      </p>
    </div>
  );
}
