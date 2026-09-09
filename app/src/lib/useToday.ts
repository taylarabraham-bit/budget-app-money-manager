import { useEffect, useState } from 'react';

/**
 * The current time as state that refreshes when the calendar day changes and
 * whenever the app becomes visible again - so a screen left open across
 * midnight (or reopened days later on a phone) doesn't keep yesterday's
 * "today" in its date maths until the user happens to navigate.
 */
export function useToday(): Date {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    let timer: number | undefined;
    const msUntilNextDay = () => {
      const d = new Date();
      // A few seconds past midnight, so the tick lands safely in the new day.
      return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, 0, 0, 5).getTime() - d.getTime();
    };
    const schedule = () => {
      timer = window.setTimeout(() => {
        setNow(new Date());
        schedule();
      }, msUntilNextDay());
    };
    schedule();
    const onVisible = () => {
      if (document.visibilityState === 'visible') setNow(new Date());
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      if (timer !== undefined) window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  return now;
}
