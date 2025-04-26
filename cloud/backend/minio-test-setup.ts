import { execSync } from "child_process";
import path from "path";

/**
 * Setup function that starts the Minio Docker container for cloud tests
 * This follows the pattern of other setup files in the project
 */
export async function setup() {
  // Skip Minio setup for cf-deploy job in CI
  const isCloudDeploy = process.env.FP_CI && 
                        process.env.CLOUDFLARE_API_TOKEN && 
                        process.env.CLOUDFLARE_D1_TOKEN;

  if (isCloudDeploy) {
    // Skip Minio setup for Cloudflare deploy jobs
    return () => { /* No-op teardown */ };
  }
  
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
