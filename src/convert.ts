import fs from 'fs-extra';
import path from 'path';
import xml2js from 'xml2js';
import { CtrfReport, CtrfTest, CtrfEnvironment, Tool } from '../types/ctrf';

interface JUnitTestCase {
  suite: string;
  classname: string;
  name: string;
  time: string;
  failure?: string;
  error?: string;
  skipped?: boolean;
}

async function parseJUnitReport(filePath: string): Promise<JUnitTestCase[]> {
  console.log('Reading JUnit report file:', filePath); 
  const xml = await fs.readFile(filePath, 'utf-8');
  const result = await xml2js.parseStringPromise(xml);
  const testCases: JUnitTestCase[] = [];

  const parseTestSuite = (suite: any, suiteName: string) => {
    if (suite.testcase) {
      suite.testcase.forEach((testCase: any) => {
        const { classname, name, time } = testCase.$;
        const failure = testCase.failure ? testCase.failure[0] : undefined;
        const error = testCase.error ? testCase.error[0] : undefined;
        const skipped = testCase.skipped !== undefined;
        testCases.push({
          suite: suiteName,
          classname,
          name,
          time,
          failure: failure ? (typeof failure === 'string' ? failure : failure._) : undefined,
          error: error ? (typeof error === 'string' ? error : error._) : undefined,
          skipped,
        });
      });
    }
    if (suite.testsuite) {
      suite.testsuite.forEach((nestedSuite: any) => {
        parseTestSuite(nestedSuite, suiteName);
      });
    }
  };

  result.testsuites.testsuite.forEach((suite: any) => {
    const suiteName = suite.$.name;
    parseTestSuite(suite, suiteName);
  });

  return testCases;
}

function convertToCTRFTest(testCase: JUnitTestCase): CtrfTest {
  let status: CtrfTest['status'] = 'other';

  if (testCase.failure) {
    status = 'failed';
  } else if (testCase.error) {
    status = 'failed';
  } else if (testCase.skipped) {
    status = 'skipped';
  } else {
    status = 'passed';
  }

  const durationMs = Math.round(parseFloat(testCase.time) * 1000);

  return {
    name: `${testCase.suite}: ${testCase.name}`,
    status,
    duration: durationMs,
    message: testCase.failure || testCase.error ? (testCase.failure || testCase.error) : undefined,
    trace: testCase.failure || testCase.error ? (testCase.failure || testCase.error) : undefined,
  };
}

function createCTRFReport(
  testCases: JUnitTestCase[],
  toolName?: string,
  envProps?: Record<string, any>
): CtrfReport {
  const ctrfTests = testCases.map(convertToCTRFTest);
  const passed = ctrfTests.filter(test => test.status === 'passed').length;
  const failed = ctrfTests.filter(test => test.status === 'failed').length;
  const skipped = ctrfTests.filter(test => test.status === 'skipped').length;
  const pending = ctrfTests.filter(test => test.status === 'pending').length;
  const other = ctrfTests.filter(test => test.status === 'other').length;

  const summary = {
    tests: ctrfTests.length,
    passed,
    failed,
    skipped,
    pending,
    other,
    start: 0, 
    stop: 0, 
  };

  const tool: Tool = {
    name: toolName || 'junit-to-ctrf',
  };

  const report: CtrfReport = {
    results: {
      tool,
      summary,
      tests: ctrfTests,
    }
  };

  if (envProps && Object.keys(envProps).length > 0) {
    report.results.environment = envProps;
  }

  return report;
}

export async function convertJUnitToCTRF(
  junitPath: string,
  outputPath?: string,
  toolName?: string,
  envProps?: string[]
): Promise<void> {
  const testCases = await parseJUnitReport(junitPath);
  const envPropsObj = envProps ? Object.fromEntries(envProps.map(prop => prop.split('='))) : {};
  const ctrfReport = createCTRFReport(testCases, toolName, envPropsObj);

  const defaultOutputPath = path.join('ctrf', 'ctrf-report.json');
  const finalOutputPath = path.resolve(outputPath || defaultOutputPath);

  const outputDir = path.dirname(finalOutputPath);
  await fs.ensureDir(outputDir);

  console.log('Writing CTRF report to:', finalOutputPath); 
  await fs.outputJson(finalOutputPath, ctrfReport, { spaces: 2 });
}
