import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import './dashboard.css';
import './theme.css';
import App from './App.jsx';
import { GoogleOAuthProvider } from '@react-oauth/google';

const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {googleClientId ? <GoogleOAuthProvider clientId={googleClientId}><App /></GoogleOAuthProvider> : <App />}
  </StrictMode>
);
