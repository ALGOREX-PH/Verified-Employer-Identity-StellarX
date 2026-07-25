export default function PageShell({
  title,
  children,
}: {
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen w-full bg-gray-50">
      <div className="mx-auto max-w-3xl px-4 py-10">
        {title && <h1 className="mb-6 text-2xl font-bold text-gray-900">{title}</h1>}
        {children}
      </div>
    </main>
  );
}
