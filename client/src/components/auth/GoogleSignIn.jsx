import { useEffect, useRef, useState } from 'react';
import { GoogleLogin } from '@react-oauth/google';

const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim();
const hostName = window.location.hostname;
const isUnusableIpOrigin = /^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostName) && !hostName.startsWith('127.');

/** Google returns an ID token credential; the API verifies it before issuing a Farm-E session. */
export default function GoogleSignIn({ onCredential, onError, disabled = false }) {
  const buttonWrap = useRef(null);
  const [buttonWidth, setButtonWidth] = useState(360);

  useEffect(() => {
    const element = buttonWrap.current;
    if (!element) return undefined;
    const resizeObserver = new ResizeObserver(([entry]) => {
      const available = Math.floor(entry.contentRect.width);
      setButtonWidth(Math.min(360, Math.max(200, available)));
    });
    resizeObserver.observe(element);
    return () => resizeObserver.disconnect();
  }, []);

  if (!googleClientId) {
    return (
      <div className="google-signin-not-configured" role="note">
        <span className="google-signin-g" aria-hidden="true">G</span>
        <span>Google sign-in needs a Google OAuth client ID.</span>
      </div>
    );
  }

  if (isUnusableIpOrigin) {
    return (
      <div className="google-signin-not-configured" role="note">
        <span className="google-signin-g" aria-hidden="true">G</span>
        <span>Google sign-in cannot use this network IP. Open Farm-E on localhost for desktop testing, or use an HTTPS domain registered in your Google OAuth client for mobile.</span>
      </div>
    );
  }

  return (
    <div ref={buttonWrap} className={`google-signin-button ${disabled ? 'is-disabled' : ''}`}>
      <GoogleLogin
        onSuccess={(result) => result.credential ? onCredential(result.credential) : onError('Google did not return a sign-in credential. Please try again.')}
        onError={() => onError('Google sign-in was cancelled or could not be started.')}
        theme="outline"
        size="large"
        text="continue_with"
        shape="rectangular"
        logo_alignment="left"
        width={String(buttonWidth)}
        useOneTap={false}
        auto_select={false}
      />
      {disabled && <span className="google-signin-loading" role="status">Signing in…</span>}
    </div>
  );
}
