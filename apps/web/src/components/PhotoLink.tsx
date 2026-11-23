import type { AnchorHTMLAttributes, MouseEvent, ReactNode } from 'react';
import { ApiError, apiFetch } from '../api/client';

const HTTP_UNAUTHORIZED = 401;

type Props = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href' | 'target' | 'rel'> & {
  href: string;
  children: ReactNode;
  'data-testid'?: string;
};

// TD-54: a photo opens in a new tab as a plain browser request, which sends
// the access cookie alone and never gets apiFetch's silent refresh. A tab
// left open past the access token's lifetime would show a raw 401. So a plain
// click opens the tab at once (still inside the click, so it is not a blocked
// popup), checks the session through apiFetch (which refreshes an expired
// one) and only then loads the photo there. A refused session closes the tab
// and apiFetch's handler ends the session here; any other failure still
// loads the photo, so the browser shows what went wrong. A modified click, or
// a browser that blocks the tab, keeps the plain link behavior. On the
// scripted path `rel` no longer applies: the opener is cleared by hand, and
// the photo request may carry a Referer, which only names this app to its
// own API.
export function PhotoLink({ href, children, onClick, ...rest }: Props) {
  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    onClick?.(event);
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }
    const tab = window.open('', '_blank');
    if (!tab) {
      return;
    }
    event.preventDefault();
    tab.opener = null;
    const load = () => {
      // The user may have closed the blank tab while the check ran.
      if (!tab.closed) {
        tab.location.href = href;
      }
    };
    apiFetch('/auth/me').then(load, (error: unknown) => {
      if (error instanceof ApiError && error.status === HTTP_UNAUTHORIZED) {
        tab.close();
      } else {
        load();
      }
    });
  }

  return (
    <a {...rest} href={href} target="_blank" rel="noopener noreferrer" onClick={handleClick}>
      {children}
    </a>
  );
}
