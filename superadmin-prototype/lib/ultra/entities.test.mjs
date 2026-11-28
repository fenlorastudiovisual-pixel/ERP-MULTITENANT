import test from "node:test";
import assert from "node:assert/strict";
import { assertValidHierarchy, descendants, entityPath, rootEntity } from "./entities.js";

const tenant = "11111111-1111-1111-1111-111111111111";

function holding() {
  return [
    { tenant_id: tenant, id: "h1", parent_id: null, kind: "holding", code: "GRUPO", name: "Holding" },
    { tenant_id: tenant, id: "c1", parent_id: "h1", kind: "company", code: "SAM", name: "Samjuro" },
    { tenant_id: tenant, id: "b1", parent_id: "c1", kind: "branch", code: "BOG", name: "Bogotá" },
    { tenant_id: tenant, id: "d1", parent_id: "b1", kind: "department", code: "VENTAS", name: "Ventas" },
  ];
}

test("la jerarquía del holding es válida y produce la ruta completa", () => {
  const entities = holding();
  assert.equal(assertValidHierarchy(entities), true);
  assert.deepEqual(entityPath(entities, tenant, "d1").map((item) => item.code), ["GRUPO", "SAM", "BOG", "VENTAS"]);
  assert.equal(rootEntity(entities, tenant, "d1").code, "GRUPO");
  assert.deepEqual(descendants(entities, tenant, "h1").map((item) => item.id), ["c1", "b1", "d1"]);
});

test("un padre de otro tenant se rechaza", () => {
  const entities = holding();
  entities[1].parent_id = "otro";
  assert.throws(() => assertValidHierarchy(entities), /Padre no encontrado/);
});

test("un nivel inferior no puede contener a uno superior", () => {
  const entities = holding();
  entities[0].parent_id = "c1";
  assert.throws(() => assertValidHierarchy(entities), /no puede contener/);
});

test("entityPath detecta ciclos", () => {
  const cycle = [
    { tenant_id: tenant, id: "a", parent_id: "b", kind: "holding", code: "A", name: "A" },
    { tenant_id: tenant, id: "b", parent_id: "a", kind: "holding", code: "B", name: "B" },
  ];
  assert.throws(() => entityPath(cycle, tenant, "a"), /Ciclo de entidades/);
});
