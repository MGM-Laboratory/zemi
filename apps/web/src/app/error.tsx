'use client';

import { ErrorScreen } from '@/components/public/errors/error-screen';

/**
 * Root error boundary: anything that throws below the root layout (public pages, the public
 * shell, admin pages) lands here. Next 16.3 passes `retry` (re-fetch + re-render) and `reset`.
 */
export default function RootError({
  error,
  retry,
  reset,
}: {
  error: Error & { digest?: string };
  retry?: () => void;
  reset?: () => void;
}) {
  return <ErrorScreen error={error} retry={retry ?? reset} />;
}
