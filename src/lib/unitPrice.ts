/**
 * Unit price from a product name, e.g. "Milo 1kg" -> $ per 100g.
 * Weight -> per 100g, volume -> per litre, counted packs -> each.
 * Returns null when the name has no clear size, rather than guessing.
 */

export type UnitSize =
  | { kind: "weight"; grams: number }
  | { kind: "volume"; millilitres: number }
  | { kind: "count"; items: number };

export type UnitPrice = { value: number; per: "100g" | "L" | "each" };

const NUM = String.raw`(\d+(?:[.,]\d+)?)`;
// A unit must end the word: "200g", "2 L", "900mL". "4 levels" or "Size 4" never match.
const WEIGHT_OR_VOLUME = new RegExp(
  String.raw`(?:^|[^\w.])${NUM}\s?(kg|g|grams?|ml|millilitres?|l|litres?|liters?)(?![\w-])`,
  "gi",
);
const MULTIPACK = new RegExp(
  String.raw`(?:^|[^\w.])(\d+)\s?[x×]\s?${NUM}\s?(kg|g|ml|l|litres?)(?![\w-])`,
  "i",
);
const COUNT = new RegExp(
  String.raw`(?:^|[^\w.])(\d+)\s?(?:-\s?)?(pack|pk|packs|count|ct|each|ea|pieces|pcs|pods|capsules|caps|tablets|tabs|rolls|sheets|wipes|bags|sachets|nappies)(?![\w-])`,
  "i",
);
const PACK_OF = /\bpack of (\d+)\b/i;

function toNumber(raw: string): number {
  return Number(raw.replace(",", "."));
}

function toSize(amount: number, unitRaw: string): UnitSize | null {
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const unit = unitRaw.toLowerCase();
  if (unit === "kg") return { kind: "weight", grams: amount * 1000 };
  if (unit === "g" || unit.startsWith("gram"))
    return { kind: "weight", grams: amount };
  if (unit === "ml" || unit.startsWith("millil"))
    return { kind: "volume", millilitres: amount };
  return { kind: "volume", millilitres: amount * 1000 };
}

export function parseUnitSize(name: string): UnitSize | null {
  const text = name.replace(/\s+/g, " ");

  const multi = MULTIPACK.exec(text);
  if (multi) {
    const packs = Number(multi[1]);
    const each = toSize(toNumber(multi[2]), multi[3]);
    if (each && packs > 0) {
      return each.kind === "weight"
        ? { kind: "weight", grams: each.grams * packs }
        : each.kind === "volume"
          ? { kind: "volume", millilitres: each.millilitres * packs }
          : null;
    }
  }

  // The last size in the name is usually the pack size ("Tim Tam 200g").
  let size: UnitSize | null = null;
  for (const match of text.matchAll(WEIGHT_OR_VOLUME)) {
    size = toSize(toNumber(match[1]), match[2]) ?? size;
  }
  if (size) return size;

  const count = COUNT.exec(text) ?? PACK_OF.exec(text);
  if (count) {
    const items = Number(count[1]);
    if (Number.isInteger(items) && items > 1 && items <= 1000)
      return { kind: "count", items };
  }
  return null;
}

export function unitPriceFor(
  name: string,
  price: number | null | undefined,
): UnitPrice | null {
  if (
    price === null ||
    price === undefined ||
    !Number.isFinite(price) ||
    price <= 0
  )
    return null;
  const size = parseUnitSize(name);
  if (!size) return null;
  if (size.kind === "weight")
    return { value: (price / size.grams) * 100, per: "100g" };
  if (size.kind === "volume")
    return { value: (price / size.millilitres) * 1000, per: "L" };
  return { value: price / size.items, per: "each" };
}

export function formatUnitPrice(unit: UnitPrice): string {
  const amount =
    unit.value < 0.1 ? unit.value.toFixed(3) : unit.value.toFixed(2);
  return unit.per === "each" ? `$${amount} each` : `$${amount} / ${unit.per}`;
}
