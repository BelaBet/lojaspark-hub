import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("Vendas rollback regression", () => {
  it("keeps rollback after venda_itens insert failure in both sale persistence paths", () => {
    const source = readFileSync(resolve(process.cwd(), "src/pages/Vendas.tsx"), "utf8");
    const failures = [...source.matchAll(/if \(iErr\) \{([\s\S]*?)\n\s*\}/g)].map((match) => match[1]);

    expect(failures.length).toBeGreaterThanOrEqual(2);

    // Both criarVendaPendentePOS() and persistVenda() must remove the parent
    // venda when the item INSERT fails. This is the application-level rollback
    // that complements PostgreSQL's statement-level rollback of stock/items.
    for (const branch of failures) {
      expect(branch).toMatch(/supabase\.from\("vendas"\)\.delete\(\)\.eq\("id",\s*vendaIns\.id\)/);
      expect(branch).toMatch(/setFinalizando\(false\)/);
    }
  });

  it("does not silently continue after an item insert error", () => {
    const source = readFileSync(resolve(process.cwd(), "src/pages/Vendas.tsx"), "utf8");
    const failures = [...source.matchAll(/if \(iErr\) \{([\s\S]*?)\n\s*\}/g)].map((match) => match[1]);

    for (const branch of failures) {
      expect(branch).toMatch(/return(?:\s+null)?;/);
    }
  });
});
