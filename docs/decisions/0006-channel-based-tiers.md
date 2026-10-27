# 0006 — Channel-based customer tiers

- **Date:** 2026-10-26
- **Status:** Accepted (approved by product owner), implemented on `feature/tier-channels` (from `production`), not merged
- **Rules:** [[business-rules/customer-tiers]] (§8)

## Context
Online and in-store customers buy differently, but one general tier list treated them the same. The owner wants
separate «اینترنتی» and «حضوری» tier lists, released alone (without the unreleased RFM work on `main`).

## Decisions
1. Two ordered tier lists per version (`online`, `pos`); the legacy single list stays valid.
2. A customer's channel is the one with more invoices over full history; tie → in-store; re-evaluated on every refresh.
3. Conditions keep using all-channel facts; the channel only chooses the list.
4. In-store keeps the existing codes (campaign reports depend on them); online uses `ONLINE_` codes; new tiers
   `CUSTOM_<n>` unique across channels.
5. The change ships as a **draft** created by migration `0007_tier_channels`; the owner previews and activates it.
6. Released from the `production` branch; `main` gets it later by merging `production`.

## Consequences
- Campaign reports by code only see in-store customers of VIP/DIAMOND/GOLD_1/SILVER after activation.
- The draft is created only when the database has customers (fresh test databases stay without a draft so existing
  tests keep their starting state).
- When merging into `main`, `0007_tier_channels` and main's `0007_customer_rfm` … need a Django merge migration.
