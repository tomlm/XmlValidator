/**
 * Copyright(c) Microsoft Corporation.All rights reserved.
 * Licensed under the MIT License.
 */
import * as child_process from 'child_process';

export interface SpawnResult {
    stdout: string;
    stderr: string;
}

// child_process.spawn isn't promise and is complicated in how to captures stream of stdout/sterr
export function spawnAsync(command: string, stdin?: string, options?: child_process.SpawnSyncOptions): Promise<SpawnResult> {
    return new Promise<SpawnResult>((resolve: (value?: SpawnResult) => void, reject: (value?: string) => void): void => {
        const parts: string[] = command.split(' ');
        Object.assign(options || {}, { shell: true, stdio: ['pipe', 'pipe', 'pipe'], encoding: 'utf8' });
        const p: child_process.ChildProcess = child_process.spawn(parts[0], parts.slice(1), options);

        let spawnResult = {
            stdout: '',
            stderr: ''
        }

        p.stdout.on('data', (data: Buffer) => {
            let outputTest = data.toString('utf8');
            spawnResult.stdout += outputTest;
        });

        p.stderr.on('data', (data: Buffer) => {
            let errorTest = data.toString('utf8');
            spawnResult.stderr += errorTest;
        });


        p.on('close', (code: number) => {
            if (code > 0) {
                reject(`${command} exit code: ${code}\n${spawnResult.stderr}`);
            } else {
                resolve(spawnResult);
            }
        });

        if (stdin) {
            p.stdin.write(stdin, 'utf8');
        }

    });
}
