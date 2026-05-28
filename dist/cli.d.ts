#!/usr/bin/env node
interface CliIO {
    stdout(text: string): void;
    stderr(text: string): void;
}
declare function runCli(argv: string[], io?: CliIO): Promise<number>;

export { type CliIO, runCli };
