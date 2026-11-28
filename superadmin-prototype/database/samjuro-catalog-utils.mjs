// Normalización común del catálogo real de Samjuro.
// Unifica el importador, el mapa de precios y la corrección de datos del piloto.

import crypto from "node:crypto";

export const text = (value) => (value == null ? "" : String(value).trim());

export function uuid(value) {
  const h = crypto.createHash("md5").update(String(value)).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

const slugPart = (value) =>
  text(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "")
    .toUpperCase() || "P";

/**
 * Devuelve una fila por producto y otra por presentación real.
 * - La marca va en su propia columna, nunca dentro de categoría.
 * - El nombre lleva la marca una sola vez y no repite "#35 #35".
 * - Si la presentación no tiene SKU, se genera a partir del SKU del producto
 *   y del nombre de la presentación, nunca desde un UUID ilegible.
 */
export function buildCatalogRows({ productos, presentaciones, marcas, categorias, tenantId }) {
  const brandName = new Map(marcas.map((b) => [text(b.id), text(b.nombre)]));
  const categoryName = new Map(categorias.map((c) => [text(c.id), text(c.nombre)]));
  const productsById = new Map(productos.map((p) => [text(p.id), p]));

  const brandFor = (p) => brandName.get(text(p?.marca_id)) || "General";
  const categoryFor = (p) => categoryName.get(text(p?.categoria_id)) || "General";
  const displayName = (p) => {
    const base = text(p?.nombre) || "Producto";
    const brand = brandFor(p);
    return brand && brand !== "General" ? `${brand} · ${base}` : base;
  };

  const rows = [];
  const usedSkus = new Set();

  for (const p of productos) {
    const sku = text(p.sku) || `SAM-${slugPart(text(p.id).slice(0, 8))}`;
    usedSkus.add(sku);
    rows.push({
      id: uuid(`${text(p.id)}:product:${tenantId}`),
      sku,
      name: displayName(p),
      brand: brandFor(p),
      category: categoryFor(p),
      product: p,
      raw: p,
      sourceTable: "productos",
      sourceRowId: text(p.id),
      sourceSku: text(p.sku) || null,
      kind: "product",
    });
  }

  for (const pr of presentaciones) {
    const p = productsById.get(text(pr.producto_id));
    const parentSku = text(p?.sku) || rows.find((r) => r.sourceRowId === text(pr.producto_id))?.sku || "PROD";
    let sku = text(pr.sku);
    if (!sku) {
      const base = `${parentSku}-${slugPart(pr.nombre || p?.nombre || "P")}`;
      sku = base;
      let suffix = 2;
      while (usedSkus.has(sku)) sku = `${base}-${suffix++}`;
    }
    usedSkus.add(sku);

    const parentDisplay = displayName(p);
    const presentation = text(pr.nombre);
    const repeatsParent = presentation && parentDisplay.toLowerCase().includes(presentation.toLowerCase());
    rows.push({
      id: uuid(`${text(pr.id)}:presentation:${tenantId}`),
      sku,
      name: repeatsParent ? parentDisplay : `${parentDisplay}${presentation ? ` · ${presentation}` : ""}`.trim(),
      brand: brandFor(p),
      category: categoryFor(p),
      product: p,
      raw: pr,
      sourceTable: "presentaciones",
      sourceRowId: text(pr.id),
      sourceSku: sku,
      kind: "presentation",
    });
  }

  return rows;
}
