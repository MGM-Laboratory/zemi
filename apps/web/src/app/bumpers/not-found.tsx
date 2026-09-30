import { QuietCard } from '@/components/bumpers/live/quiet-card';

/** A bad or unknown /bumpers link: a quiet card that is safe on top of a camera. */
export default function BumpersNotFound() {
  return <QuietCard title="Nothing plays at this link.">Check the address, or grab a fresh link in Zemi Studio: open the show, then OBS.</QuietCard>;
}
