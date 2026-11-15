/** `auth` is the session check, `list` the product query, `render` the rest of the page. */
export function serverTimingHeader(parts: { auth: number; list: number; render: number }): string {
  const dur = (name: string, ms: number) => `${name};dur=${Math.max(0, Math.round(ms))}`;
  return [dur('auth', parts.auth), dur('list', parts.list), dur('render', parts.render)].join(', ');
}
