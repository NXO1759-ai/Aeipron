import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const eslintConfig = [...nextCoreWebVitals, ...nextTypescript, {
  // Build artifacts + the Next.js-generated env typings (its triple-slash
  // reference is intentional). The legacy preset carries no ignore list of
  // its own, so the flat config has to declare these explicitly.
  ignores: [".next/**", "out/**", "next-env.d.ts"],
}];

export default eslintConfig;
