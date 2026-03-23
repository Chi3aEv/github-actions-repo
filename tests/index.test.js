const axios = require("axios");
const {
  analyzePipeline,
  parseLogErrors,
  getAISuggestions,
  generateReport,
} = require("../src/index");

jest.mock("axios");

// --- analyzePipeline ---
describe("analyzePipeline", () => {
  test("returns error for invalid input", () => {
    expect(analyzePipeline(null)).toContain("Invalid pipeline config");
    expect(analyzePipeline("string")).toContain("Invalid pipeline config");
  });

  test("detects missing jobs", () => {
    expect(analyzePipeline({ on: "push" })).toContain("No jobs defined in pipeline");
  });

  test("detects missing trigger events", () => {
    const issues = analyzePipeline({ jobs: { build: { "runs-on": "ubuntu-latest", steps: [{}] } } });
    expect(issues).toContain("No trigger events defined");
  });

  test("detects missing runs-on in job", () => {
    const config = {
      on: "push",
      jobs: { build: { steps: [{ run: "echo hi" }] } },
    };
    expect(analyzePipeline(config)).toContain("Job 'build' is missing 'runs-on'");
  });

  test("detects job with no steps", () => {
    const config = {
      on: "push",
      jobs: { build: { "runs-on": "ubuntu-latest", steps: [] } },
    };
    expect(analyzePipeline(config)).toContain("Job 'build' has no steps");
  });

  test("returns empty array for valid pipeline", () => {
    const config = {
      on: "push",
      jobs: {
        build: {
          "runs-on": "ubuntu-latest",
          steps: [{ run: "npm test" }],
        },
      },
    };
    expect(analyzePipeline(config)).toHaveLength(0);
  });
});

// --- parseLogErrors ---
describe("parseLogErrors", () => {
  test("returns empty array for non-string input", () => {
    expect(parseLogErrors(null)).toEqual([]);
    expect(parseLogErrors(123)).toEqual([]);
  });

  test("extracts error lines from logs", () => {
    const logs = "Step 1 passed\nERROR: build failed\nStep 3 passed\nFatal: out of memory";
    const errors = parseLogErrors(logs);
    expect(errors).toContain("ERROR: build failed");
    expect(errors).toContain("Fatal: out of memory");
    expect(errors).not.toContain("Step 1 passed");
  });

  test("returns empty array when no errors in logs", () => {
    expect(parseLogErrors("All steps passed\nDeploy complete")).toEqual([]);
  });
});

// --- getAISuggestions ---
describe("getAISuggestions", () => {
  test("returns early message when no issues", async () => {
    const result = await getAISuggestions([], "key", "http://api.test");
    expect(result).toBe("No issues to analyze.");
  });

  test("throws if apiKey is missing", async () => {
    await expect(getAISuggestions(["issue"], null, "http://api.test")).rejects.toThrow("API key is required");
  });

  test("throws if apiUrl is missing", async () => {
    await expect(getAISuggestions(["issue"], "key", null)).rejects.toThrow("API URL is required");
  });

  test("returns AI suggestion on success", async () => {
    axios.post.mockResolvedValue({
      data: { choices: [{ message: { content: "Fix your pipeline triggers." } }] },
    });
    const result = await getAISuggestions(["No trigger events defined"], "key", "http://api.test");
    expect(result).toBe("Fix your pipeline triggers.");
  });

  test("propagates axios errors", async () => {
    axios.post.mockRejectedValue(new Error("Network error"));
    await expect(getAISuggestions(["issue"], "key", "http://api.test")).rejects.toThrow("Network error");
  });
});

// --- generateReport ---
describe("generateReport", () => {
  test("returns healthy status when no issues or errors", () => {
    const report = generateReport("my-pipeline", [], []);
    expect(report.status).toBe("healthy");
    expect(report.pipeline).toBe("my-pipeline");
    expect(report.issueCount).toBe(0);
  });

  test("returns needs-attention when issues exist", () => {
    const report = generateReport("ci", ["missing jobs"], []);
    expect(report.status).toBe("needs-attention");
    expect(report.issueCount).toBe(1);
  });

  test("returns needs-attention when errors exist", () => {
    const report = generateReport("ci", [], ["ERROR: build failed"]);
    expect(report.status).toBe("needs-attention");
    expect(report.errorCount).toBe(1);
  });

  test("uses unknown for missing pipeline name", () => {
    const report = generateReport(null, [], []);
    expect(report.pipeline).toBe("unknown");
  });

  test("includes a timestamp", () => {
    const report = generateReport("ci", [], []);
    expect(report.timestamp).toBeDefined();
    expect(new Date(report.timestamp).toString()).not.toBe("Invalid Date");
  });
});
