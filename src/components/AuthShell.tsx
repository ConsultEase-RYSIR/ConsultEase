export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="grid min-h-screen md:grid-cols-[48%_52%]">
      <section className="hidden flex-col justify-center bg-ink px-16 text-white md:flex">
        <div className="mb-14 flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-xl bg-accent text-ink">≡</span><b className="text-3xl">ConsultEase</b></div>
        <h1 className="max-w-xl text-5xl font-bold leading-[1.1]">Faculty consultations, scheduled without the back-and-forth.</h1>
        <p className="mt-6 max-w-md text-lg text-slate-300">A smart consultation management system for students and professors.</p>
      </section>
      <section className="grid place-items-center bg-canvas p-6">{children}</section>
    </main>
  );
}
