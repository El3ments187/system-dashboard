import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import unusedImports from "eslint-plugin-unused-imports";
import sonarjs from "eslint-plugin-sonarjs";

export default tseslint.config(
  {
    files: ["**/*.{ts,tsx}"],
    ignores: ["node_modules", "dist"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      parser: tseslint.parser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "unused-imports": unusedImports,
      sonarjs,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      ...sonarjs.configs.recommended.rules,
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "JSXAttribute[name.name='ticks'] > JSXExpressionContainer > CallExpression[callee.property.name='map']",
          message:
            "Do not render one axis tick per data point (ticks={data.map(...)}). This detaches SVG <tspan> nodes every poll and leaks memory. Use tickCount={N} instead. See fix-chart-tspan-leak.",
        },
      ],
      "no-console": "warn",
      "no-unused-vars": "off",
      "unused-imports/no-unused-imports": "error",
      "unused-imports/no-unused-vars": [
        "warn",
        {
          vars: "all",
          ignoreRestSiblings: true,
          varsIgnorePattern: "^_",
          argsIgnorePattern: "^_",
        },
      ],
    },
  },
  {
    files: ["**/*.{ts,tsx}"],
    ignores: ["node_modules", "dist"],
  },
);
