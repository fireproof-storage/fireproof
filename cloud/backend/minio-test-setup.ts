import { execSync } from "child_process";
import path from "path";

/**
 * Setup function that starts the Minio Docker container for cloud tests
 * This follows the pattern of other setup files in the project
 */
export async function setup() {
  // Start Minio container
  const scriptPath = path.join(process.cwd(), "scripts", "test", "start-minio.sh");
  // Use stdio: inherit to pipe output to the console without explicit console.log
  execSync(`bash ${scriptPath}`, { stdio: "inherit" });

  // Return teardown function
  return () => {
    const teardownPath = path.join(process.cwd(), "scripts", "test", "stop-minio.sh");
    try {
      execSync(`bash ${teardownPath}`, { stdio: "inherit" });
    } catch {
      // Suppress errors during teardown
    }
  };
}
