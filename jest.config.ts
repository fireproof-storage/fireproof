import type { Config } from "jest";

const config: Config = {
  preset: "ts-jest",
  testEnvironment: "node",
  modulePathIgnorePatterns: ["dist/"],
  transform: {
    "\\.[jt]sx?$": "babel-jest",
  },
};

export default config;
