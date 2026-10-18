import { api, queryPath } from "./api";

export type CampaignItem = {
  id: number;
  title: string;
  description_pattern?: string;
  type: string;
  type_label: string;
  type_value: number;
  level_id?: number;
  level_title?: string;
  start_date?: string;
  end_date?: string;
  is_active: boolean;
  target_audience_estimate?: number;
  total_gift_distributed?: number;
};

export type BranchShare = {
  key: string;
  label: string;
  wallet_amount: number;
  count: number;
  share_pct: number;
};

export type CampaignSummary = {
  total_gift_distributed: number;
  total_gift_used: number;
  total_sales_generated: number;
  basket_lift: number;
  burn_rate_pct: number;
  redemption_count: number;
  unique_customers_count: number;
  branches: BranchShare[];
};

export type CustomerRedemption = {
  id: number;
  source_id: number;
  customer_id: number | null;
  customer_name: string;
  customer_mobile: string;
  customer_tier?: string;
  gift_description?: string;
  sales_line: string;
  sales_line_label: string;
  created_at: string;
  wallet_amount: number;
  total_amount: number;
  incremental_amount: number;
  tracking_code: string;
};

export type CampaignsReportResponse = {
  campaigns: CampaignItem[];
  selected_campaign: CampaignItem | null;
  gift_keyword: string;
  summary: CampaignSummary;
  redemptions: CustomerRedemption[];
  pagination: {
    page: number;
    per_page: number;
    total: number;
    total_pages: number;
  };
};

export type CampaignReportParams = {
  action_id?: number;
  branch?: string;
  gift_keyword?: string;
  page?: number;
  per_page?: number;
};

export const campaignsService = {
  getReport: (params?: CampaignReportParams) =>
    api<CampaignsReportResponse>(
      queryPath("/customers/campaigns/", {
        action_id: params?.action_id,
        branch: params?.branch,
        gift_keyword: params?.gift_keyword,
        page: params?.page || 1,
        per_page: params?.per_page || 20,
      }),
    ),
};
