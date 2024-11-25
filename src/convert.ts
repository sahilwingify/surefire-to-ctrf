import fs from "fs-extra";
import path from "path";
import { parseString } from "xml2js";
import { CtrfReport, CtrfTest, Tool } from "../types/ctrf";

// Update the CtrfTestState type
type CtrfTestState = "passed" | "failed" | "skipped" | "pending" | "other";

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
        console.error("Failed to parse XML:", err);
        reject(new Error(`Failed to parse TestNG XML: ${err.message}`));
        return;
      }

      try {
        const testCases: TestNGTestCase[] = [];
        const testngResults = result["testng-results"];
        
        if (!testngResults) {
          console.error("Invalid XML structure: Missing testng-results element");
          reject(new Error("Invalid TestNG report format: missing testng-results"));
          return;
        }

        const suite = testngResults?.suite?.[0];
        if (!suite) {
          console.error("Invalid XML structure: Missing or empty suite element");
          reject(new Error("Invalid TestNG report format: missing suite"));
          return;
        }

        // Find the beforeSuite method for start time
        let startedAt = suite.$?.["started-at"];
        const finishedAt = suite.$?.["finished-at"];

        if (!startedAt || !finishedAt) {
          console.warn("Missing timestamp attributes in suite:", {
            startedAt: startedAt || "MISSING",
            finishedAt: finishedAt || "MISSING"
          });
        }

        if (suite.test && Array.isArray(suite.test)) {
          try {
            const beforeSuiteMethod = suite.test
              .flatMap((test: any) => {
                if (!test.class) {
                  console.warn(`Test missing class element: ${test.$?.name || "unnamed test"}`);
                  return [];
                }
                return test.class || [];
              })
              .flatMap((classItem: any) => {
                if (!classItem["test-method"]) {
                  console.warn(`Class missing test-method element: ${classItem.$?.name || "unnamed class"}`);
                  return [];
                }
                return classItem["test-method"] || [];
              })
              .find((method: any) => method.$ && method.$.name === "beforeSuite");
            
            if (beforeSuiteMethod) {
              startedAt = beforeSuiteMethod.$["started-at"];
              console.log("Using beforeSuite method start time:", startedAt);
            }
          } catch (error) {
            console.error("Error processing beforeSuite method:", error);
          }
        }

        // Extract test result counts and suite information
        const results: TestNGResults = {
          total: parseInt(testngResults.$["total"], 10) || 0,
          passed: parseInt(testngResults.$["passed"], 10) || 0,
          failed: parseInt(testngResults.$["failed"], 10) || 0,
          skipped: parseInt(testngResults.$["skipped"], 10) || 0,
          ignored: parseInt(testngResults.$["ignored"], 10) || 0,
          startTime: parseDate(startedAt),
          endTime: parseDate(finishedAt),
          suiteName: suite.$?.["name"] || "Unknown Suite",
        };

        console.log("Parsed test results:", {
          total: results.total,
          passed: results.passed,
          failed: results.failed,
          skipped: results.skipped,
          ignored: results.ignored
        });

        // Process test cases with safer property access
        if (Array.isArray(suite.test)) {
          suite.test.forEach((test: any, testIndex: number) => {
            if (!test.class || !Array.isArray(test.class)) {
              console.warn(`Invalid test structure at index ${testIndex}: missing or invalid class array`);
              return;
            }
            
            test.class.forEach((classObj: any, classIndex: number) => {
              if (!classObj["test-method"] || !Array.isArray(classObj["test-method"])) {
                console.warn(`Invalid class structure at test ${testIndex}, class ${classIndex}: missing or invalid test-method array`);
                return;
              }

              classObj["test-method"].forEach((method: any, methodIndex: number) => {
                try {
                  if (!method.$ || method.$.is_config === "true") return;

                  const testCase: TestNGTestCase = {
                    name: `${test.$.name || "Unknown Test"}: ${method.$.name || "Unknown Method"}`,
                    status: (method.$.status || "other").toLowerCase(),
                    duration: parseInt(method.$["duration-ms"], 10) || 0,
                    startTime: parseDate(method.$["started-at"]),
                    endTime: parseDate(method.$["finished-at"]),
                  };

                  // Safely add message and trace for failed tests
                  if (method.exception?.[0]) {
                    if (method.exception[0].message?.[0]) {
                      testCase.message = method.exception[0].message[0];
                    }
                    if (method.exception[0]["full-stacktrace"]?.[0]) {
                      testCase.trace = method.exception[0]["full-stacktrace"][0];
                    }
                  }

                  testCases.push(testCase);
                } catch (error) {
                  console.error(`Error processing test method at test ${testIndex}, class ${classIndex}, method ${methodIndex}:`, error);
                  console.error('Method data:', JSON.stringify(method, null, 2));
                }
              });
            });
          });
        }

        console.log(`Successfully parsed ${testCases.length} test cases`);
        resolve({ testCases, results });

      } catch (error) {
        console.error("Error parsing TestNG report:", error);
        console.error("Partial parsed data:", JSON.stringify(result, null, 2));
        const errorMessage = error instanceof Error ? error.message : String(error);
        reject(new Error(`Failed to parse TestNG report: ${errorMessage}`));
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