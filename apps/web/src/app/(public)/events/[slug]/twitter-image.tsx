import {
  renderEventShareCard,
  SHARE_ALT,
  SHARE_CONTENT_TYPE,
  SHARE_SIZE,
} from '@/components/public/events/og/event-share-card';

export const alt = SHARE_ALT;
export const size = SHARE_SIZE;
export const contentType = SHARE_CONTENT_TYPE;

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return renderEventShareCard(slug);
}
