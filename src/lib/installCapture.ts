/**
 * Inline script for <head>. The browser fires `beforeinstallprompt` on whichever
 * page loads first, often before React starts, and /install is usually reached by
 * client navigation. So the event is kept on window here, and the browser's own
 * mini-infobar is suppressed: only the button on /install ever asks.
 */
export const INSTALL_PROMPT_KEY = '__ptInstallPrompt';
export const INSTALL_CHANGE_EVENT = 'pt-install-change';

export const INSTALL_CAPTURE_SCRIPT =
  `addEventListener('beforeinstallprompt',function(e){e.preventDefault();window.${INSTALL_PROMPT_KEY}=e;dispatchEvent(new Event('${INSTALL_CHANGE_EVENT}'))});` +
  `addEventListener('appinstalled',function(){window.${INSTALL_PROMPT_KEY}=null;dispatchEvent(new Event('${INSTALL_CHANGE_EVENT}'))});`;
