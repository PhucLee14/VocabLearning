'use client';

import { InlineScript } from '@/components/inline-script';
import { themeInitScript } from '@/lib/theme';
import './globals.css';

/**
 * The last resort: an error in [locale]/layout.tsx itself. It replaces that
 * layout, so there is no html/body, no translations and no font from it:
 * this page brings its own document, the stylesheet and the stored theme, and
 * says everything in both languages (the locale can't be trusted to have
 * loaded). The font falls back to the system's (see --font-sans).
 */
export default function GlobalError({ error, retry }: { error: unknown; retry: () => void }) {
  const digest = error instanceof Error && 'digest' in error && typeof error.digest === 'string' ? error.digest : null;
  return (
    <html lang="vi" suppressHydrationWarning>
      <head>
        <InlineScript html={themeInitScript} />
        <title>Godee</title>
      </head>
      <body className="min-h-full">
        <main className="flex min-h-screen items-center justify-center px-4 py-10">
          <div role="alert" className="card w-full max-w-[480px] p-6 sm:p-8">
            <h1 className="text-[24px] font-extrabold tracking-tight">Đã có lỗi xảy ra</h1>
            <p className="mt-2 text-[15px] text-muted">
              Không hiển thị được trang này. Hãy thử lại; nếu vẫn lỗi, bạn tải lại trang sau ít phút nhé.
            </p>
            <div lang="en" className="mt-4 border-t border-line pt-4">
              <p className="text-[17px] font-extrabold">Something went wrong</p>
              <p className="mt-1 text-[15px] text-muted">
                This page could not be shown. Try again, and if it keeps happening, reload the page in a minute.
              </p>
            </div>
            <div className="mt-6 flex flex-wrap gap-3">
              <button type="button" className="btn btn-primary" onClick={() => retry()}>
                Thử lại · Try again
              </button>
              {/* A plain link: a full page load, in case the client's state is what broke. */}
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- see above */}
              <a href="/" className="btn btn-secondary">
                Trang chủ · Home
              </a>
            </div>
            {digest && <p className="num mt-5 text-[13px] text-muted">{digest}</p>}
          </div>
        </main>
      </body>
    </html>
  );
}
