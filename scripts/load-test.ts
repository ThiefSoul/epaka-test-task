const config = parseArgs();
const stats = {
  attempted: 0,
  succeeded: 0,
  failed: 0,
  errors: [] as string[],
};
const total = config.types * config.filesPerType;
const runId = `run-${Date.now().toString(36)}`;
const startedAt = Date.now();
const fileBody = new Uint8Array(config.fileSize).fill('x'.charCodeAt(0)).buffer;
let nextFileIndex = 0;

printConfig();

await Promise.all(
  Array.from({ length: config.concurrency }, async () => {
    for (;;) {
      const fileIndex = nextFileIndex;
      nextFileIndex += 1;

      if (fileIndex >= total) {
        return;
      }

      await upload(fileIndex);
    }
  }),
);

printStats();
process.exitCode = stats.failed > 0 ? 1 : 0;

function parseArgs() {
  return {
    apiBaseUrl: arg('api-base-url') ?? 'http://localhost:3000',
    concurrency: numberArg('concurrency', 20),
    fileSize: fileSizeArg(arg('file-size') ?? '100kb'),
    filesPerType: numberArg('files-per-type', 30_000),
    types: numberArg('types', 10),
  };
}

async function upload(fileIndex: number): Promise<void> {
  const type = Math.floor(fileIndex / config.filesPerType) + 1;
  const file = (fileIndex % config.filesPerType) + 1;
  const fileType = `load-type-${type}`;
  const fileId = `${runId}-file-${file}`;

  stats.attempted += 1;

  try {
    const response = await fetch(
      `${config.apiBaseUrl}/v1/files/${fileType}/${fileId}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: fileBody,
      },
    );

    if (!response.ok) {
      throw new Error(`${response.status} ${await response.text()}`);
    }

    stats.succeeded += 1;
  } catch (error) {
    stats.failed += 1;

    if (stats.errors.length < 10) {
      stats.errors.push(`${fileType}/${fileId}: ${String(error)}`);
    }
  }
}

function arg(name: string): string | undefined {
  const inline = process.argv.find((value) => value.startsWith(`--${name}=`));

  if (inline) {
    return inline.split('=', 2)[1];
  }

  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

function numberArg(name: string, fallback: number) {
  return Number(arg(name) ?? fallback);
}

function fileSizeArg(value: string): number {
  const match = value.match(/^(\d+)(kb|mb)?$/i);
  const size = Number(match?.[1] ?? value);
  const unit = match?.[2]?.toLowerCase();

  if (unit === 'mb') {
    return size * 1024 * 1024;
  }

  if (unit === 'kb') {
    return size * 1024;
  }

  return size;
}

function printConfig(): void {
  console.log('Load test configuration');
  console.log(`API base URL: ${config.apiBaseUrl}`);
  console.log(`Types: ${config.types}`);
  console.log(`Files per type: ${config.filesPerType}`);
  console.log(`File size: ${config.fileSize} bytes`);
  console.log(`Concurrency: ${config.concurrency}`);
  console.log(`Total files: ${total}`);
}

function printStats(): void {
  const duration = (Date.now() - startedAt) / 1000;
  const throughput = stats.succeeded / duration;

  console.log('');
  console.log('Load test results');
  console.log(`Attempted: ${stats.attempted}`);
  console.log(`Succeeded: ${stats.succeeded}`);
  console.log(`Failed: ${stats.failed}`);
  console.log(`Duration: ${duration.toFixed(2)}s`);
  console.log(`Throughput: ${throughput.toFixed(2)} uploads/s`);

  for (const error of stats.errors) {
    console.log(`- ${error}`);
  }
}
