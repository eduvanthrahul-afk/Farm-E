import { useCallback, useEffect, useState } from 'react';

/** Keep a short-lived, per-account copy of a multi-step form in this tab. */
export const useFormDraft = (form, key) => {
  const storageKey = `farm-e:draft:${key}`;
  const [saveState, setSaveState] = useState(() => {
    try {
      return sessionStorage.getItem(storageKey) ? 'Restored your saved draft' : '';
    } catch {
      return '';
    }
  });

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(storageKey);
      if (!saved) return;
      const draft = JSON.parse(saved);
      if (draft?.values && typeof draft.values === 'object') {
        form.reset({ ...form.getValues(), ...draft.values });
      }
    } catch {
      sessionStorage.removeItem(storageKey);
    }
  }, [form, storageKey]);

  useEffect(() => {
    let timer;
    const subscription = form.watch((values, event) => {
      if (!event?.name) return;
      setSaveState('Saving draft…');
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        try {
          sessionStorage.setItem(storageKey, JSON.stringify({ values, savedAt: Date.now() }));
          setSaveState('Draft saved on this device');
        } catch {
          setSaveState('');
        }
      }, 500);
    });
    return () => {
      window.clearTimeout(timer);
      subscription.unsubscribe();
    };
  }, [form, storageKey]);

  const clearDraft = useCallback(() => {
    sessionStorage.removeItem(storageKey);
    setSaveState('');
  }, [storageKey]);

  return { saveState, clearDraft };
};
