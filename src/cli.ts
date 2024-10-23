#!/usr/bin/env node

import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { convertTestngToCTRF } from "./convert";

yargs(hideBin(process.argv))
  .usage("Usage: $0 <testng-results.xml> [options]")
  .command(
    "$0 <path>",
    "Convert Testng XML report to CTRF",
    (yargs) => {
      return yargs
        .positional("path", {
          describe: "Path to the Testng XML file",
          type: "string",
          demandOption: true,
        })
        .option("output", {
          alias: "o",
          type: "string",
          description: "Output directory and filename for the CTRF report",
        })
        .option("tool", {
          alias: "t",
          type: "string",
          description: "Tool name",
        })
        .option("env", {
          alias: "e",
          type: "array",
          description: "Environment properties",
        });
    },
    async (argv) => {
      try {
        const { path, output, tool, env } = argv;
        await convertTestngToCTRF(
          path as string,
          output as string,
          tool as string,
          env as string[],
        );
        console.log("Conversion completed successfully.");
      } catch (error: any) {
        console.error("Error:", error.message);
      }
    },
  )
  .help().argv;
