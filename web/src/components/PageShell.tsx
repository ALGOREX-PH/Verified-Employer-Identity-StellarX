export default function PageShell({
  title,
  lede,
  children,
}: {
  title?: string;
  lede?: string;
  children: React.ReactNode;
}) {
  return (
    <main id="main" className="min-h-screen w-full bg-paper">
      <div className="mx-auto max-w-3xl px-4 py-10">
        {(title || lede) && (
          <div className="mb-6">
            {title && (
              <h1 className="font-display text-3xl font-normal text-ink">{title}</h1>
            )}
            {lede && <p className="mt-2 text-ink-soft">{lede}</p>}
          </div>
        )}
        {children}
      </div>
    </main>
  );
}
