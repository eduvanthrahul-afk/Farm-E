import { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Leaf, Eye, EyeOff, AlertCircle, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/auth/useAuth';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import GoogleSignIn from '@/components/auth/GoogleSignIn';
import { ROLES } from '@/config/constants';

const schema = z.object({
  email: z.string().email('Valid email required'),
  password: z.string().min(1, 'Password required'),
});

const Login = () => {
  const [showPassword, setShowPassword] = useState(false);
  const [serverError, setServerError] = useState('');
  const { user, login, googleLogin } = useAuth();
  const [googleBusy, setGoogleBusy] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const getDashboardPath = (role) => {
    if (role === ROLES.FARMER) return '/farmer/dashboard';
    if (role === ROLES.BUYER) return '/buyer/dashboard';
    if (role === ROLES.ADMIN) return '/admin/dashboard';
    return '/home';
  };

  const rawFrom = location.state?.from;
  const fromPath = typeof rawFrom === 'string' ? rawFrom : rawFrom?.pathname;
  const redirectTarget = fromPath && !fromPath.startsWith('/login') && !fromPath.startsWith('/register')
    ? fromPath
    : null;

  // Auto-redirect if already logged in
  useEffect(() => {
    if (user?.role) {
      navigate(redirectTarget || getDashboardPath(user.role), { replace: true });
    }
  }, [user, redirectTarget, navigate]);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(schema) });

  const onSubmit = async ({ email, password }) => {
    setServerError('');
    try {
      const loggedUser = await login(email, password);
      if (!loggedUser?.role) {
        setServerError('Login succeeded but user profile was incomplete. Please try again.');
        return;
      }
      const dest = redirectTarget || getDashboardPath(loggedUser.role);
      navigate(dest, { replace: true });
    } catch (err) {
      setServerError(
        err.response?.data?.message || err.message || 'Login failed. Please check your credentials.'
      );
    }
  };

  const onGoogleCredential = async (credential) => {
    setServerError('');
    setGoogleBusy(true);
    try {
      const loggedUser = await googleLogin(credential);
      navigate(redirectTarget || getDashboardPath(loggedUser.role), { replace: true });
    } catch (err) {
      setServerError(err.response?.data?.message || err.message || 'Google sign-in failed. Please try again.');
    } finally {
      setGoogleBusy(false);
    }
  };

  return (
    <div className="auth-page min-h-screen bg-gradient-to-br from-primary-50 to-white flex items-center justify-center px-4">
      <aside className="auth-story">
        <Link to="/" className="auth-story-brand"><span><Leaf size={19} /></span>Farm-E</Link>
        <div className="auth-story-copy"><span className="auth-eyebrow">THE FARM-E WAY</span><h2>Trade closer.<br /><em>Grow further.</em></h2><p>Good business starts with good relationships. Bring the people who grow our food closer to the people who need it.</p><div className="auth-story-points"><span><Leaf size={15} /> Direct farm connections</span><span><ShieldCheck size={15} /> Clear, dependable trade</span></div></div>
        <div className="auth-story-footer"><span>GROW TOGETHER</span><span>01 — 03</span></div>
        <div className="auth-story-orb" />
      </aside>
      <div className="auth-main w-full max-w-md">
        <div className="flex items-center gap-2.5 justify-center mb-8">
          <div className="w-10 h-10 rounded-2xl bg-primary-600 flex items-center justify-center shadow-glow-green">
            <Leaf size={22} className="text-white" />
          </div>
          <span className="font-display font-bold text-2xl text-gray-900">Farm-E</span>
        </div>

        <div className="card p-8">
          <h1 className="font-display font-bold text-2xl text-gray-900 mb-1">Welcome back</h1>
          <p className="text-sm text-gray-500 mb-6">Sign in to your Farm-E account</p>

          {serverError && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl mb-4 text-sm text-red-700">
              <AlertCircle size={16} className="shrink-0" />
              {serverError}
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <Input
              label="Email"
              type="email"
              placeholder="you@example.com"
              autoComplete="email"
              error={errors.email?.message}
              {...register('email')}
            />
            <div className="relative">
              <Input
                label="Password"
                type={showPassword ? 'text' : 'password'}
                placeholder="Your password"
                autoComplete="current-password"
                error={errors.password?.message}
                {...register('password')}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-[34px] text-gray-400 hover:text-gray-600"
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>

            <Button type="submit" loading={isSubmitting} className="w-full mt-2" size="lg">
              Sign In
            </Button>
          </form>

          <div className="auth-divider"><span>or continue with</span></div>
          <GoogleSignIn onCredential={onGoogleCredential} onError={setServerError} disabled={googleBusy} />
          <p className="google-register-hint">Google sign-in uses the account type saved to your Farm-E account. New here? Create an account to choose Farmer or Buyer.</p>

          <p className="text-center text-sm text-gray-500 mt-5">
            Don't have an account?{' '}
            <Link to="/register" className="text-primary-600 font-medium hover:underline">
              Create one free
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;
