import fs from "fs-extra";
import path from "path";
import { parseString } from "xml2js";
import { CtrfReport, CtrfTest, CtrfTestState, Tool } from "../types/ctrf";

interface TestNGTestCase {
  name: string;
  status: string;
  duration: number;
  startTime: number;
  endTime: number;
  message?: string;
  trace?: string;
}

interface TestNGResults {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  ignored: number;
  startTime: number;
  endTime: number;
  suiteName: string;
}

/**
 * Parses a date string and returns the corresponding timestamp.
 * @param {string} dateString - The date string to parse.
 * @returns {number} The timestamp in milliseconds, or 0 if parsing fails.
 */
function parseDate(dateString: string): number {
  try {
    // Try parsing with the 'T' and timezone
    const date = new Date(dateString);
    if (!isNaN(date.getTime())) {
      return date.getTime();
    }

    // If that fails, try parsing without the timezone
    const withoutTZ = dateString.split(" ")[0];
    const dateWithoutTZ = new Date(withoutTZ);
    if (!isNaN(dateWithoutTZ.getTime())) {
      return dateWithoutTZ.getTime();
    }

    console.error(`Failed to parse date: ${dateString}`);
    return 0;
  } catch (error) {
    console.error(`Error parsing date ${dateString}:`, error);
    return 0;
  }
}

/**
 * Parses a TestNG XML report file and extracts test cases and results.
 * @param {string} filePath - The path to the TestNG XML report file.
 * @returns {Promise<{ testCases: TestNGTestCase[]; results: TestNGResults }>} A promise that resolves to an object containing test cases and overall results.
 */
async function parseTestNGReport(
  filePath: string,
): Promise<{ testCases: TestNGTestCase[]; results: TestNGResults }> {
  console.log("Reading TestNG report file:", filePath);
  const xml = await fs.readFile(filePath, "utf-8");

  return new Promise((resolve, reject) => {
    parseString(xml, (err, result) => {
      if (err) {
        reject(err);
      } else {
        const testCases: TestNGTestCase[] = [];
        const testngResults = result["testng-results"];
        const suite = testngResults.suite[0];

        // Find the beforeSuite method for start time
        let startedAt = suite.$["started-at"]; // Default to suite start time
        const finishedAt = suite.$["finished-at"]; // Keep end time from suite

        if (suite.test && Array.isArray(suite.test)) {
          const beforeSuiteMethod = suite.test
            .flatMap((test: { class: any; }) => test.class || [])
            .flatMap((classItem: { [x: string]: any; }) => classItem["test-method"] || [])
            .find((method: { $: { name: string; }; }) => method.$.name === "beforeSuite");

          if (beforeSuiteMethod) {
            startedAt = beforeSuiteMethod.$["started-at"];
          }
        }

        // Extract test result counts and suite information
        const results: TestNGResults = {
          total: parseInt(testngResults.$["total"], 10),
          passed: parseInt(testngResults.$["passed"], 10),
          failed: parseInt(testngResults.$["failed"], 10),
          skipped: parseInt(testngResults.$["skipped"], 10),
          ignored: parseInt(testngResults.$["ignored"], 10),
          startTime: parseDate(startedAt),
          endTime: parseDate(finishedAt),
          suiteName: suite.$["name"],
        };

        // Process test cases
        suite.test.forEach((test: any) => {
          test.class.forEach((classObj: any) => {
            classObj["test-method"].forEach((method: any) => {
              if (method.$.is_config !== "true") {
                const startTime = parseDate(method.$["started-at"]);
                const endTime = parseDate(method.$["finished-at"]);
                const testCase: TestNGTestCase = {
                  name: `${test.$.name}: ${method.$.name}`,
                  status: method.$.status.toLowerCase(),
                  duration: parseInt(method.$["duration-ms"], 10),
                  startTime,
                  endTime,
                };

                // Add message and trace for failed tests
                if (method.exception && method.exception.length > 0) {
                  testCase.message = method.exception[0].message[0];
                  testCase.trace = method.exception[0]["full-stacktrace"][0];
                }

                testCases.push(testCase);
              }
            });
          });
        });

        resolve({ testCases, results });
      }
    });
  });
}

/**
 * Converts a TestNG test case to a CTRF test format.
 * @param {TestNGTestCase} testCase - The TestNG test case to convert.
 * @returns {CtrfTest} The converted CTRF test object.
 */
function convertToCTRFTest(testCase: TestNGTestCase): CtrfTest {
  let status: CtrfTestState;
  switch (testCase.status) {
    case "pass":
      status = "passed";
      break;
    case "fail":
      status = "failed";
      break;
    case "skip":
      status = "skipped";
      break;
    default:
      status = "other";
  }

  const ctrfTest: CtrfTest = {
    name: testCase.name,
    status: status,
    duration: testCase.duration,
  };

  if (status === "failed" && testCase.message) {
    ctrfTest.message = testCase.message;
  }

  if (status === "failed" && testCase.trace) {
    ctrfTest.trace = testCase.trace;
  }

  return ctrfTest;
}

/**
 * Creates a CTRF report from TestNG test cases and results.
 * @param {TestNGTestCase[]} testCases - An array of TestNG test cases.
 * @param {TestNGResults} results - The overall TestNG results.
 * @param {string} [toolName] - The name of the testing tool (default: "TestNG").
 * @param {Record<string, any>} [envProps] - Additional environment properties.
 * @returns {CtrfReport} The created CTRF report object.
 */
function createCTRFReport(
  testCases: TestNGTestCase[],
  results: TestNGResults,
  toolName?: string,
  envProps?: Record<string, any>,
): CtrfReport {
  const ctrfTests = testCases.map(convertToCTRFTest);

  const summary = {
    tests: results.total,
    passed: results.passed,
    failed: results.failed,
    pending: 0, // TestNG doesn't have a 'pending' status
    skipped: results.skipped,
    other: results.ignored,
    start: results.startTime,
    stop: results.endTime,
  };

  const tool: Tool = {
    name: toolName || "TestNG",
  };

  const environment = {
    ...envProps,
  };

  const report: CtrfReport = {
    results: {
      tool,
      summary,
      tests: ctrfTests,
      environment,
    },
  };

  return report;
}

/**
 * Converts a TestNG XML report to a CTRF JSON report.
 * @param {string} testngPath - The path to the TestNG XML report file.
 * @param {string} [outputPath] - The path where the CTRF JSON report should be saved (default: "ctrf/ctrf-report.json").
 * @param {string} [toolName] - The name of the testing tool (default: "TestNG").
 * @param {string[]} [envProps] - Additional environment properties in the format "key=value".
 * @returns {Promise<void>} A promise that resolves when the conversion is complete.
 */
export async function convertTestngToCTRF(
  testngPath: string,
  outputPath?: string,
  toolName?: string,
  envProps?: string[],
): Promise<void> {
  const { testCases, results } = await parseTestNGReport(testngPath);
  const envPropsObj = envProps
    ? Object.fromEntries(envProps.map((prop) => prop.split("=")))
    : {};
  const ctrfReport = createCTRFReport(
    testCases,
    results,
    toolName,
    envPropsObj,
  );

  const defaultOutputPath = path.join("ctrf", "ctrf-report.json");
  const finalOutputPath = path.resolve(outputPath || defaultOutputPath);

  const outputDir = path.dirname(finalOutputPath);
  await fs.ensureDir(outputDir);

  console.log("Writing CTRF report to:", finalOutputPath);
  await fs.outputJson(finalOutputPath, ctrfReport, { spaces: 2 });
}
