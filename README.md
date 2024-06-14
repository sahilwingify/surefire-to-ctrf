# Convert JUnit XML to CTRF JSON

> Convert JUnit reports to CTRF reports

⭐ **If you find this project useful, consider giving it a GitHub star** ⭐

It means a lot to us and helps us grow this open source library.

## We need your help

We believe CTRF can save **a lot** of time for engineers, a single data serialisation report, well structured, community driven and works with any framework. For over 30 years software engineers have used a de facto data serialisation report, you know the one! But we feel it’s time to modernise.

The only way we can grow CTRF is with your help and the support of the software engineering community.

## How can you help?

- Join and build with us! We are looking for [contributors](https://github.com/ctrf-io), get involved in this early stage project. All contributions are welcome.
- Give this repository a star ⭐⭐⭐⭐⭐⭐
- Follow the CTRF [GitHub organisation](https://github.com/ctrf-io)
- Clap for our [Medium articles](https://medium.com/@ma11hewthomas) (30 times each) 👏
- Share, share share! Discord, Reddit, Twitter, LinkedIn, Slack, Teams, whereever! - please share our [libraries](https://github.com/orgs/ctrf-io/repositories), our [homepage](https://www.ctrf.io/), our [Medium articles](https://medium.com/@ma11hewthomas)
- Maybe even write a blog about us!
- Try our [tools](https://github.com/orgs/ctrf-io/repositories)

**Thank you so much!!**

## Usage

```sh
npx junit-to-ctrf path/to/junit.xml
```

## Options

`-o`, `--output` <output>: Output directory and filename for the CTRF report. If not provided, defaults to ctrf/ctrf-report.json.

`-t`, `--tool` <toolName>: Tool name to include in the CTRF report.

`-e`, `--env` <envProperties>: Environment properties to include in the CTRF report. Accepts multiple properties in the format KEY=value.

## Examples

Convert a JUnit XML report to the default CTRF report location (ctrf/ctrf-report.json):

```sh
npx junit-to-ctrf path/to/junit.xml
```

### Specify Output File

Convert a JUnit XML report to a specified output file:

```sh
npx junit-to-ctrf path/to/junit.xml -o path/to/output/ctrf-report.json
```

### Include Tool Name

Convert a JUnit XML report and include a tool name in the CTRF report:

```sh
npx junit-to-ctrf path/to/junit.xml -t ExampleTool
```

### Include Environment Properties

Convert a JUnit XML report and include environment properties in the CTRF report:

```sh
npx junit-to-ctrf path/to/junit.xml -e appName=MyApp buildName=MyBuild
```

See [CTRF schema](https://www.ctrf.io/docs/schema/environment) for possible environment properties

### Full Command

Combine all options in a single command:

```sh
npx junit-to-ctrf path/to/junit.xml -o path/to/output/ctrf-report.json -t ExampleTool -e appName=MyApp buildName=MyBuild
```

## What is CTRF?

CTRF is a universal JSON test report schema that addresses the lack of a standardized format for JSON test reports.

**Consistency Across Tools:** Different testing tools and frameworks often produce reports in varied formats. CTRF ensures a uniform structure, making it easier to understand and compare reports, regardless of the testing tool used.

**Language and Framework Agnostic:** It provides a universal reporting schema that works seamlessly with any programming language and testing framework.

**Facilitates Better Analysis:** With a standardized format, programatically analyzing test outcomes across multiple platforms becomes more straightforward.

## Support Us

If you find this project useful, consider giving it a GitHub star ⭐ It means a lot to us.
