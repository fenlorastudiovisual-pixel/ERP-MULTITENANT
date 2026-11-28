import test from "node:test";
import assert from "node:assert/strict";
import { describeObjects, validateRecord } from "./metadata.js";
import { buildAllPolicySql, buildRlsPolicySql, policyPlan } from "./policies.js";

test("validateRecord falla temprano cuando faltan campos requeridos", () => {
  assert.throws(
    () => validateRecord("item", { sku: "SAM-233-35" }),
    (error) => error.status === 422 && error.fields.includes("name"),
  );
  const record = validateRecord("item", { tenant_id: "t1", sku: "SAM-233-35", name: "DR NAILS #35" });
  assert.equal(record.sku, "SAM-233-35");
});

test("las policies usan tenant real y permiso lógico", () => {
  const sql = buildRlsPolicySql("entity").join("\n");
  assert.match(sql, /public\.current_tenant_id\(\)/);
  assert.match(sql, /public\.is_superadmin\(\)/);
  assert.match(sql, /public\.erp_has_permission\('entity', 'create'\)/);
  assert.match(sql, /with check/);
});

test("erp_policies no se llama a sí misma desde su propia policy", () => {
  const sql = buildRlsPolicySql("policy").join("\n");
  assert.doesNotMatch(sql, /erp_has_permission\('policy'/);
  assert.match(sql, /tenant_id = public\.current_tenant_id\(\)/);
});

test("tablas compartidas no generan nombres de policy duplicados", () => {
  const statements = buildAllPolicySql().join("\n");
  const names = [...statements.matchAll(/create policy (\w+) on/g)].map((match) => match[1]);
  assert.ok(names.length > 0);
  assert.equal(new Set(names).size, names.length);
});

test("el inventario de metadatos es estable y legible", () => {
  const objects = describeObjects();
  assert.ok(objects.length >= 10);
  assert.ok(objects.every((item) => item.table && item.required.length > 0));
  assert.ok(policyPlan().some((item) => item.object === "invoice"));
});
