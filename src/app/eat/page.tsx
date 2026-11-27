import { permanentRedirect } from 'next/navigation';

export default function EatPage() {
  permanentRedirect('/deals?tab=eat');
}
