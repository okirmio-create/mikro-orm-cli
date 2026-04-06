import { Command } from 'commander';
import chalk from 'chalk';
import { writeFileSync, existsSync, readFileSync, mkdirSync } from 'fs';
import { resolve, join } from 'path';

const program = new Command();

program
  .name('mikro-orm-config')
  .description(chalk.cyan('MikroORM CLI — generate configs, entities, migrations'))
  .version('1.0.0');

// ─── helpers ─────────────────────────────────────────────────────────────────

function success(msg: string) {
  console.log(chalk.green('✔'), chalk.white(msg));
}

function info(msg: string) {
  console.log(chalk.blue('ℹ'), chalk.gray(msg));
}

function warn(msg: string) {
  console.log(chalk.yellow('⚠'), chalk.yellow(msg));
}

function error(msg: string) {
  console.error(chalk.red('✖'), chalk.red(msg));
}

function header(title: string) {
  console.log();
  console.log(chalk.bold.cyan(`── ${title} ──────────────────────────────────`));
  console.log();
}

function writeFileSafe(path: string, content: string, label: string): boolean {
  if (existsSync(path)) {
    warn(`${label} already exists at ${chalk.underline(path)} — skipping`);
    return false;
  }
  writeFileSync(path, content, 'utf8');
  success(`Created ${label}: ${chalk.underline(path)}`);
  return true;
}

function ensureDir(dir: string): void {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
    success(`Created directory: ${chalk.underline(dir)}`);
  }
}

// ─── init command ─────────────────────────────────────────────────────────────

interface DriverInfo {
  pkg: string;
  driverClass: string;
  defaultPort: number | null;
}

const DRIVER_MAP: Record<string, DriverInfo> = {
  pg:     { pkg: '@mikro-orm/postgresql', driverClass: 'PostgreSqlDriver', defaultPort: 5432  },
  mysql:  { pkg: '@mikro-orm/mysql',      driverClass: 'MySqlDriver',      defaultPort: 3306  },
  sqlite: { pkg: '@mikro-orm/sqlite',     driverClass: 'SqliteDriver',     defaultPort: null  },
  mongo:  { pkg: '@mikro-orm/mongodb',    driverClass: 'MongoDriver',      defaultPort: 27017 },
};

function buildMikroOrmConfig(driver: string, opts: { dbName: string; host: string }): string {
  const d = DRIVER_MAP[driver];
  const portLine  = d.defaultPort != null ? `  port: ${d.defaultPort},` : '';
  const hostLine  = driver !== 'sqlite' ? `  host: '${opts.host}',` : '';
  const dbLine    = driver === 'sqlite'
    ? `  dbName: '${opts.dbName}.sqlite',`
    : `  dbName: '${opts.dbName}',`;

  const lines = [
    `import { defineConfig } from '@mikro-orm/core';`,
    `import { ${d.driverClass} } from '${d.pkg}';`,
    ``,
    `export default defineConfig({`,
    `  driver: ${d.driverClass},`,
    ...(hostLine ? [`  ${hostLine.trim()}`] : []),
    ...(portLine ? [`  ${portLine.trim()}`] : []),
    `  ${dbLine.trim()}`,
    `  user: process.env.DB_USER ?? 'root',`,
    `  password: process.env.DB_PASSWORD ?? '',`,
    `  entities: ['dist/**/*.entity.js'],`,
    `  entitiesTs: ['src/**/*.entity.ts'],`,
    `  migrations: {`,
    `    path: 'migrations',`,
    `    pathTs: 'src/migrations',`,
    `    glob: '!(*.d).{js,ts}',`,
    `  },`,
    `  debug: process.env.NODE_ENV !== 'production',`,
    `});`,
    ``,
  ];
  return lines.join('\n');
}

