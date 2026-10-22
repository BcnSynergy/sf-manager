import { useCallback, useRef, useState } from 'react';

type AlertMessage = { text: string; key: number };

// EN-76: a page's action alert. Render it as `<Alert key={key} …>` so each
// `show` mounts a new alert element, which assistive technology announces
// even when the text repeats. The key comes from a counter that never
// resets, so a handler that calls `clear()` and then `show()` with the same
// text in one tick (React batches both) still gets a new key. A page that
// stores an i18n key rather than translated text passes the key to `show`
// and renders `t(message)`, so the alert follows a language switch.
export function useAlertMessage() {
  const [alert, setAlert] = useState<AlertMessage | null>(null);
  const counter = useRef(0);

  const show = useCallback((text: string) => {
    counter.current += 1;
    setAlert({ text, key: counter.current });
  }, []);
  const clear = useCallback(() => setAlert(null), []);

  return { message: alert?.text ?? null, key: alert?.key ?? 0, show, clear };
}
