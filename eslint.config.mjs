import { FlatCompat } from "@eslint/eslintrc";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// eslint-config-next 15 ships a LEGACY (eslintrc-format) config object, not a
// flat array — spreading it (`[...next]`) throws "next is not iterable".
// FlatCompat is the supported bridge for the v15 preset on ESLint 9 flat
// config. (This also loads the preset through @eslint/eslintrc's CJS bundle,
// which is the chain @rushstack/eslint-patch expects — plugin resolution
// keeps working.)
const compat = new FlatCompat({ baseDirectory: __dirname });

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    // Build artifacts + the Next.js-generated env typings (its triple-slash
    // reference is intentional). The legacy preset carries no ignore list of
    // its own, so the flat config has to declare these explicitly.
    ignores: [".next/**", "out/**", "next-env.d.ts"],
  },
];

export default eslintConfig;
