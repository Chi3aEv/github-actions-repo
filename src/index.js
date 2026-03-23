#!/usr/bin/env node
const axios = require("axios");

/**
 * Analyzes a CI/CD pipeline config and returns detected issues
 * @param {object} pipelineConfig - parsed pipeline object
 * @returns {string[]} list of issues found
 */
function analyzePipeline(pipelineConfig) {
  const issues = [];

  if (!pipelineConfig || typeof pipelineConfig !== "object") {
    issues.push("Invalid pipeline config");
    return issues;
  }

  if (!pipelineConfig.jobs || Object.keys(pipelineConfig.jobs).length === 0) {
    issues.push("No jobs defined in pipeline");
  }

  if (!pipelineConfig.on) {
    issues.push("No trigger events defined");
  }

  const jobs = pipelineConfig.jobs || {};
  for (const [jobName, job] of Object.entries(jobs)) {
    if (!job["runs-on"]) {
      issues.push(`Job '${jobName}' is missing 'runs-on'`);
    }
    if (!job.steps || job.steps.length === 0) {
      issues.push(`Job '${jobName}' has no steps`);
    }
  }

  return issues;
}

/**
 * Parses build logs and extracts error lines
 * @param {string} logs - raw log string
 * @returns {string[]} extracted error messages
 */
function parseLogErrors(logs) {
  if (typeof logs !== "string") return [];
  return logs
    .split("\n")
    .filter((line) => /error|failed|fatal/i.test(line))
    .map((line) => line.trim())
    .filter(Boolean);
}

/**
 * Sends pipeline issues to an AI API and returns suggestions
 * @param {string[]} issues - list of issues
 * @param {string} apiKey - AI API key
 * @param {string} apiUrl - AI API endpoint
 * @returns {Promise<string>} AI suggestion text
 */
async function getAISuggestions(issues, apiKey, apiUrl) {
  if (!issues || issues.length === 0) return "No issues to analyze.";
  if (!apiKey) throw new Error("API key is required");
  if (!apiUrl) throw new Error("API URL is required");

  const prompt = `You are a DevOps expert. Analyze these CI/CD pipeline issues and suggest fixes:\n${issues.join("\n")}`;

  const response = await axios.post(
    apiUrl,
    {
      model: "gpt-3.5-turbo",
      messages: [{ role: "user", content: prompt }],
    },
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
    }
  );

  return response.data.choices[0].message.content;
}

/**
 * Generates a summary report for a DevOps pipeline run
 * @param {string} pipelineName
 * @param {string[]} issues
 * @param {string[]} errors
 * @returns {object} report object
 */
function generateReport(pipelineName, issues, errors) {
  return {
    pipeline: pipelineName || "unknown",
    timestamp: new Date().toISOString(),
    issueCount: issues.length,
    errorCount: errors.length,
    issues,
    errors,
    status: issues.length === 0 && errors.length === 0 ? "healthy" : "needs-attention",
  };
}

module.exports = { analyzePipeline, parseLogErrors, getAISuggestions, generateReport };

// CLI entry point
if (require.main === module) {
  const [,, command, ...args] = process.argv;

  const commands = {
    analyze: () => {
      const config = JSON.parse(args[0] || "{}");
      const issues = analyzePipeline(config);
      console.log(JSON.stringify(generateReport("cli", issues, []), null, 2));
    },
    "parse-logs": () => {
      const errors = parseLogErrors(args[0] || "");
      console.log(JSON.stringify(errors, null, 2));
    },
    help: () => {
      console.log("Usage: devops-ai <command> [args]");
      console.log("  analyze '<json>'    Analyze a pipeline config JSON");
      console.log("  parse-logs '<logs>' Extract errors from log string");
    },
  };

  if (commands[command]) {
    commands[command]();
  } else {
    commands.help();
    process.exit(1);
  }
}
