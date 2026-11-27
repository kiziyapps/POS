export function formatRupiah(amount) {
  return 'Rp ' + Number(amount || 0).toLocaleString('id-ID');
}

export function getDriveCdnUrl(fileId, width = 400) {
  if (!fileId) return '';
  return `https://lh3.googleusercontent.com/d/${fileId}=w${width}`;
}

/**
 * Hitung harga satuan terbaik berdasarkan Tier_Prices (harga grosir / bertingkat)
 */
export function resolveVariantPrice(variant, qty, tierPrices = [], memberTier = 'ALL') {
  const basePrice = Number(variant?.sell_price || 0);
  if (!variant || !tierPrices || tierPrices.length === 0) return basePrice;

  const matching = tierPrices.filter((t) => {
    const sameVar = t.variant_id === variant.variant_id;
    const minQtyOk = Number(qty || 1) >= Number(t.min_qty || 1);
    const tierOk = !t.member_tier || t.member_tier === 'ALL' || t.member_tier === memberTier;
    return sameVar && minQtyOk && tierOk;
  });

  if (matching.length === 0) return basePrice;
  matching.sort((a, b) => Number(b.min_qty) - Number(a.min_qty));
  return Number(matching[0].special_price || basePrice);
}
