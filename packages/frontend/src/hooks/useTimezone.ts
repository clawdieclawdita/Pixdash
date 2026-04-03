import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'pixdash-timezone';

function getStoredTimezone() {
  if (typeof window === 'undefined') {
    return 'local';
  }

  return window.localStorage.getItem(STORAGE_KEY) || 'local';
}

export function useTimezone() {
  const [timezone, setTimezone] = useState(getStoredTimezone);

  useEffect(() => {
    const handler = (event: Event) => {
      const storageEvent = event as StorageEvent;
      if (storageEvent.key === STORAGE_KEY && storageEvent.newValue) {
        setTimezone(storageEvent.newValue);
      }
    };

    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, []);

  const changeTimezone = useCallback((nextTimezone: string) => {
    setTimezone(nextTimezone);

    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(STORAGE_KEY, nextTimezone);
    window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY, newValue: nextTimezone }));
  }, []);

  const formatTimestamp = useCallback(
    (isoString: string): string => {
      if (!isoString) {
        return '—';
      }

      const date = new Date(isoString);
      if (Number.isNaN(date.getTime())) {
        return isoString;
      }

      const baseOptions: Intl.DateTimeFormatOptions = {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      };

      if (timezone === 'local') {
        return date.toLocaleString(undefined, baseOptions);
      }

      try {
        return date.toLocaleString(undefined, {
          ...baseOptions,
          timeZone: timezone
        });
      } catch {
        return date.toLocaleString(undefined, baseOptions);
      }
    },
    [timezone]
  );

  return { timezone, changeTimezone, formatTimestamp };
}
