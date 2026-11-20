import { useCallback, useRef, useState } from 'react';
import type { MessageKey } from '../i18n/message-key';

type AlertMessage = { messageKey: MessageKey; key: number };

// EN-76: a page's action alert. Render it as `<Alert key={key} …>` so each
// `show` mounts a new alert element, which assistive technology announces
// even when the text repeats. The key comes from a counter that never
// resets, so a handler that calls `clear()` and then `show()` with the same
// text in one tick (React batches both) still gets a new key. `show` takes
// an i18n key, never translated text (EN-210), and the page renders
// `t(messageKey)`, so the alert follows a language switch (EN-203).
export function useAlertMessage() {
  const [alert, setAlert] = useState<AlertMessage | null>(null);
  const counter = useRef(0);

  const show = useCallback((messageKey: MessageKey) => {
    counter.current += 1;
    setAlert({ messageKey, key: counter.current });
  }, []);
  const clear = useCallback(() => setAlert(null), []);

  return { messageKey: alert?.messageKey ?? null, key: alert?.key ?? 0, show, clear };
}
