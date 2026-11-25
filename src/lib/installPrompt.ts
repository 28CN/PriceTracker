'use client';

import { useEffect, useState } from 'react';

import { INSTALL_CHANGE_EVENT, INSTALL_PROMPT_KEY } from '@/lib/installCapture';

/** Chrome/Edge/Android fire this when the site can be installed. Not in TS's DOM lib yet. */
export type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

type InstallWindow = Window & { [INSTALL_PROMPT_KEY]?: BeforeInstallPromptEvent | null };

const CHANGE = INSTALL_CHANGE_EVENT;

export function isStandalone(win: Window = window): boolean {
  const iosStandalone = (win.navigator as Navigator & { standalone?: boolean }).standalone === true;
  return iosStandalone || win.matchMedia('(display-mode: standalone)').matches;
}

export type InstallState = 'unknown' | 'installed' | 'available' | 'unavailable';

/** What the Install button should do. `install()` only runs on a click. */
export function useInstallPrompt() {
  const [state, setState] = useState<InstallState>('unknown');

  useEffect(() => {
    const win = window as InstallWindow;
    const sync = () => {
      if (isStandalone(win)) setState('installed');
      else setState(win.__ptInstallPrompt ? 'available' : 'unavailable');
    };
    sync();
    const standalone = win.matchMedia('(display-mode: standalone)');
    win.addEventListener(CHANGE, sync);
    standalone.addEventListener('change', sync);
    return () => {
      win.removeEventListener(CHANGE, sync);
      standalone.removeEventListener('change', sync);
    };
  }, []);

  async function install() {
    const win = window as InstallWindow;
    const event = win.__ptInstallPrompt;
    if (!event) return;
    await event.prompt();
    const choice = await event.userChoice.catch(() => ({ outcome: 'dismissed' as const }));
    // A prompt can only be used once; Chrome fires a fresh event if it is still installable.
    win.__ptInstallPrompt = null;
    setState(choice.outcome === 'accepted' ? 'installed' : 'unavailable');
  }

  return { state, install };
}
