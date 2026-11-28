// Jerarquía del control plane: holding → compañía → sucursal → departamento → centro de costo.
// Un tenant puede tener varias raíces (holding) y cada entidad tiene un único padre.

export const ENTITY_KINDS = Object.freeze([
  "holding",
  "company",
  "branch",
  "department",
  "cost_center",
]);

const KIND_RANK = new Map(ENTITY_KINDS.map((kind, index) => [kind, index]));

function key(tenantId, id) {
  return `${String(tenantId)}::${String(id)}`;
}

/**
 * Construye índice por (tenant, id) y valida integridad referencial básica.
 */
export function indexEntities(entities = []) {
  const index = new Map();
  for (const entity of entities) {
    if (!entity?.id || !entity?.tenant_id) {
      throw new Error("Entidad sin id o tenant_id");
    }
    const k = key(entity.tenant_id, entity.id);
    if (index.has(k)) throw new Error(`Entidad duplicada: ${k}`);
    index.set(k, entity);
  }
  return index;
}

/**
 * Devuelve la ruta desde la raíz hasta la entidad solicitada.
 * Detecta ciclos antes de recorrer y falla con error explícito.
 */
export function entityPath(entities, tenantId, entityId, visited = new Set()) {
  const index = indexEntities(entities);
  const path = [];
  let cursor = entityId;

  while (cursor) {
    const k = key(tenantId, cursor);
    if (visited.has(k)) throw new Error(`Ciclo de entidades en ${k}`);
    visited.add(k);

    const entity = index.get(k);
    if (!entity) throw new Error(`Entidad no encontrada: ${k}`);
    if (entity.tenant_id !== tenantId) throw new Error(`Entidad de otro tenant: ${k}`);

    path.unshift(entity);
    cursor = entity.parent_id || null;
  }

  return path;
}

/**
 * Validaciones para holdings grandes:
 * - el padre existe y es del mismo tenant;
 * - el padre es de un nivel superior;
 * - no hay ciclos;
 * - `code` es único por tenant.
 */
export function assertValidHierarchy(entities = []) {
  const index = indexEntities(entities);
  const codes = new Set();

  for (const entity of entities) {
    if (!ENTITY_KINDS.includes(entity.kind)) {
      throw new Error(`kind inválido: ${entity.kind}`);
    }

    const codeKey = `${String(entity.tenant_id)}::${String(entity.code)}`;
    if (codes.has(codeKey)) throw new Error(`Código duplicado: ${codeKey}`);
    codes.add(codeKey);

    if (entity.parent_id) {
      const parent = index.get(key(entity.tenant_id, entity.parent_id));
      if (!parent) throw new Error(`Padre no encontrado para ${entity.id}`);
      if (parent.tenant_id !== entity.tenant_id) throw new Error(`Padre de otro tenant: ${parent.id}`);
      if (KIND_RANK.get(parent.kind) >= KIND_RANK.get(entity.kind)) {
        throw new Error(`El padre ${parent.kind} no puede contener a ${entity.kind}`);
      }
    }
  }

  for (const entity of entities) {
    entityPath(entities, entity.tenant_id, entity.id);
  }

  return true;
}

export function descendants(entities, tenantId, rootId) {
  const children = new Map();
  for (const entity of entities) {
    if (entity.tenant_id !== tenantId || !entity.parent_id) continue;
    const list = children.get(entity.parent_id) || [];
    list.push(entity);
    children.set(entity.parent_id, list);
  }

  const result = [];
  const stack = [...(children.get(rootId) || [])];
  while (stack.length) {
    const current = stack.shift();
    result.push(current);
    stack.push(...(children.get(current.id) || []));
  }
  return result;
}

export function rootEntity(entities, tenantId, entityId) {
  return entityPath(entities, tenantId, entityId)[0];
}
