# Fireproof

## Live database for the web

Fireproof is beta software. You can browse the alpha proof of concept at https://github.com/fireproof-storage/fireproof

This code will replace the alpha code soon, at that repository.

## Implementation 

Fireproof integrates [Pail](https://github.com/alanshaw/pail) with [Prolly Trees](https://github.com/mikeal/prolly-trees) and vector indexes with a database API.

## Build and Lint Process

The project uses `esbuild` and `esbuild-plugin-tsc` for compiling TypeScript to JavaScript, the results of which are bundled into different module formats for different environments. The `build.js` script in the `scripts` directory orchestrates this process. You can trigger the build process by running `npm run build` in your terminal.

For code quality assurance, we utilize ESLint with `@typescript-eslint/parser` and `@typescript-eslint/eslint-plugin`. ESLint checks both the JavaScript and TypeScript code in the project. The configuration for ESLint is stored in the `.eslintrc.js` file. For the test files located in the `test` directory, there are additional linting configurations to accommodate Mocha-specific code.

Tests in this project are written with Mocha and can be run in both Node.js and a browser environment through the use of `polendina`. Test files are located in the `test` directory and are recognizable by their `.test.js` extension. You can run the tests by executing the command `npm test`, which also triggers the build process and checks for any linting errors.