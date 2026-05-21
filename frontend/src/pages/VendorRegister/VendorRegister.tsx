import { useMemo, useState, useEffect, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, ArrowRight, Check, ChevronDown, Loader2, MapPin, ShieldCheck, Store } from 'lucide-react';
import './VendorRegister.css';
import { MARKETPLACE_DICTIONARY } from '../../utils/clientDictionary';
import { useToast } from '../../contexts/ToastContext';
import { getUiErrorMessage } from '../../utils/errorMessage';
import { useAuth } from '../../contexts/AuthContext';
import { storeService } from '../../services/storeService';
import { hasBackendJwt } from '../../services/apiClient';
import { useAddressLocation } from '../../hooks/useAddressLocation';

type WizardStep = 'shop' | 'contact' | 'compliance' | 'success';

interface ShopInfo {
  shopName: string;
  brandName: string;
  slug: string;
  address: string;
  city: string;
  district: string;
}

interface ContactInfo {
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  shippingLeadTime: string;
  returnPolicy: string;
}

interface ComplianceInfo {
  taxCode: string;
  businessType: string;
  agree: boolean;
}

const steps: WizardStep[] = ['shop', 'contact', 'compliance'];

const stepIcons: Record<WizardStep, ReactNode> = {
  shop: <Store size={16} strokeWidth={1.5} />,
  contact: <MapPin size={16} strokeWidth={1.5} />,
  compliance: <ShieldCheck size={16} strokeWidth={1.5} />,
  success: <Check size={16} strokeWidth={1.5} />,
};

const stepLabels: Record<WizardStep, string> = {
  shop: MARKETPLACE_DICTIONARY.vendor.wizard.steps.shopInfo,
  contact: MARKETPLACE_DICTIONARY.vendor.wizard.steps.contact,
  compliance: MARKETPLACE_DICTIONARY.vendor.wizard.steps.compliance,
  success: MARKETPLACE_DICTIONARY.vendor.wizard.success.title,
};

