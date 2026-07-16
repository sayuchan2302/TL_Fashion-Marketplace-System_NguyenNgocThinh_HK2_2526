import type { AnalyticsBucket, AnalyticsRangeQuery } from '../../services/analyticsTypes';

export type AnalyticsPreset = 'today' | 'last7' | 'last30' | 'month' | 'year' | 'custom';

const BUSINESS_TIME_ZONE = 'Asia/Ho_Chi_Minh';
const MAX_RANGE_DAYS = 365;

const businessDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: BUSINESS_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export const getBusinessToday = () => {
  const parts = businessDateFormatter.formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
};

const parseDate = (value: string) => {
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return null;
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
    ? date
    : null;
};

const formatDate = (date: Date) => (
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
);

const addDays = (value: string, days: number) => {
  const date = parseDate(value);
  if (!date) return value;
  date.setDate(date.getDate() + days);
  return formatDate(date);
};

const startOfMonth = (value: string) => {
  const date = parseDate(value);
  if (!date) return value;
  date.setDate(1);
  return formatDate(date);
};

const startOfYear = (value: string) => {
  const date = parseDate(value);
  if (!date) return value;
  date.setMonth(0, 1);
  return formatDate(date);
};

export const resolveAnalyticsBucket = (from: string, to: string): AnalyticsBucket => {
  const fromDate = parseDate(from);
  const toDate = parseDate(to);
  if (!fromDate || !toDate) return 'DAY';

  const dayCount = Math.floor((toDate.getTime() - fromDate.getTime()) / 86400000) + 1;
  if (dayCount <= 31) return 'DAY';
  if (dayCount <= 180) return 'WEEK';
  return 'MONTH';
};

export const isValidAnalyticsRange = (from: string, to: string) => {
  const fromDate = parseDate(from);
  const toDate = parseDate(to);
  const today = parseDate(getBusinessToday());
  if (!fromDate || !toDate || !today || fromDate > toDate || toDate > today) return false;

  const dayCount = Math.floor((toDate.getTime() - fromDate.getTime()) / 86400000) + 1;
  return dayCount <= MAX_RANGE_DAYS;
};

export const getAnalyticsPresetRange = (preset: Exclude<AnalyticsPreset, 'custom'>): AnalyticsRangeQuery => {
  const today = getBusinessToday();
  let from = today;

  if (preset === 'last7') from = addDays(today, -6);
  if (preset === 'last30') from = addDays(today, -29);
  if (preset === 'month') from = startOfMonth(today);
  if (preset === 'year') from = startOfYear(today);

  return { from, to: today, bucket: resolveAnalyticsBucket(from, today) };
};

export const getPresetForAnalyticsRange = (query: AnalyticsRangeQuery): AnalyticsPreset => {
  const presets: Array<Exclude<AnalyticsPreset, 'custom'>> = ['today', 'last7', 'last30', 'month', 'year'];
  const match = presets.find((preset) => {
    const candidate = getAnalyticsPresetRange(preset);
    return candidate.from === query.from && candidate.to === query.to;
  });
  return match || 'custom';
};

export const getAnalyticsQueryFromSearchParams = (params: URLSearchParams): AnalyticsRangeQuery => {
  const from = params.get('from') || '';
  const to = params.get('to') || '';
  if (!isValidAnalyticsRange(from, to)) {
    return getAnalyticsPresetRange('last30');
  }

  const bucket = params.get('bucket')?.toUpperCase();
  return {
    from,
    to,
    bucket: bucket === 'DAY' || bucket === 'WEEK' || bucket === 'MONTH'
      ? bucket
      : resolveAnalyticsBucket(from, to),
  };
};

export const getAnalyticsRangeLabel = (bucket: AnalyticsBucket) => {
  if (bucket === 'DAY') return 'Theo ngày';
  if (bucket === 'WEEK') return 'Theo tuần';
  return 'Theo tháng';
};
