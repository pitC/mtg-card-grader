const js = require('@eslint/js');
const globals = require('globals');

const sharedRules = {
  'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],

  // Correctness / best practice (core, available in ESLint 10)
  eqeqeq: ['error', 'smart'], // keeps intentional `== null` (null || undefined)
  curly: ['error', 'multi-line'], // code already wraps all if bodies
  'prefer-template': 'error', // 1-line fix: scryfall.js:13
  'object-shorthand': 'error',
  'prefer-arrow-callback': 'error',
  'no-else-return': 'error',
  'no-lonely-if': 'error',
  'no-console': ['warn', { allow: ['error'] }], // app logs errors deliberately (firestore.js, app.js)
  'no-alert': 'error',
  'no-eval': 'error',
  'no-implied-eval': 'error',
  'no-useless-concat': 'error',
};

module.exports = [
  {
    ignores: ['node_modules/**'],
  },
  js.configs.recommended,
  {
    files: ['js/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.es2021,
      },
    },
    rules: sharedRules,
  },
  {
    files: ['test/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.node,
        ...globals.browser,
        ...globals.es2021,
      },
    },
    rules: sharedRules, // tests get the same rules as app code
  },
];
