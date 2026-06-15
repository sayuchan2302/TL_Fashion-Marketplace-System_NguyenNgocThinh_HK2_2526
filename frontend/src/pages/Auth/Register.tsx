import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Loader2, Sparkles } from 'lucide-react';
import './Auth.css';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { getUiErrorMessage } from '../../utils/errorMessage';
import GoogleLoginButton from './GoogleLoginButton';
import FacebookLoginButton from './FacebookLoginButton';

const Register = () => {
  const { register, isAuthenticated, loginWithGoogle, loginWithFacebook } = useAuth();
  const { addToast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    if (isAuthenticated) {
      navigate('/', { replace: true });
    }
  }, [isAuthenticated, navigate]);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [errors, setErrors] = useState<{ name?: string; email?: string; password?: string; confirm?: string }>({});
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [facebookLoading, setFacebookLoading] = useState(false);

  const validate = () => {
    const next: typeof errors = {};
    if (!name.trim()) next.name = 'Vui lòng nhập họ tên';
    if (!email.trim()) next.email = 'Vui lòng nhập email';
    if (!password.trim()) next.password = 'Vui lòng nhập mật khẩu';
    else if (password.trim().length < 6) next.password = 'Tối thiểu 6 ký tự';
    if (confirm.trim() !== password.trim()) next.confirm = 'Mật khẩu không khớp';
    return next;
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const nextErrors = validate();
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    try {
      setLoading(true);
      await register(name.trim(), email.trim(), password.trim());
      addToast('Tạo tài khoản thành công', 'success');
      navigate('/', { replace: true });
    } catch (error: unknown) {
      addToast(getUiErrorMessage(error, 'Đăng ký thất bại'), 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleIdToken = async (idToken: string) => {
    try {
      setGoogleLoading(true);
      await loginWithGoogle(idToken);
      addToast('Đăng ký Google thành công', 'success');
      navigate('/', { replace: true });
    } catch (error: unknown) {
      addToast(getUiErrorMessage(error, 'Đăng ký Google thất bại'), 'error');
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleFacebookAccessToken = async (accessToken: string) => {
    try {
      setFacebookLoading(true);
      await loginWithFacebook(accessToken);
      addToast('Đăng ký Facebook thành công', 'success');
      navigate('/', { replace: true });
    } catch (error: unknown) {
      addToast(getUiErrorMessage(error, 'Đăng ký Facebook thất bại'), 'error');
    } finally {
      setFacebookLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1 className="auth-title">Đăng ký</h1>
        <p className="auth-subtitle">Trở thành thành viên để nhận ưu đãi và theo dõi đơn hàng dễ dàng.</p>

        <form className="auth-form" onSubmit={handleSubmit} noValidate>
          <div className="auth-field">
            <label>Họ và tên</label>
            <input
              className="auth-input"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Nguyễn Văn A"
            />
            {errors.name && <div className="auth-error">{errors.name}</div>}
          </div>

          <div className="auth-field">
            <label>Email</label>
            <input
              className="auth-input"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
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
                autoComplete="new-password"
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

          <div className="auth-field">
            <label>Nhập lại mật khẩu</label>
            <div className="auth-password-control">
              <input
                className="auth-input auth-password-input"
                type={showConfirmPassword ? 'text' : 'password'}
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
                placeholder="••••••••"
                autoComplete="new-password"
              />
              <button
                type="button"
                className="auth-password-toggle"
                onClick={() => setShowConfirmPassword((value) => !value)}
                aria-label={showConfirmPassword ? 'Ẩn mật khẩu' : 'Hiển thị mật khẩu'}
                aria-pressed={showConfirmPassword}
              >
                {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            {errors.confirm && <div className="auth-error">{errors.confirm}</div>}
          </div>

          <div className="auth-actions">
            <button type="submit" className="auth-btn" disabled={loading}>
              {loading ? <><Loader2 size={18} className="auth-spinner" /> Đang tạo tài khoản...</> : <><Sparkles size={18} /> Đăng ký</>}
            </button>
            <div className="auth-divider">
              <span>Hoặc tiếp tục với</span>
            </div>
            <div className="social-row">
              <GoogleLoginButton disabled={loading || googleLoading || facebookLoading} onIdToken={handleGoogleIdToken} text="signup_with" />
              <FacebookLoginButton disabled={loading || googleLoading || facebookLoading} onAccessToken={handleFacebookAccessToken} />
            </div>
            <div className="auth-secondary">
              Đã có tài khoản? <Link to="/login">Đăng nhập</Link>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Register;
