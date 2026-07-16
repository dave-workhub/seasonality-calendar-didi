'use client';

import dynamic from 'next/dynamic';

// The calendar reads localStorage synchronously (to restore the last
// selected city) and today's date for the "today" highlight, both of
// which can differ from the server's render. Rendering it client-only
// avoids the hydration mismatch that a server-rendered-then-corrected
// version would otherwise show.
const CalendarApp = dynamic(() => import('./CalendarApp'), {
  ssr: false,
  loading: () => <div className="w-full min-h-screen bg-white" />,
});

export default function Page() {
  return <CalendarApp />;
}
