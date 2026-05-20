import { apiRequest } from './apiClient';

export interface CommissionSettings {
  defaultCommissionRate: number;
  sellersUsingDefault: number;
  sellersUsingOverride: number;
}

interface BackendCommissionSettings {
  defaultCommissionRate?: number;
  sellersUsingDefault?: number;
  sellersUsingOverride?: number;
}

const mapCommissionSettings = (settings: BackendCommissionSettings): CommissionSettings => ({
  defaultCommissionRate: Number(settings.defaultCommissionRate ?? 5),
  sellersUsingDefault: Number(settings.sellersUsingDefault ?? 0),
  sellersUsingOverride: Number(settings.sellersUsingOverride ?? 0),
});

export const adminFinancialSettingsService = {
  async getCommissionSettings(): Promise<CommissionSettings> {
    const settings = await apiRequest<BackendCommissionSettings>(
      '/api/admin/financial-settings/commission',
      {},
      { auth: true },
    );
    return mapCommissionSettings(settings);
  },

  async updateCommissionSettings(defaultCommissionRate: number): Promise<CommissionSettings> {
    const settings = await apiRequest<BackendCommissionSettings>(
      '/api/admin/financial-settings/commission',
      {
        method: 'PATCH',
        body: JSON.stringify({ defaultCommissionRate }),
      },
      { auth: true },
    );
    return mapCommissionSettings(settings);
  },
};
