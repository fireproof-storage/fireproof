// tsup.config.ts
import { defineConfig } from "tsup";
import * as preset from "tsup-preset-solid";

const preset_options: preset.PresetOptions = {
  entries: [
    {
      // entries with '.tsx' extension will have `solid` export condition generated
      entry: "src/index.tsx",
      dev_entry: false,
      server_entry: true,
    },
  ],
  drop_console: true, // remove all `console.*` calls and `debugger` statements in prod builds
  cjs: false,
};

export default defineConfig((config) => {
  const watching = !!config.watch;
  const parsed_data = preset.parsePresetOptions(preset_options, watching);

  if (!watching) {
    const package_fields = preset.generatePackageExports(parsed_data);
    console.log(`\npackage.json: \n${JSON.stringify(package_fields, null, 2)}\n\n`);

    /* will update ./package.json with the correct export fields */
    preset.writePackageJson(package_fields);
  }

  return preset.generateTsupOptions(parsed_data);
});
