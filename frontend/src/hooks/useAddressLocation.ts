import { useState, useEffect, useCallback } from 'react';

export interface Province {
  code: string | number;
  name: string;
}

export interface District {
  code: string | number;
  name: string;
}

export interface Ward {
  code: string | number;
  name: string;
}

const VITE_API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080';
const API_BASE = `${VITE_API_URL.replace(/\/$/, '')}/api/shipping/ghn`;
const LOCATION_PREFIX_PATTERN = /\b(tp|tinh|thanh pho|quan|huyen|thi xa|thi tran|phuong|xa)\b/gi;

const normalizeLocationName = (value: string) =>
  (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u0111\u0110]/g, 'd')
    .toLowerCase()
    .replace(LOCATION_PREFIX_PATTERN, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const findBestMatchByName = <T extends { name: string }>(rows: T[], target: string): T | undefined => {
  const normalizedTarget = normalizeLocationName(target);
  if (!normalizedTarget) return undefined;

  const exact = rows.find((row) => normalizeLocationName(row.name) === normalizedTarget);
  if (exact) return exact;

  return rows.find((row) => {
    const normalizedRow = normalizeLocationName(row.name);
    return normalizedRow.includes(normalizedTarget) || normalizedTarget.includes(normalizedRow);
  });
};

const findBestMatchByNameOrCode = <T extends { name: string; code: string | number }>(rows: T[], target: string): T | undefined => {
  const rawTarget = (target || '').trim();
  if (!rawTarget) return undefined;

  if (/^\d+$/.test(rawTarget)) {
    const byCode = rows.find((row) => String(row.code) === rawTarget);
    if (byCode) return byCode;
  }

  return findBestMatchByName(rows, rawTarget);
};

export interface UseAddressLocationOptions {
  loadOnMount?: boolean;
}

export interface UseAddressLocationReturn {
  provinces: Province[];
  districts: District[];
  wards: Ward[];
  loadingProvinces: boolean;
  loadingDistricts: boolean;
  loadingWards: boolean;
  selectedProvinceCode: string;
  selectedDistrictCode: string;
  selectedWardCode: string;
  selectedProvinceName: string;
  selectedDistrictName: string;
  selectedWardName: string;
  setSelectedProvinceCode: (code: string) => void;
  setSelectedDistrictCode: (code: string) => void;
  setSelectedWardCode: (code: string) => void;
  clearSelection: () => void;
  setLocationByNames: (provinceName: string, districtName: string, wardName: string) => Promise<void>;
  getProvinceName: (code: string) => string;
  getDistrictName: (code: string) => string;
  getWardName: (code: string) => string;
}

export function useAddressLocation(options: UseAddressLocationOptions = {}): UseAddressLocationReturn {
  const { loadOnMount = true } = options;

  const [provinces, setProvinces] = useState<Province[]>([]);
  const [districts, setDistricts] = useState<District[]>([]);
  const [wards, setWards] = useState<Ward[]>([]);

  const [loadingProvinces, setLoadingProvinces] = useState(false);
  const [loadingDistricts, setLoadingDistricts] = useState(false);
  const [loadingWards, setLoadingWards] = useState(false);

  const [selectedProvinceCode, setSelectedProvinceCodeState] = useState('');
  const [selectedDistrictCode, setSelectedDistrictCodeState] = useState('');
  const [selectedWardCode, setSelectedWardCodeState] = useState('');

  const [selectedProvinceName, setSelectedProvinceName] = useState('');
  const [selectedDistrictName, setSelectedDistrictName] = useState('');
  const [selectedWardName, setSelectedWardName] = useState('');

  const getProvinceName = useCallback((code: string) => {
    const province = provinces.find((p) => String(p.code) === code);
    return province?.name || '';
  }, [provinces]);

  const getDistrictName = useCallback((code: string) => {
    const district = districts.find((d) => String(d.code) === code);
    return district?.name || '';
  }, [districts]);

  const getWardName = useCallback((code: string) => {
    const ward = wards.find((w) => String(w.code) === code);
    return ward?.name || '';
  }, [wards]);

  const setSelectedProvinceCode = useCallback((code: string) => {
    setSelectedProvinceCodeState(code);
    setSelectedDistrictCodeState('');
    setSelectedWardCodeState('');
    setSelectedDistrictName('');
    setSelectedWardName('');
    if (code) {
      const province = provinces.find((p) => String(p.code) === code);
      setSelectedProvinceName(province?.name || '');
    } else {
      setSelectedProvinceName('');
    }
  }, [provinces]);

  const setSelectedDistrictCode = useCallback((code: string) => {
    setSelectedDistrictCodeState(code);
    setSelectedWardCodeState('');
    setSelectedWardName('');
    if (code) {
      const district = districts.find((d) => String(d.code) === code);
      setSelectedDistrictName(district?.name || '');
    } else {
      setSelectedDistrictName('');
    }
  }, [districts]);

  const setSelectedWardCode = useCallback((code: string) => {
    setSelectedWardCodeState(code);
    if (code) {
      const ward = wards.find((w) => String(w.code) === code);
      setSelectedWardName(ward?.name || '');
    } else {
      setSelectedWardName('');
    }
  }, [wards]);

  const clearSelection = useCallback(() => {
    setSelectedProvinceCodeState('');
    setSelectedDistrictCodeState('');
    setSelectedWardCodeState('');
    setSelectedProvinceName('');
    setSelectedDistrictName('');
    setSelectedWardName('');
    setDistricts((prev) => (prev.length === 0 ? prev : []));
    setWards((prev) => (prev.length === 0 ? prev : []));
  }, []);

  const setLocationByNames = useCallback(async (provinceName: string, districtName: string, wardName: string) => {
    const rawProvince = (provinceName || '').trim();
    const rawDistrict = (districtName || '').trim();
    const rawWard = (wardName || '').trim();

    if (!rawProvince) {
      clearSelection();
      return;
    }

    let sourceProvinces = provinces;
    if (sourceProvinces.length === 0) {
      setLoadingProvinces(true);
      try {
        const provinceRes = await fetch(`${API_BASE}/provinces`);
        const provinceData = await provinceRes.json();
        sourceProvinces = Array.isArray(provinceData) ? provinceData : [];
        setProvinces(sourceProvinces);
      } catch (err) {
        console.error('Failed to resolve provinces names:', err);
        sourceProvinces = [];
      } finally {
        setLoadingProvinces(false);
      }
    }

    const province = findBestMatchByNameOrCode(sourceProvinces, rawProvince);
    if (!province) {
      clearSelection();
      return;
    }

    setSelectedProvinceCodeState(String(province.code));
    setSelectedProvinceName(province.name);
    setLoadingDistricts(true);

    try {
      const distRes = await fetch(`${API_BASE}/districts?provinceId=${province.code}`);
      const distData = await distRes.json();
      const sourceDistricts = Array.isArray(distData) ? distData : (Array.isArray(distData?.districts) ? distData.districts : []);
      setDistricts(sourceDistricts);

      const district = findBestMatchByNameOrCode(sourceDistricts, rawDistrict);
      if (!district) {
        setSelectedDistrictCodeState('');
        setSelectedDistrictName('');
        setSelectedWardCodeState('');
        setSelectedWardName('');
        setWards([]);
        return;
      }

      setSelectedDistrictCodeState(String(district.code));
      setSelectedDistrictName(district.name);
      setLoadingWards(true);

      try {
        const wardRes = await fetch(`${API_BASE}/wards?districtId=${district.code}`);
        const wardData = await wardRes.json();
        const sourceWards = Array.isArray(wardData) ? wardData : (Array.isArray(wardData?.wards) ? wardData.wards : []);
        setWards(sourceWards);

        const ward = findBestMatchByNameOrCode(sourceWards, rawWard);
        if (ward) {
          setSelectedWardCodeState(String(ward.code));
          setSelectedWardName(ward.name);
        } else {
          setSelectedWardCodeState('');
          setSelectedWardName('');
        }
      } finally {
        setLoadingWards(false);
      }
    } finally {
      setLoadingDistricts(false);
    }
  }, [clearSelection, provinces]);

  useEffect(() => {
    if (!loadOnMount) return;
    setLoadingProvinces(true);
    fetch(`${API_BASE}/provinces`)
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setProvinces(data);
        } else {
          console.error('Provinces data is not an array:', data);
          setProvinces([]);
        }
        setLoadingProvinces(false);
      })
      .catch((err) => {
        console.error('Failed to fetch provinces:', err);
        setLoadingProvinces(false);
      });
  }, [loadOnMount]);

  useEffect(() => {
    if (!selectedProvinceCode) {
      setDistricts([]);
      return;
    }
    setLoadingDistricts(true);
    fetch(`${API_BASE}/districts?provinceId=${selectedProvinceCode}`)
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setDistricts(data);
        } else {
          const list = Array.isArray(data?.districts) ? data.districts : [];
          setDistricts(list);
        }
        setLoadingDistricts(false);
      })
      .catch((err) => {
        console.error('Failed to fetch districts:', err);
        setLoadingDistricts(false);
      });
  }, [selectedProvinceCode]);

  useEffect(() => {
    if (!selectedDistrictCode) {
      setWards([]);
      return;
    }
    setLoadingWards(true);
    fetch(`${API_BASE}/wards?districtId=${selectedDistrictCode}`)
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setWards(data);
        } else {
          const list = Array.isArray(data?.wards) ? data.wards : [];
          setWards(list);
        }
        setLoadingWards(false);
      })
      .catch((err) => {
        console.error('Failed to fetch wards:', err);
        setLoadingWards(false);
      });
  }, [selectedDistrictCode]);

  return {
    provinces,
    districts,
    wards,
    loadingProvinces,
    loadingDistricts,
    loadingWards,
    selectedProvinceCode,
    selectedDistrictCode,
    selectedWardCode,
    selectedProvinceName,
    selectedDistrictName,
    selectedWardName,
    setSelectedProvinceCode,
    setSelectedDistrictCode,
    setSelectedWardCode,
    clearSelection,
    setLocationByNames,
    getProvinceName,
    getDistrictName,
    getWardName,
  };
}
