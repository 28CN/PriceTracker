import { createClient } from '@supabase/supabase-js';

import RefreshButton from '../components/RefreshButton';

type PriceHistoryRow = {
  id?: string;
  price: number | string;
  created_at: string;
};

type TrackedLinkRow = {
  id: string;
  retailer: string | null;
  url: string | null;
  is_active: boolean | null;
  price_history: PriceHistoryRow[] | null;
};

type ProductRow = {
  id: string;
  name: string;
  target_price: number | string;
  tracked_links: TrackedLinkRow[] | null;
};

function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error('Missing Supabase public environment variables.');
  }

  return createClient(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
}

function pickLatestPrice(history: PriceHistoryRow[] | null | undefined) {
  if (!history?.length) {
    return null;
  }

  return history.reduce((latest, current) => {
    if (!latest) {
      return current;
    }

    return new Date(current.created_at).getTime() > new Date(latest.created_at).getTime()
      ? current
      : latest;
  }, history[0] as PriceHistoryRow | null);
}

function formatMoney(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === '') {
    return 'N/A';
  }

  const numberValue = typeof value === 'number' ? value : Number(value);
  if (Number.isNaN(numberValue)) {
    return 'N/A';
  }

  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD'
  }).format(numberValue);
}

async function getProducts(): Promise<ProductRow[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('products')
    .select(
      'id, name, target_price, tracked_links(id, retailer, url, is_active, price_history(id, price, created_at))'
    )
    .order('name', { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data || []) as ProductRow[];
}

export default async function HomePage() {
  let products: ProductRow[] = [];
  let loadError: string | null = null;

  try {
    products = await getProducts();
  } catch (error) {
    loadError = error instanceof Error ? error.message : 'Failed to load products.';
  }

  return (
    <main
      style={{
        padding: 24,
        fontFamily: 'system-ui, sans-serif',
        maxWidth: 1100,
        margin: '0 auto',
        display: 'grid',
        gap: 24
      }}
    >
      <section style={{ display: 'grid', gap: 12 }}>
        <h1 style={{ margin: 0 }}>PriceTracker</h1>
        <p style={{ margin: 0, color: '#4b5563' }}>
          Supabase stores your products and price history. GitHub Actions runs the crawler on a
          schedule, and the button below can queue a manual refresh when you want fresh numbers
          before heading out.
        </p>
        <RefreshButton label="Manual refresh all products" />
      </section>

      <section style={{ display: 'grid', gap: 16 }}>
        {loadError ? (
          <div
            style={{
              border: '1px solid #fecaca',
              borderRadius: 16,
              padding: 20,
              background: '#fef2f2',
              color: '#991b1b'
            }}
          >
            <p style={{ margin: 0 }}>Could not load products from Supabase: {loadError}</p>
          </div>
        ) : null}
        {!loadError && products.length === 0 ? (
          <div
            style={{
              border: '1px solid #e5e7eb',
              borderRadius: 16,
              padding: 20,
              background: '#ffffff'
            }}
          >
            <p style={{ margin: 0 }}>No products yet. Add rows in Supabase to start tracking.</p>
          </div>
        ) : (
          products.map((product) => (
            <article
              key={product.id}
              style={{
                border: '1px solid #e5e7eb',
                borderRadius: 16,
                padding: 20,
                background: '#ffffff',
                display: 'grid',
                gap: 16
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 16,
                  flexWrap: 'wrap'
                }}
              >
                <div style={{ display: 'grid', gap: 6 }}>
                  <h2 style={{ margin: 0 }}>{product.name}</h2>
                  <p style={{ margin: 0, color: '#4b5563' }}>
                    Target price: {formatMoney(product.target_price)}
                  </p>
                </div>
                <RefreshButton productId={product.id} label="Refresh this product" />
              </div>

              <div style={{ display: 'grid', gap: 12 }}>
                {(product.tracked_links || []).map((link) => {
                  const latest = pickLatestPrice(link.price_history);

                  return (
                    <div
                      key={link.id}
                      style={{
                        border: '1px solid #f1f5f9',
                        borderRadius: 12,
                        padding: 14,
                        display: 'grid',
                        gap: 8,
                        background: '#f8fafc'
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          gap: 16,
                          flexWrap: 'wrap'
                        }}
                      >
                        <div style={{ display: 'grid', gap: 4 }}>
                          <strong>{link.retailer || 'Unknown retailer'}</strong>
                          <span style={{ color: '#4b5563', fontSize: 14 }}>
                            Latest price: {latest ? formatMoney(latest.price) : 'No history yet'}
                          </span>
                          <span style={{ color: '#6b7280', fontSize: 13 }}>
                            Status: {link.is_active ? 'Active' : 'Inactive'}
                          </span>
                          {latest ? (
                            <span style={{ color: '#6b7280', fontSize: 13 }}>
                              Updated: {new Date(latest.created_at).toLocaleString('en-AU')}
                            </span>
                          ) : null}
                        </div>
                        <RefreshButton linkId={link.id} label="Refresh this link" />
                      </div>
                      {link.url ? (
                        <a
                          href={link.url}
                          target="_blank"
                          rel="noreferrer"
                          style={{ color: '#2563eb', fontSize: 14, wordBreak: 'break-all' }}
                        >
                          {link.url}
                        </a>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </article>
          ))
        )}
      </section>
    </main>
  );
}

