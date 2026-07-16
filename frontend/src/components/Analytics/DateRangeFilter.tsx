import { CalendarDays } from 'lucide-react';
import { useMemo } from 'react';
import type { AnalyticsRangeQuery } from '../../services/analyticsTypes';
import {
  getAnalyticsPresetRange,
  getAnalyticsRangeLabel,
  getPresetForAnalyticsRange,
  getBusinessToday,
  isValidAnalyticsRange,
  type AnalyticsPreset,
  resolveAnalyticsBucket,
} from './analyticsRange';

interface DateRangeFilterProps {
  value: AnalyticsRangeQuery;
  onChange: (value: AnalyticsRangeQuery) => void;
  loading?: boolean;
}

const PRESET_OPTIONS: Array<{ value: AnalyticsPreset; label: string }> = [
  { value: 'today', label: 'Hôm nay' },
  { value: 'last7', label: '7 ngày gần nhất' },
  { value: 'last30', label: '30 ngày gần nhất' },
  { value: 'month', label: 'Tháng này' },
  { value: 'year', label: 'Năm này' },
  { value: 'custom', label: 'Tùy chọn mốc thời gian' },
];

const DateRangeFilter = ({ value, onChange, loading = false }: DateRangeFilterProps) => {
  const selectedPreset = useMemo(() => getPresetForAnalyticsRange(value), [value]);

  const updateRange = (from: string, to: string) => {
    if (!isValidAnalyticsRange(from, to)) return;
    onChange({ from, to, bucket: resolveAnalyticsBucket(from, to) });
  };

  return (
    <section className="analytics-range-filter" aria-label="Bộ lọc thời gian thống kê">
      <div className="analytics-range-filter-title">
        <CalendarDays size={18} />
        <div>
          <strong>Khoảng thời gian thống kê</strong>
          <span>Dữ liệu đơn đã giao thành công · {getAnalyticsRangeLabel(value.bucket)}</span>
        </div>
      </div>
      <div className="analytics-range-controls">
        <label className="analytics-range-control">
          <span>Mốc nhanh</span>
          <select
            value={selectedPreset}
            disabled={loading}
            onChange={(event) => {
              const preset = event.target.value as AnalyticsPreset;
              if (preset !== 'custom') onChange(getAnalyticsPresetRange(preset));
            }}
          >
            {PRESET_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
        <label className="analytics-range-control">
          <span>Từ ngày</span>
          <input
            type="date"
            value={value.from}
            max={getBusinessToday()}
            disabled={loading}
            onChange={(event) => updateRange(event.target.value, value.to)}
          />
        </label>
        <label className="analytics-range-control">
          <span>Đến ngày</span>
          <input
            type="date"
            value={value.to}
            max={getBusinessToday()}
            disabled={loading}
            onChange={(event) => updateRange(value.from, event.target.value)}
          />
        </label>
      </div>
    </section>
  );
};

export default DateRangeFilter;
