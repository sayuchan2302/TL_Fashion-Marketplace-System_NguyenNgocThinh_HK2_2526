import { useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Check, ChevronDown, Loader2, MapPin, Store } from 'lucide-react';
import './VendorRegister.css';
import { MARKETPLACE_DICTIONARY } from '../../utils/clientDictionary';
import { useToast } from '../../contexts/ToastContext';
import { getUiErrorMessage } from '../../utils/errorMessage';
import { useAuth } from '../../contexts/AuthContext';
import { storeService } from '../../services/storeService';
import { hasBackendJwt } from '../../services/apiClient';
import { useAddressLocation } from '../../hooks/useAddressLocation';

type FormSection = 'shop' | 'contact' | 'success';

interface ShopInfo {
  shopName: string;
  slug: string;
  address: string;
  city: string;
  district: string;
}

interface ContactInfo {
  contactName: string;
  contactPhone: string;
  contactEmail: string;
}

const hasValue = (value: string) => value.trim().length > 0;

const sectionIcons: Record<FormSection, ReactNode> = {
  shop: <Store size={16} strokeWidth={1.5} />,
  contact: <MapPin size={16} strokeWidth={1.5} />,
  success: <Check size={16} strokeWidth={1.5} />,
};

const sectionLabels: Record<Exclude<FormSection, 'success'>, string> = {
  shop: MARKETPLACE_DICTIONARY.vendor.wizard.steps.shopInfo,
  contact: MARKETPLACE_DICTIONARY.vendor.contactInfo,
};

