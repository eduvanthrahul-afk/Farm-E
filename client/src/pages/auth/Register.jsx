import { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Leaf, Eye, EyeOff, AlertCircle, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/auth/useAuth';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import GoogleSignIn from '@/components/auth/GoogleSignIn';
import { ROLES } from '@/config/constants';

const schema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Valid email required'),
  phone: z.string().regex(/^[6-9]\d{9}$/, 'Valid 10-digit Indian mobile required'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, 'Must include uppercase, lowercase and a number'),
  role: z.enum([ROLES.FARMER, ROLES.BUYER]),
});

const Register = () => {
  const [showPassword, setShowPassword] = useState(false);
  const [serverError, setServerError] = useState('');
  const { user, register: registerUser, googleLogin } = useAuth();
  const [googleBusy, setGoogleBusy] = useState(false);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const defaultRole = searchParams.get('role') || ROLES.FARMER;

  useEffect(() => {
    if (user?.role) {
      navigate(user.role === ROLES.FARMER ? '/farmer/dashboard' : '/buyer/dashboard', { replace: true });
    }
  }, [user, navigate]);

  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { role: defaultRole },
  });

  const role = useWatch({ control, name: 'role' });

  const onSubmit = async (data) => {
    setServerError('');
    try {
      const user = await registerUser(data);
      navigate(user.role === ROLES.FARMER ? '/farmer/dashboard' : '/buyer/dashboard');
    } catch (err) {
      setServerError(err.response?.data?.message || 'Registration failed. Please try again.');
    }
  };

  const onGoogleCredential = async (credential) => {
    setServerError('');
    setGoogleBusy(true);
    try {
      const user = await googleLogin(credential, { role });
      navigate(user.role === ROLES.FARMER ? '/farmer/dashboard' : '/buyer/dashboard', { replace: true });
    } catch (err) {
      setServerError(err.response?.data?.message || err.message || 'Google sign-in failed. Please try again.');
    } finally {
      setGoogleBusy(false);
    }
  };

  return (
    <div className="auth-page auth-register min-h-screen bg-gradient-to-br from-primary-50 to-white flex items-center justify-center px-4 py-10">
      <aside className="auth-story">
        <Link to="/" className="auth-story-brand"><span><Leaf size={19} /></span>Farm-E</Link>
        <div className="auth-story-copy"><span className="auth-eyebrow">A BETTER WAY TO TRADE</span><h2>Find your place<br /><em>in the food chain.</em></h2><p>Farm-E brings growers and buyers together to make every connection count, from the first offer to the final delivery.</p><div className="auth-story-points"><span><Leaf size={15} /> Built for your trade</span><span><ShieldCheck size={15} /> Your terms, in the open</span></div></div>
        <div className="auth-story-footer"><span>GROW TOGETHER</span><span>02 — 03</span></div>
        <div className="auth-story-orb" />
      </aside>
      <div className="auth-main w-full max-w-md">
        {/* Logo */}
        <div className="flex items-center gap-2.5 justify-center mb-8">
          <div className="w-10 h-10 rounded-2xl bg-primary-600 flex items-center justify-center shadow-glow-green">
            <Leaf size={22} className="text-white" />
          </div>
          <span className="font-display font-bold text-2xl text-gray-900">Farm-E</span>
        </div>

        <div className="card p-8">
          <h1 className="font-display font-bold text-2xl text-gray-900 mb-1">Create account</h1>
          <p className="text-sm text-gray-500 mb-6">Join India's direct farm marketplace</p>

          {/* Role toggle */}
          <div className="flex rounded-xl overflow-hidden border border-gray-200 mb-6">
            {[ROLES.FARMER, ROLES.BUYER].map((r) => (
              <label
                key={r}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium cursor-pointer transition-colors ${
                  role === r
                    ? 'bg-primary-600 text-white'
                    : 'text-gray-500 hover:bg-gray-50'
                }`}
              >
                <input
                  type="radio"
                  value={r}
                  {...register('role')}
                  className="sr-only"
                />
                {r === ROLES.FARMER ? '🌾 Farmer' : '🛒 Buyer'}
              </label>
            ))}
          </div>

          {serverError && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl mb-4 text-sm text-red-700">
              <AlertCircle size={16} className="shrink-0" />
              {serverError}
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <Input
              label="Full Name"
              placeholder="Ramesh Kumar"
              error={errors.name?.message}
              {...register('name')}
            />
            <Input
              label="Email"
              type="email"
              placeholder="you@example.com"
              error={errors.email?.message}
              {...register('email')}
            />
            <Input
              label="Mobile Number"
              type="tel"
              placeholder="9876543210"
              error={errors.phone?.message}
              {...register('phone')}
            />
            <div className="relative">
              <Input
                label="Password"
                type={showPassword ? 'text' : 'password'}
                placeholder="Min 8 chars, uppercase & number"
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
              Create Account
            </Button>
          </form>

          <div className="auth-divider"><span>or sign up with</span></div>
          <GoogleSignIn onCredential={onGoogleCredential} onError={setServerError} disabled={googleBusy} />
          <p className="google-register-hint">Your selected account type will be used to complete your Google sign-up. A phone number is optional.</p>

          <p className="text-center text-sm text-gray-500 mt-5">
            Already have an account?{' '}
            <Link to="/login" className="text-primary-600 font-medium hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Register;