program
  .command('init <driver>')
  .description('Generate mikro-orm.config.ts for the specified driver (pg|mysql|sqlite|mongo)')
  .option('-d, --db-name <name>', 'Database name', 'myapp')
  .option('-H, --host <host>',   'Database host', 'localhost')
  .option('-o, --out <file>',    'Output file',   'mikro-orm.config.ts')
  .action((driver: string, opts: { dbName: string; host: string; out: string }) => {
    header('mikro-orm init');

    const supported = Object.keys(DRIVER_MAP);
    if (!supported.includes(driver)) {
      error(`Unsupported driver "${driver}". Choose from: ${supported.join(', ')}`);
      process.exit(1);
    }

    const d = DRIVER_MAP[driver];
    info(`Driver   : ${chalk.cyan(driver)} → ${d.driverClass}`);
    info(`Package  : ${chalk.cyan(d.pkg)}`);
    info(`DB name  : ${chalk.cyan(opts.dbName)}`);
    if (driver !== 'sqlite') info(`Host     : ${chalk.cyan(opts.host)}`);
    console.log();

    const outPath = resolve(process.cwd(), opts.out);
    const content = buildMikroOrmConfig(driver, opts);
    writeFileSafe(outPath, content, 'MikroORM config');

    console.log();
    info(`Install the driver:  ${chalk.bold(`npm i ${d.pkg} @mikro-orm/core`)}`);
    info(`Run migrations:      ${chalk.bold('npx mikro-orm migration:up')}`);
    console.log();
  });

// ─── entity command ───────────────────────────────────────────────────────────

function pascalToSnake(name: string): string {
  return name
    .replace(/([A-Z])/g, (m, l, i) => (i ? '_' : '') + l.toLowerCase());
}

function buildEntity(name: string, opts: { tableName: string; soft: boolean }): string {
  const table = opts.tableName || pascalToSnake(name);
  const extraImports = opts.soft ? ', Property' : '';
  const softField = opts.soft
    ? `\n  @Property({ nullable: true })\n  deletedAt?: Date;\n`
    : '';

  return [
    `import { Entity, PrimaryKey, Property${extraImports} } from '@mikro-orm/core';`,
    ``,
    `@Entity({ tableName: '${table}' })`,
    `export class ${name} {`,
    ``,
    `  @PrimaryKey()`,
    `  id!: number;`,
    ``,
    `  @Property()`,
    `  createdAt: Date = new Date();`,
    ``,
    `  @Property({ onUpdate: () => new Date() })`,
    `  updatedAt: Date = new Date();`,
    softField,
    `  constructor(partial?: Partial<${name}>) {`,
    `    Object.assign(this, partial);`,
    `  }`,
    `}`,
    ``,
  ].join('\n');
}

program
  .command('entity <name>')
  .description('Generate a MikroORM entity class with decorators')
  .option('-t, --table-name <table>', 'Override table name (default: snake_case of name)', '')
  .option('-s, --soft-delete',        'Add deletedAt soft-delete field', false)
  .option('-o, --out-dir <dir>',      'Output directory', 'src/entities')
  .action((name: string, opts: { tableName: string; softDelete: boolean; outDir: string }) => {
    header('mikro-orm entity');

    if (!/^[A-Z][A-Za-z0-9]+$/.test(name)) {
      error('Entity name must be PascalCase, e.g. UserProfile');
      process.exit(1);
    }

    const table = opts.tableName || pascalToSnake(name);
    info(`Entity   : ${chalk.cyan(name)}`);
    info(`Table    : ${chalk.cyan(table)}`);
    info(`Soft del : ${opts.softDelete ? chalk.green('yes') : chalk.gray('no')}`);
    console.log();

    const outDir  = resolve(process.cwd(), opts.outDir);
    const outFile = join(outDir, `${name}.entity.ts`);

    try {
      ensureDir(outDir);
    } catch (e) {
      error(`Cannot create directory: ${outDir}`);
      process.exit(1);
    }

    const content = buildEntity(name, { tableName: table, soft: opts.softDelete });
    writeFileSafe(outFile, content, `${name} entity`);
    console.log();
  });

// ─── migrate command ──────────────────────────────────────────────────────────

