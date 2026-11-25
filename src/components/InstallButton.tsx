'use client';

import { CircleCheck, Download } from 'lucide-react';

import { useInstallPrompt } from '@/lib/installPrompt';

export default function InstallButton() {
  const { state, install } = useInstallPrompt();

  if (state === 'available') {
    return (
      <button type="button" className="button primary install-cta" onClick={install}>
        <Download size={18} aria-hidden="true" />
        Install PriceTracker
      </button>
    );
  }

  if (state === 'installed') {
    return (
      <p className="install-status" role="status">
        <CircleCheck size={16} aria-hidden="true" />
        Installed on this device
      </p>
    );
  }

  return null;
}
