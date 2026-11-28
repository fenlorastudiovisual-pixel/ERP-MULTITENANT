// Divide un SQL en sentencias respetando comillas, comentarios y bloques $$.
// Se usa para ejecutar migraciones sobre Neon HTTP, que no acepta un archivo
// multi-sentencia en una sola llamada.

export function splitStatements(text) {
  const statements = [];
  let current = "";
  let state = "normal";
  let dollarTag = "";

  const hasContent = (value) =>
    value.replace(/--[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "").trim().length > 0;

  for (let i = 0; i < text.length;) {
    const ch = text[i];
    const next = text[i + 1];

    if (state === "line") {
      current += ch;
      if (ch === "\n") state = "normal";
      i += 1;
      continue;
    }
    if (state === "block") {
      current += ch;
      if (ch === "*" && next === "/") {
        current += next;
        i += 2;
        state = "normal";
      } else {
        i += 1;
      }
      continue;
    }
    if (state === "single") {
      current += ch;
      if (ch === "'") {
        if (next === "'") {
          current += next;
          i += 2;
          continue;
        }
        state = "normal";
      }
      i += 1;
      continue;
    }
    if (state === "double") {
      current += ch;
      if (ch === '"') state = "normal";
      i += 1;
      continue;
    }
    if (state === "dollar") {
      if (text.startsWith(dollarTag, i)) {
        current += dollarTag;
        i += dollarTag.length;
        state = "normal";
      } else {
        current += ch;
        i += 1;
      }
      continue;
    }

    if (ch === "-" && next === "-") {
      current += ch + next;
      i += 2;
      state = "line";
      continue;
    }
    if (ch === "/" && next === "*") {
      current += ch + next;
      i += 2;
      state = "block";
      continue;
    }
    if (ch === "'") {
      current += ch;
      i += 1;
      state = "single";
      continue;
    }
    if (ch === '"') {
      current += ch;
      i += 1;
      state = "double";
      continue;
    }
    if (ch === "$") {
      const tag = text.slice(i).match(/^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/)?.[0];
      if (tag) {
        current += tag;
        i += tag.length;
        dollarTag = tag;
        state = "dollar";
        continue;
      }
    }
    if (ch === ";") {
      const statement = (current + ch).trim();
      if (hasContent(statement)) statements.push(statement);
      current = "";
      i += 1;
      continue;
    }

    current += ch;
    i += 1;
  }

  if (hasContent(current)) statements.push(current.trim());
  return statements;
}