const VendorRegister = () => {
  const dict = MARKETPLACE_DICTIONARY.vendor;
  const navigate = useNavigate();
  const { addToast } = useToast();
  const { user } = useAuth();
  const addressLocation = useAddressLocation({ loadOnMount: true });

  const [isSubmitting, setSubmitting] = useState(false);
  const [isSubmitted, setSubmitted] = useState(false);
  const [shopInfo, setShopInfo] = useState<ShopInfo>({
    shopName: '',
    slug: '',
    address: '',
    city: '',
    district: '',
  });
  const [contactInfo, setContactInfo] = useState<ContactInfo>({
    contactName: user?.name || '',
    contactPhone: user?.phone || '',
    contactEmail: user?.email || '',
  });
  const highlightPills = [dict.benefits.lowCommission, dict.benefits.easyTools, dict.benefits.reach];
  const onboardingChecklist = [
    'Thông tin gian hàng trùng khớp hồ sơ pháp lý.',
    'Số điện thoại và email luôn sẵn sàng phản hồi.',
    'Địa chỉ kinh doanh rõ ràng để hệ thống phê duyệt nhanh hơn.',
  ];

  const canSubmit = useMemo(() => [
    shopInfo.shopName,
    shopInfo.slug,
    shopInfo.address,
    shopInfo.city,
    shopInfo.district,
    contactInfo.contactName,
    contactInfo.contactPhone,
    contactInfo.contactEmail,
  ].every(hasValue), [shopInfo, contactInfo]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit || isSubmitting) {
      return;
    }

    if (!hasBackendJwt()) {
      const current = typeof window !== 'undefined'
        ? `${window.location.pathname}${window.location.search}${window.location.hash}`
        : '/vendor/register';
      addToast('Vui lòng đăng nhập để gửi xét duyệt gian hàng.', 'info');
      navigate(`/login?reason=${encodeURIComponent('auth-required')}&redirect=${encodeURIComponent(current)}`);
      return;
    }

    setSubmitting(true);
    try {
      await storeService.registerStore({
        shopName: shopInfo.shopName.trim(),
        slug: shopInfo.slug.trim(),
        address: shopInfo.address.trim(),
        city: shopInfo.city.trim(),
        district: shopInfo.district.trim(),
        contactName: contactInfo.contactName.trim(),
        contactPhone: contactInfo.contactPhone.trim(),
        contactEmail: contactInfo.contactEmail.trim(),
      });

      setSubmitted(true);
      addToast(dict.wizard.success.pendingTag, 'success');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err: unknown) {
      addToast(getUiErrorMessage(err, 'Gửi đăng ký thất bại'), 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const renderSuccess = () => (
    <motion.div
      key="success"
      className="vr-success"
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
    >
      <div className="vr-success-icon">{sectionIcons.success}</div>
      <h2>{dict.wizard.success.title}</h2>
      <p>{dict.wizard.success.subtitle}</p>
      <div className="vr-success-tag">{dict.wizard.success.pendingTag}</div>
      <div className="vr-success-actions">
        <button className="vr-btn" onClick={() => navigate('/')}>{dict.wizard.success.cta}</button>
      </div>
    </motion.div>
  );

  const renderForm = () => (
    <form className="vr-form" onSubmit={handleSubmit}>
      <section className="vr-form-section">
        <SectionHeader icon={sectionIcons.shop} title={sectionLabels.shop} />
        <div className="vr-grid">
          <Field
            label={dict.form.shopName}
            value={shopInfo.shopName}
            onChange={(v) => setShopInfo({ ...shopInfo, shopName: v })}
            placeholder="Phố Mặc Studio"
            required
          />
          <Field
            label={dict.form.slug}
            value={shopInfo.slug}
            onChange={(v) => setShopInfo({ ...shopInfo, slug: v })}
            prefix="/store/"
            placeholder="pho-mac"
            required
          />
          <Field
            label={dict.form.address}
            value={shopInfo.address}
            onChange={(v) => setShopInfo({ ...shopInfo, address: v })}
            placeholder="123 Pasteur, Quận 3"
            fullWidth
            required
          />

          <div className="vr-field">
            <label>{dict.form.city}</label>
            <div className="vr-input-wrap vr-select-wrap">
              <select
                className="vr-select"
                aria-label={dict.form.city}
                value={addressLocation.selectedProvinceCode}
                onChange={(e) => {
                  const code = e.target.value;
                  addressLocation.setSelectedProvinceCode(code);
                  setShopInfo((prev) => ({
                    ...prev,
                    city: addressLocation.getProvinceName(code),
                    district: '',
                  }));
                }}
                required
              >
                <option value="">
                  {addressLocation.loadingProvinces ? 'Đang tải...' : '-- Chọn Tỉnh / Thành phố --'}
                </option>
                {addressLocation.provinces.map((province) => (
                  <option key={province.code} value={province.code}>
                    {province.name}
                  </option>
                ))}
              </select>
              <ChevronDown className="vr-select-icon" size={16} aria-hidden="true" />
            </div>
          </div>

          <div className="vr-field">
            <label>{dict.form.district}</label>
            <div className="vr-input-wrap vr-select-wrap">
              <select
                className="vr-select"
                aria-label={dict.form.district}
                value={addressLocation.selectedDistrictCode}
                onChange={(e) => {
                  const code = e.target.value;
                  addressLocation.setSelectedDistrictCode(code);
                  setShopInfo((prev) => ({
                    ...prev,
                    district: addressLocation.getDistrictName(code),
                  }));
                }}
                disabled={!addressLocation.selectedProvinceCode}
                required
              >
                <option value="">
                  {addressLocation.loadingDistricts ? 'Đang tải...' : '-- Chọn Quận / Huyện --'}
                </option>
                {addressLocation.districts.map((district) => (
                  <option key={district.code} value={district.code}>
                    {district.name}
                  </option>
                ))}
              </select>
              <ChevronDown className="vr-select-icon" size={16} aria-hidden="true" />
            </div>
          </div>
        </div>
      </section>

      <section className="vr-form-section">
        <SectionHeader icon={sectionIcons.contact} title={sectionLabels.contact} />
        <div className="vr-grid">
          <Field
            label={dict.form.contactName}
            value={contactInfo.contactName}
            onChange={(v) => setContactInfo({ ...contactInfo, contactName: v })}
            placeholder="Nguyễn Văn A"
            required
          />
          <Field
            label={dict.form.contactPhone}
            value={contactInfo.contactPhone}
            onChange={(v) => setContactInfo({ ...contactInfo, contactPhone: v })}
            placeholder="09xx xxx xxx"
            required
          />
          <Field
            label={dict.form.contactEmail}
            value={contactInfo.contactEmail}
            onChange={(v) => setContactInfo({ ...contactInfo, contactEmail: v })}
            placeholder="you@brand.com"
            required
          />
        </div>
      </section>

      <div className="vr-actions">
        <button className="vr-btn" type="submit" disabled={!canSubmit || isSubmitting}>
          {isSubmitting
            ? (
              <>
                <Loader2 size={16} className="spin" /> {dict.wizard.actions.submitting}
              </>
              )
            : (
              <>
                {dict.wizard.actions.submit}
                <Check size={16} />
              </>
              )}
        </button>
      </div>
    </form>
  );

  return (
    <div className="vr-page">
      <div className="vr-shell container">
        <nav className="vr-breadcrumbs" aria-label="Breadcrumb">
          <Link to="/">Trang chủ</Link>
          <span>/</span>
          <span>Đăng ký bán hàng</span>
        </nav>

        <div className="vr-hero">
          <div className="vr-hero-left">
            <div className="vr-badge">{dict.register}</div>
            <h1>{dict.registerTitle}</h1>
            <p>{dict.registerSubtitle}</p>
            <div className="vr-pills">
              {highlightPills.map((item) => (
                <span key={item}>{item}</span>
              ))}
            </div>
          </div>

          <div className="vr-hero-right">
            <div className="vr-hero-icon">{sectionIcons.shop}</div>
            <div className="vr-hero-meta">
              <div className="vr-meta-title">Checklist hồ sơ trước khi gửi</div>
              <ul>
                {onboardingChecklist.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        <div className="vr-card">
          <div className="vr-header">
            <div>
              <div className="vr-label">{dict.wizard.stepperLabel}</div>
              <h2>{isSubmitted ? dict.wizard.success.title : dict.submit}</h2>
            </div>
          </div>

          {isSubmitted ? renderSuccess() : renderForm()}
        </div>
      </div>
    </div>
  );
};

interface SectionHeaderProps {
  icon: ReactNode;
  title: string;
}

const SectionHeader = ({ icon, title }: SectionHeaderProps) => (
  <div className="vr-section-heading">
    <div className="vr-section-icon">{icon}</div>
    <h3>{title}</h3>
  </div>
);

interface FieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  prefix?: string;
  fullWidth?: boolean;
  required?: boolean;
}

const Field = ({ label, value, onChange, placeholder, prefix, fullWidth, required }: FieldProps) => {
  return (
    <div className={`vr-field ${fullWidth ? 'full' : ''}`}>
      <label>{label}</label>
      <div className="vr-input-wrap">
        {prefix && <span className="vr-prefix">{prefix}</span>}
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          required={required}
        />
      </div>
    </div>
  );
};

export default VendorRegister;
