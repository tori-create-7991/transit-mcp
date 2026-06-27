// Generate TypeScript types from the Transit API OpenAPI spec.
// Run via: pnpm generate:types

import { execSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

const OPENAPI_URL = "https://api.transit.ls8h.com/api/openapi.json";
const OUT = "src/transit/types.d.ts";

mkdirSync(dirname(OUT), { recursive: true });

execSync(`pnpm dlx openapi-typescript ${OPENAPI_URL} -o ${OUT}`, {
	stdio: "inherit",
});

console.log(`Generated: ${OUT}`);
