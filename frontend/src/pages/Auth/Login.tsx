import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Loader2, ShieldCheck } from 'lucide-react';
import './Auth.css';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { getReasonToast, getUiErrorMessage } from '../../utils/errorMessage';
import GoogleLoginButton from './GoogleLoginButton';
import FacebookLoginButton from './FacebookLoginButton';

const handledReasonKeys = new Set<string>();

const Login = () => {
  const { login, loginWithGoogle, loginWithFacebook, isAuthenticated } = useAuth();
  const { addToast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [facebookLoading, setFacebookLoading] = useState(false);

  const redirectTo = useMemo(() => {
    const query = new URLSearchParams(location.search);
    const redirectFromQuery = query.get('redirect');
    const redirectFromState = (location.state as { from?: string } | null)?.from;
    return redirectFromQuery || redirectFromState || '/';
  }, [location.search, location.state]);

  useEffect(() => {
    if (isAuthenticated) {
      navigate('/', { replace: true });
    }
  }, [isAuthenticated, navigate]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const reason = params.get('reason');
    if (!reason) {
      return;
    }

    const reasonKey = `${reason}|${params.get('redirect') || ''}`;
    if (handledReasonKeys.has(reasonKey)) {
      return;
    }
    handledReasonKeys.add(reasonKey);

    const reasonToast = getReasonToast(reason);
    if (reasonToast) {
      addToast(reasonToast.message, reasonToast.type);
    }

    params.delete('reason');
    const nextSearch = params.toString();
    navigate(
      {
        pathname: location.pathname,
        search: nextSearch ? `?${nextSearch}` : '',
      },
      { replace: true },
    );
  }, [location.pathname, location.search, addToast, navigate]);

  const validate = () => {
    const next: typeof errors = {};
    if (!email.trim()) next.email = 'Vui lòng nhập email';
    if (!password.trim()) next.password = 'Vui lòng nhập mật khẩu';
    return next;
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const nextErrors = validate();
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    try {
      setLoading(true);
      await login(email.trim(), password.trim());
      addToast('Đăng nhập thành công', 'success');
      navigate(redirectTo, { replace: true });
    } catch (error: unknown) {
      addToast(getUiErrorMessage(error, 'Đăng nhập thất bại'), 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleIdToken = async (idToken: string) => {
    try {
      setGoogleLoading(true);
      await loginWithGoogle(idToken);
      addToast('Đăng nhập Google thành công', 'success');
      navigate(redirectTo, { replace: true });
    } catch (error: unknown) {
      addToast(getUiErrorMessage(error, 'Đăng nhập Google thất bại'), 'error');
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleFacebookAccessToken = async (accessToken: string) => {
    try {
      setFacebookLoading(true);
      await loginWithFacebook(accessToken);
      addToast('Đăng nhập Facebook thành công', 'success');
      navigate(redirectTo, { replace: true });
    } catch (error: unknown) {
      addToast(getUiErrorMessage(error, 'Đăng nhập Facebook thất bại'), 'error');
    } finally {
      setFacebookLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1 className="auth-title">Đăng nhập</h1>
        <p className="auth-subtitle">Đăng nhập để tích lũy quyền lợi và xem đơn hàng của bạn.</p>

        <form className="auth-form" onSubmit={handleSubmit} noValidate>
          <div className="auth-field">
            <label>Email</label>
            <input
              className="auth-input"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              name="email"
              autoComplete="email"
              spellCheck={false}
            />
            {errors.email && <div className="auth-error">{errors.email}</div>}
          </div>

          <div className="auth-field">
            <label>Mật khẩu</label>
            <div className="auth-password-control">
              <input
                className="auth-input auth-password-input"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="••••••••"
                name="password"
                autoComplete="current-password"
              />
              <button
                type="button"
                className="auth-password-toggle"
                onClick={() => setShowPassword((value) => !value)}
                aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiển thị mật khẩu'}
                aria-pressed={showPassword}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            {errors.password && <div className="auth-error">{errors.password}</div>}
          </div>

          <div className="auth-link-row">
            <span />
            <Link to="/forgot">Quên mật khẩu?</Link>
          </div>

          <div className="auth-actions">
            <button type="submit" className="auth-btn" disabled={loading}>
              {loading ? <><Loader2 size={18} className="auth-spinner" /> Đang đăng nhập...</> : 'Đăng nhập'}
            </button>
            <div className="auth-divider">
              <span>Hoặc tiếp tục với</span>
            </div>
            <div className="social-row">
              <GoogleLoginButton disabled={loading || googleLoading || facebookLoading} onIdToken={handleGoogleIdToken} />
              <FacebookLoginButton disabled={loading || googleLoading || facebookLoading} onAccessToken={handleFacebookAccessToken} />
            </div>
            <div className="auth-secondary">
              Chưa có tài khoản? <Link to="/register">Đăng ký ngay</Link>
            </div>
            <div className="auth-secondary" style={{ display: 'inline-flex', gap: 6, alignItems: 'center', justifyContent: 'center' }}>
              <ShieldCheck size={16} /> Bảo mật thanh toán và thông tin khách hàng
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Login;