const VendorRegister = () => {
  const dict = MARKETPLACE_DICTIONARY.vendor;
  const navigate = useNavigate();
  const { addToast } = useToast();
  const { user } = useAuth();
  const addressLocation = useAddressLocation({ loadOnMount: true });

  const [currentStep, setCurrentStep] = useState<WizardStep>('shop');
  const [isSubmitting, setSubmitting] = useState(false);
  const [shopInfo, setShopInfo] = useState<ShopInfo>({
    shopName: '',
    brandName: '',
    slug: '',
    address: '',
    city: '',
    district: '',
  });
  const [contactInfo, setContactInfo] = useState<ContactInfo>({
    contactName: user?.name || '',
    contactPhone: user?.phone || '',
    contactEmail: user?.email || '',
    shippingLeadTime: '',
    returnPolicy: '',
  });
  const [complianceInfo, setComplianceInfo] = useState<ComplianceInfo>({
    taxCode: '',
    businessType: '',
    agree: false,
  });

  const highlightPills = [dict.benefits.lowCommission, dict.benefits.easyTools, dict.benefits.reach];
  const onboardingChecklist = [
    'Thông tin gian hàng trùng khớp hồ sơ pháp lý.',
    'Số điện thoại và email luôn sẵn sàng phản hồi.',
    'Chính sách vận hành, đổi trả rõ ràng cho khách hàng.',
  ];

  const stepIndex = currentStep === 'success' ? steps.length - 1 : steps.indexOf(currentStep);
  const progress = ((stepIndex + 1) / steps.length) * 100;

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [currentStep]);

  const canProceed = useMemo(() => {
    if (currentStep === 'shop') {
      return Boolean(
        shopInfo.shopName
        && shopInfo.brandName
        && shopInfo.slug
        && shopInfo.address
        && shopInfo.city
        && shopInfo.district,
      );
    }
    if (currentStep === 'contact') {
      return Boolean(
        contactInfo.contactName
        && contactInfo.contactPhone
        && contactInfo.contactEmail
        && contactInfo.shippingLeadTime,
      );
    }
    if (currentStep === 'compliance') {
      return Boolean(complianceInfo.taxCode && complianceInfo.businessType && complianceInfo.agree);
    }
    return false;
  }, [currentStep, shopInfo, contactInfo, complianceInfo]);

  const goNext = () => {
    if (currentStep === 'compliance') {
      void handleSubmit();
      return;
    }
    const idx = steps.indexOf(currentStep);
    setCurrentStep(steps[idx + 1]);
  };

  const goBack = () => {
    const idx = steps.indexOf(currentStep);
    if (idx <= 0) return;
    setCurrentStep(steps[idx - 1]);
  };

  const handleSubmit = async () => {
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
        shopName: shopInfo.shopName,
        brandName: shopInfo.brandName,
        slug: shopInfo.slug,
        address: shopInfo.address,
        city: shopInfo.city,
        district: shopInfo.district,
        contactName: contactInfo.contactName,
        contactPhone: contactInfo.contactPhone,
        contactEmail: contactInfo.contactEmail,
        shippingLeadTime: contactInfo.shippingLeadTime,
        returnPolicy: contactInfo.returnPolicy,
        taxCode: complianceInfo.taxCode,
        businessType: complianceInfo.businessType,
      });

      setCurrentStep('success');
      addToast(dict.wizard.success.pendingTag, 'success');
    } catch (err: unknown) {
      addToast(getUiErrorMessage(err, 'Gửi đăng ký thất bại'), 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const renderStepContent = () => {
    if (currentStep === 'shop') {
      return (
        <motion.div
          key="shop"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          transition={{ duration: 0.25 }}
        >
          <div className="vr-grid">
            <Field
              label={dict.form.shopName}
              value={shopInfo.shopName}
              onChange={(v) => setShopInfo({ ...shopInfo, shopName: v })}
              placeholder="Phố Mặc Studio"
            />
            <Field
              label={dict.form.brandName}
              value={shopInfo.brandName}
              onChange={(v) => setShopInfo({ ...shopInfo, brandName: v })}
              placeholder="Thương hiệu / Brand"
            />
            <Field
              label={dict.form.slug}
              value={shopInfo.slug}
              onChange={(v) => setShopInfo({ ...shopInfo, slug: v })}
              prefix="/store/"
              placeholder="pho-mac"
            />
            <Field
              label={dict.form.address}
              value={shopInfo.address}
              onChange={(v) => setShopInfo({ ...shopInfo, address: v })}
              placeholder="123 Pasteur, Quận 3"
              fullWidth
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
        </motion.div>
      );
    }

    if (currentStep === 'contact') {
      return (
        <motion.div
          key="contact"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          transition={{ duration: 0.25 }}
        >
          <div className="vr-grid">
            <Field
              label={dict.form.contactName}
              value={contactInfo.contactName}
              onChange={(v) => setContactInfo({ ...contactInfo, contactName: v })}
              placeholder="Nguyễn Văn A"
            />
            <Field
              label={dict.form.contactPhone}
              value={contactInfo.contactPhone}
              onChange={(v) => setContactInfo({ ...contactInfo, contactPhone: v })}
              placeholder="09xx xxx xxx"
            />
            <Field
              label={dict.form.contactEmail}
              value={contactInfo.contactEmail}
              onChange={(v) => setContactInfo({ ...contactInfo, contactEmail: v })}
              placeholder="you@brand.com"
            />
            <Field
              label={dict.form.shippingLeadTime}
              value={contactInfo.shippingLeadTime}
              onChange={(v) => setContactInfo({ ...contactInfo, shippingLeadTime: v })}
              placeholder="24-48h"
            />
            <Field
              label={dict.form.logistics}
              value={contactInfo.returnPolicy}
              onChange={(v) => setContactInfo({ ...contactInfo, returnPolicy: v })}
              placeholder="Đổi trả trong 15 ngày, bên bán chịu phí"
              fullWidth
            />
          </div>
        </motion.div>
      );
    }

    if (currentStep === 'compliance') {
      return (
        <motion.div
          key="compliance"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          transition={{ duration: 0.25 }}
        >
          <div className="vr-grid">
            <Field
              label={dict.form.taxCode}
              value={complianceInfo.taxCode}
              onChange={(v) => setComplianceInfo({ ...complianceInfo, taxCode: v })}
              placeholder="MST / CCCD"
            />
            <Field
              label={dict.form.businessType}
              value={complianceInfo.businessType}
              onChange={(v) => setComplianceInfo({ ...complianceInfo, businessType: v })}
              placeholder="Hộ kinh doanh / Công ty"
            />
            <div className="vr-checkbox">
              <input
                id="agree"
                type="checkbox"
                checked={complianceInfo.agree}
                onChange={(e) => setComplianceInfo({ ...complianceInfo, agree: e.target.checked })}
              />
              <label htmlFor="agree">{dict.form.agree}</label>
            </div>
            <div className="vr-note">{dict.form.commissionNote}: 5% - 8% tùy ngành hàng</div>
          </div>
        </motion.div>
      );
    }

    return (
      <motion.div key="success" className="vr-success" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}>
        <div className="vr-success-icon">{stepIcons.success}</div>
        <h2>{dict.wizard.success.title}</h2>
        <p>{dict.wizard.success.subtitle}</p>
        <div className="vr-success-tag">{dict.wizard.success.pendingTag}</div>
        <div className="vr-success-actions">
          <button className="vr-btn" onClick={() => navigate('/')}>{dict.wizard.success.cta}</button>
        </div>
      </motion.div>
    );
  };

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
            <div className="vr-hero-icon">{stepIcons.shop}</div>
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
              <h2>{stepLabels[currentStep]}</h2>
            </div>
            <div className="vr-progress">
              <div className="vr-progress-bar" style={{ width: `${progress}%` }} />
            </div>
          </div>

          <div className="vr-stepper">
            {steps.map((step) => {
              const active = step === currentStep;
              const done = steps.indexOf(step) < stepIndex;
              return (
                <div key={step} className={`vr-step ${active ? 'active' : ''} ${done ? 'done' : ''}`}>
                  <div className="vr-step-icon">{done ? <Check size={14} strokeWidth={1.5} /> : stepIcons[step]}</div>
                  <span>{stepLabels[step]}</span>
                </div>
              );
            })}
          </div>

          <div className="vr-body">
            <AnimatePresence mode="wait">{renderStepContent()}</AnimatePresence>
          </div>

          {currentStep !== 'success' && (
            <div className="vr-actions">
              <button className="vr-btn ghost" onClick={goBack} disabled={currentStep === 'shop'}>
                <ArrowLeft size={16} /> {dict.wizard.actions.back}
              </button>
              <button className="vr-btn" onClick={goNext} disabled={!canProceed || isSubmitting}>
                {isSubmitting
                  ? (
                    <>
                      <Loader2 size={16} className="spin" /> {dict.wizard.actions.submitting}
                    </>
                    )
                  : (
                    <>
                      {currentStep === 'compliance' ? dict.wizard.actions.submit : dict.wizard.actions.next}
                      <ArrowRight size={16} />
                    </>
                    )}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

interface FieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  prefix?: string;
  fullWidth?: boolean;
}

const Field = ({ label, value, onChange, placeholder, prefix, fullWidth }: FieldProps) => {
  return (
    <div className={`vr-field ${fullWidth ? 'full' : ''}`}>
      <label>{label}</label>
      <div className="vr-input-wrap">
        {prefix && <span className="vr-prefix">{prefix}</span>}
        <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
      </div>
    </div>
  );
};

export default VendorRegister;
