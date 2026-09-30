import { notFound } from 'next/navigation';

/** Any other /bumpers address gets the quiet not-found card, never the public site. */
export default function BumpersUnknownPage() {
  notFound();
}
