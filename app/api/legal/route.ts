// ---------------------------------------------------------------------------
// GET /api/legal — the store's three legal policies, LIVE from Shopify.
//
// Reads privacy/refund/terms from the Storefront API (shop.privacyPolicy,
// shop.refundPolicy, shop.termsOfService — ShopPolicy.body is HTML) so edits
// in Shopify admin → Settings → Policies reach the footer dialogs
// automatically. The response is ISR-cached (revalidate below), so
// storefront traffic never hammers Shopify; an admin edit shows up within
// the cache window.
//
// Fallback: if Shopify is unreachable, env vars are missing, or a policy is
// empty in admin, the static snapshot in lib/legal-content (the 2026-07-21
// export) covers it — the dialog never renders empty. `source` in the
// payload reports what answered: "shopify" (all live), "mixed" (some live,
// some snapshot), or "snapshot".
//
// Footer labels/dialog titles stay the snapshot's (tests guard them); only
// bodies go live. Terms keeps its inlineActions/redactions (the "[LINK]"
// cross-links and the merchant-note strip) from the snapshot — they apply
// at render time to whatever body Shopify returns.
// ---------------------------------------------------------------------------

import { NextResponse } from 'next/server';
import { shopifyRequest } from '@/lib/shopify/client';
import {
  LEGAL_DOCUMENTS,
  type LegalDocument,
  type LegalDocumentId,
} from '@/lib/legal-content';

/** ISR cache window for this route's response (seconds). */
export const revalidate = 3600;

const SHOP_POLICIES_QUERY = /* GraphQL */ `
  query ShopPolicies {
    shop {
      privacyPolicy { title body }
      refundPolicy { title body }
      termsOfService { title body }
    }
  }
`;

interface ShopPolicyNode {
  title: string;
  body: string;
}

interface ShopPoliciesData {
  shop: {
    privacyPolicy: ShopPolicyNode | null;
    refundPolicy: ShopPolicyNode | null;
    termsOfService: ShopPolicyNode | null;
  };
}

export async function GET() {
  try {
    const data = await shopifyRequest<ShopPoliciesData>(SHOP_POLICIES_QUERY);
    const live: Record<LegalDocumentId, LegalDocument> = { ...LEGAL_DOCUMENTS };
    const pairs: [LegalDocumentId, ShopPolicyNode | null][] = [
      ['privacy', data.shop.privacyPolicy],
      ['refund', data.shop.refundPolicy],
      ['terms', data.shop.termsOfService],
    ];

    let allLive = true;
    for (const [id, policy] of pairs) {
      if (policy && policy.body.trim()) {
        // Body goes live; title + template processing (inlineActions /
        // redactions) stay from the snapshot. ShopPolicy.body is HTML.
        live[id] = { ...LEGAL_DOCUMENTS[id], format: 'html', body: policy.body };
      } else {
        allLive = false; // not set in admin — the snapshot covers it
      }
    }

    return NextResponse.json({ documents: live, source: allLive ? 'shopify' : 'mixed' });
  } catch {
    // Shopify unreachable / env missing / GraphQL error — serve the snapshot.
    return NextResponse.json({ documents: LEGAL_DOCUMENTS, source: 'snapshot' });
  }
}
