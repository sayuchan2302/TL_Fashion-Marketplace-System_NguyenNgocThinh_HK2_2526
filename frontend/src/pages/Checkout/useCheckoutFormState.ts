import { useCallback, useState } from 'react';
import { authService } from '../../services/authService';
import { apiRequest } from '../../services/apiClient';
import { useAddressLocation } from '../../hooks/useAddressLocation';
import { isValidVietnamesePhone, normalizeVietnamesePhone } from '../../utils/phone';
import type { Address } from '../../types';
import type {
  BackendAddressPayload,
  CheckoutFormValues,
  FormErrors,
} from './checkout.types';
import { DEFAULT_CHECKOUT_FORM_VALUES } from './checkout.types';
import { CLIENT_TEXT } from '../../utils/texts';

const t = CLIENT_TEXT.checkout;

const fieldErrorMap: Partial<Record<keyof CheckoutFormValues, keyof FormErrors>> = {
  name: 'name',
  phone: 'phone',
  email: 'email',
  address: 'address',
  province: 'city',
  district: 'district',
  ward: 'ward',
  note: 'note',
};

export const useCheckoutFormState = () => {
  const [formValues, setFormValues] = useState<CheckoutFormValues>(() => {
    const session = authService.getSession() || authService.getAdminSession();
    const sessionEmail = (session?.user?.email || '').trim();

    return sessionEmail
      ? {
        ...DEFAULT_CHECKOUT_FORM_VALUES,
        email: sessionEmail,
      }
      : DEFAULT_CHECKOUT_FORM_VALUES;
  });
  const [formErrors, setFormErrors] = useState<FormErrors>({});
  const [saveAddressToBook, setSaveAddressToBook] = useState(true);
  const [isAddressFromBook, setIsAddressFromBook] = useState(false);
  const addressLocation = useAddressLocation();

  const handleFieldChange = useCallback((field: keyof CheckoutFormValues, value: string) => {
    if (field !== 'email' && field !== 'note' && isAddressFromBook) {
      setIsAddressFromBook(false);
    }

    setFormValues((prev) => ({ ...prev, [field]: value }));

    const errorKey = fieldErrorMap[field];
    if (errorKey && formErrors[errorKey]) {
      setFormErrors((prev) => ({ ...prev, [errorKey]: undefined }));
    }
  }, [formErrors, isAddressFromBook]);

  const handleProvinceChange = useCallback((provinceCode: string) => {
    addressLocation.setSelectedProvinceCode(provinceCode);
    setFormValues((prev) => ({
      ...prev,
      province: addressLocation.getProvinceName(provinceCode),
      district: '',
      ward: '',
    }));
    setFormErrors((prev) => ({
      ...prev,
      city: undefined,
      district: undefined,
      ward: undefined,
    }));
  }, [addressLocation]);

  const handleDistrictChange = useCallback((districtCode: string) => {
    addressLocation.setSelectedDistrictCode(districtCode);
    handleFieldChange('district', addressLocation.getDistrictName(districtCode));
    handleFieldChange('ward', '');
  }, [addressLocation, handleFieldChange]);

  const handleWardChange = useCallback((wardCode: string) => {
    addressLocation.setSelectedWardCode(wardCode);
    handleFieldChange('ward', addressLocation.getWardName(wardCode));
  }, [addressLocation, handleFieldChange]);

  const handleAddressSelect = useCallback((address: Address) => {
    setIsAddressFromBook(true);
    setFormValues((prev) => ({
      ...prev,
      name: address.fullName,
      phone: address.phone,
      address: address.detail,
      ward: address.ward,
      district: address.district,
      province: address.province,
    }));
    void addressLocation.setLocationByNames(address.province, address.district, address.ward);
    setFormErrors({});
  }, [addressLocation]);

  const validateForm = useCallback(() => {
    const errors: FormErrors = {};
    if (!formValues.name.trim()) {
      errors.name = t.validation.requiredName;
    }
    if (!formValues.phone.trim()) {
      errors.phone = t.validation.requiredPhone;
    } else if (!isValidVietnamesePhone(formValues.phone)) {
      errors.phone = t.validation.invalidPhone;
    }
    if (!formValues.address.trim()) {
      errors.address = t.validation.requiredAddress;
    }
    if (!formValues.province) {
      errors.city = t.validation.requiredCity;
    }
    if (!formValues.district) {
      errors.district = t.validation.requiredDistrict;
    }
    if (!formValues.ward) {
      errors.ward = t.validation.requiredWard;
    }

    setFormErrors(errors);
    return errors;
  }, [formValues]);

  const resolveBackendAddress = useCallback(async () => {
    const normalizedPhone = normalizeVietnamesePhone(formValues.phone);
    const addresses = await apiRequest<BackendAddressPayload[]>('/api/addresses', {}, { auth: true });
    const matching = addresses.find((address) =>
      (address.fullName || '').trim() === formValues.name.trim() &&
      normalizeVietnamesePhone(address.phone || '') === normalizedPhone &&
      (address.detail || '').trim() === formValues.address.trim() &&
      (address.ward || '').trim() === formValues.ward.trim() &&
      (address.district || '').trim() === formValues.district.trim() &&
      (address.province || '').trim() === formValues.province.trim(),
    );

    if (matching) {
      return matching;
    }

    return apiRequest<BackendAddressPayload>('/api/addresses', {
      method: 'POST',
      body: JSON.stringify({
        fullName: formValues.name.trim(),
        phone: normalizedPhone,
        detail: formValues.address.trim(),
        ward: formValues.ward.trim(),
        district: formValues.district.trim(),
        province: formValues.province.trim(),
        isDefault: false,
        ghnProvinceId: addressLocation.selectedProvinceCode ? Number(addressLocation.selectedProvinceCode) : undefined,
        ghnDistrictId: addressLocation.selectedDistrictCode ? Number(addressLocation.selectedDistrictCode) : undefined,
        ghnWardCode: addressLocation.selectedWardCode || undefined,
      }),
    }, { auth: true });
  }, [formValues]);

  return {
    addressLocation,
    formValues,
    formErrors,
    saveAddressToBook,
    setSaveAddressToBook,
    isAddressFromBook,
    handleFieldChange,
    handleProvinceChange,
    handleDistrictChange,
    handleWardChange,
    handleAddressSelect,
    validateForm,
    resolveBackendAddress,
  };
};
