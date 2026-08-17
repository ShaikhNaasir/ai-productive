import { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { quotes } from '@/lib/quotes';
import BrandFooter from '@/components/BrandFooter';

// Split-screen shell for the login/register pages: a bold rotating quote on one
// half, the form on the other. The quote is random on load and cycles every few
// seconds; on small screens it collapses to a compact line above the form.
export default function AuthLayout({ children }) {
  const [index, setIndex] = useState(() => Math.floor(Math.random() * quotes.length));

  useEffect(() => {
    const timer = setInterval(() => {
      setIndex((prev) => (prev + 1) % quotes.length);
    }, 8000);
    return () => clearInterval(timer);
  }, []);

  const quote = quotes[index];

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Quote panel (desktop) */}
      <aside className="relative hidden overflow-hidden bg-primary p-10 text-primary-foreground lg:flex lg:flex-col lg:justify-between xl:p-14">
        <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-primary-foreground/10 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-28 -left-20 h-80 w-80 rounded-full bg-primary-foreground/10 blur-3xl" />

        <div className="relative flex items-center gap-2 text-lg font-semibold">
          <Sparkles className="h-5 w-5" />
          Productivity Assistant
        </div>

        <blockquote key={index} className="relative animate-[authFade_0.7s_ease]">
          <h2 className="max-w-2xl text-3xl font-bold leading-tight tracking-tight sm:text-4xl xl:text-5xl">
            &ldquo;{quote.text}&rdquo;
          </h2>
          <footer className="mt-5 text-sm text-primary-foreground/70">— {quote.author}</footer>
        </blockquote>

        <p className="relative text-xs text-primary-foreground/60">
          Plan smarter. Focus deeper. Get more done.
        </p>
      </aside>

      {/* Form panel */}
      <main className="flex items-center justify-center bg-background p-6">
        <div className="w-full max-w-sm">
          {/* Compact quote hero for small screens — mirrors the desktop panel. */}
          <div className="relative mb-6 overflow-hidden rounded-2xl bg-primary p-6 text-primary-foreground lg:hidden">
            <div aria-hidden className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-primary-foreground/10 blur-2xl" />
            <div className="relative flex items-center gap-2 text-sm font-semibold">
              <Sparkles className="h-4 w-4" />
              Productivity Assistant
            </div>
            <blockquote key={index} className="relative mt-4 animate-[authFade_0.7s_ease]">
              <p className="text-xl font-bold leading-snug tracking-tight">&ldquo;{quote.text}&rdquo;</p>
              <footer className="mt-2 text-xs text-primary-foreground/70">— {quote.author}</footer>
            </blockquote>
          </div>

          {children}

          {/* Copyright sits under the form on every screen size. */}
          <BrandFooter className="mt-8 text-center text-xs text-muted-foreground" />
        </div>
      </main>
    </div>
  );
}