function buildMigration(name: string, ts: number): string {
  const slug      = name.replace(/\s+/g, '_').replace(/[^A-Za-z0-9_]/g, '');
  const className = `Migration${ts}_${slug}`;

  return [
    `import { Migration } from '@mikro-orm/migrations';`,
    ``,
    `export class ${className} extends Migration {`,
    ``,
    `  async up(): Promise<void> {`,
    `    // TODO: add your UP migration SQL`,
    `    // this.addSql('alter table "users" add column "role" varchar(50) not null default \\'user\\'');`,
    `  }`,
    ``,
    `  async down(): Promise<void> {`,
    `    // TODO: add your DOWN migration SQL`,
    `    // this.addSql('alter table "users" drop column "role"');`,
    `  }`,
    `}`,
    ``,
  ].join('\n');
}

program
  .command('migrate <name>')
  .description('Create a blank migration file')
  .option('-o, --out-dir <dir>', 'Output directory', 'src/migrations')
  .action((name: string, opts: { outDir: string }) => {
    header('mikro-orm migrate');

    const ts       = Date.now();
    const slug     = name.replace(/\s+/g, '_').replace(/[^A-Za-z0-9_]/g, '');
    const fileName = `Migration${ts}_${slug}.ts`;
    const outDir   = resolve(process.cwd(), opts.outDir);
    const outFile  = join(outDir, fileName);

    info(`Name     : ${chalk.cyan(name)}`);
    info(`File     : ${chalk.cyan(fileName)}`);
    info(`Dir      : ${chalk.cyan(outDir)}`);
    console.log();

    try {
      ensureDir(outDir);
    } catch (e) {
      error(`Cannot create directory: ${outDir}`);
      process.exit(1);
    }

    const content = buildMigration(name, ts);
    writeFileSafe(outFile, content, 'migration file');

    console.log();
    info(`Edit the file and run:  ${chalk.bold('npx mikro-orm migration:up')}`);
    console.log();
  });

// ─── validate command ─────────────────────────────────────────────────────────

interface Check {
  pattern: RegExp;
  label: string;
  critical: boolean;
}

const CONFIG_CHECKS: Check[] = [
  { pattern: /defineConfig|MikroOrmModuleOptions/,     label: 'Uses defineConfig or MikroOrmModuleOptions', critical: true  },
  { pattern: /entities\s*:/,                           label: 'entities path defined',                      critical: true  },
  { pattern: /entitiesTs\s*:/,                         label: 'entitiesTs path defined',                    critical: false },
  { pattern: /migrations\s*:/,                         label: 'migrations block present',                   critical: false },
  { pattern: /Driver/,                                 label: 'Driver class referenced',                    critical: true  },
  { pattern: /process\.env/,                           label: 'Uses env vars for credentials',              critical: false },
];

program
  .command('validate')
  .description('Validate mikro-orm.config.ts exists and is structurally correct')
  .option('-c, --config <file>', 'Config file to validate', 'mikro-orm.config.ts')
  .action((opts: { config: string }) => {
    header('mikro-orm validate');

    const configPath = resolve(process.cwd(), opts.config);
    info(`Checking: ${chalk.underline(configPath)}`);
    console.log();

    if (!existsSync(configPath)) {
      error(`Config file not found: ${chalk.underline(configPath)}`);
      info(`Run ${chalk.bold('mikro-orm-config init <driver>')} to generate one.`);
      process.exit(1);
    }

    const src    = readFileSync(configPath, 'utf8');
    let issues   = 0;
    let warnings = 0;

    for (const chk of CONFIG_CHECKS) {
      if (chk.pattern.test(src)) {
        success(chk.label);
      } else if (chk.critical) {
        error(`MISSING (critical): ${chk.label}`);
        issues++;
      } else {
        warn(`Missing (optional): ${chk.label}`);
        warnings++;
      }
    }

    console.log();
    if (issues === 0) {
      if (warnings > 0) {
        console.log(chalk.bold.yellow(`✔ Config is valid with ${warnings} optional warning(s).`));
      } else {
        console.log(chalk.bold.green('✔ Config looks valid — all checks passed!'));
      }
    } else {
      console.log(chalk.bold.red(`✖ Found ${issues} critical issue(s). Fix before running migrations.`));
      process.exit(1);
    }
    console.log();
  });

// ─── entrypoint ──────────────────────────────────────────────────────────────

program.parse(process.argv);
