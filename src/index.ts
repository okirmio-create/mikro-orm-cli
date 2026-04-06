import { Command } from 'commander';
import chalk from 'chalk';
import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve, join } from 'path';

const program = new Command();

program
  .name('mikro-orm-cli')
  .description(chalk.cyan('MikroORM CLI — generate configs, entities, migrations, seeders, and more'))
  .version('1.0.0');

// ─── helpers ──────────────────────────────────────────────────────────────────

function success(msg: string): void {
  console.log(chalk.green('✔'), chalk.white(msg));
}

function info(msg: string): void {
  console.log(chalk.blue('ℹ'), chalk.gray(msg));
}

function warn(msg: string): void {
  console.log(chalk.yellow('⚠'), chalk.yellow(msg));
}

function err(msg: string): void {
  console.error(chalk.red('✖'), chalk.red(msg));
}

function header(title: string): void {
  console.log();
  console.log(chalk.bold.cyan(`── ${title} ──────────────────────────────────`));
  console.log();
}

function writeFileSafe(filePath: string, content: string, label: string): void {
  if (existsSync(filePath)) {
    warn(`${label} already exists at ${chalk.underline(filePath)} — skipping`);
    return;
  }
  writeFileSync(filePath, content, 'utf8');
  success(`Created ${label}: ${chalk.underline(filePath)}`);
}

function ensureDir(dir: string): void {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
    success(`Created directory: ${chalk.underline(dir)}`);
  }
}

function pascalToSnake(name: string): string {
  return name.replace(/([A-Z])/g, (m, l, i) => (i ? '_' : '') + l.toLowerCase());
}

// ─── init ─────────────────────────────────────────────────────────────────────

interface DriverInfo {
  pkg: string;
  driverClass: string;
  defaultPort: number | null;
}

const DRIVER_MAP: Record<string, DriverInfo> = {
  postgresql: { pkg: '@mikro-orm/postgresql', driverClass: 'PostgreSqlDriver', defaultPort: 5432  },
  mysql:      { pkg: '@mikro-orm/mysql',      driverClass: 'MySqlDriver',      defaultPort: 3306  },
  sqlite:     { pkg: '@mikro-orm/sqlite',     driverClass: 'SqliteDriver',     defaultPort: null  },
  mongodb:    { pkg: '@mikro-orm/mongodb',    driverClass: 'MongoDriver',      defaultPort: 27017 },
  mariadb:    { pkg: '@mikro-orm/mariadb',    driverClass: 'MariaDbDriver',    defaultPort: 3306  },
};

program
  .command('init <driver>')
  .description('Generate mikro-orm.config.ts (drivers: postgresql, mysql, sqlite, mongodb, mariadb)')
  .option('-d, --db-name <name>', 'Database name', 'myapp')
  .option('-H, --host <host>',   'Database host', 'localhost')
  .option('-o, --out <file>',    'Output file path', 'mikro-orm.config.ts')
  .action((driver: string, opts: { dbName: string; host: string; out: string }) => {
    header('mikro-orm init');

    const supported = Object.keys(DRIVER_MAP);
    if (!supported.includes(driver)) {
      err(`Unsupported driver "${driver}". Supported: ${supported.join(', ')}`);
      process.exit(1);
    }

    const d = DRIVER_MAP[driver];
    info(`Driver  : ${chalk.cyan(driver)} → ${d.driverClass}`);
    info(`Package : ${chalk.cyan(d.pkg)}`);
    info(`DB name : ${chalk.cyan(opts.dbName)}`);
    if (driver !== 'sqlite') info(`Host    : ${chalk.cyan(opts.host)}`);
    console.log();

    const isSqlite = driver === 'sqlite';
    const portLine = d.defaultPort != null ? `  port: ${d.defaultPort},` : '';
    const hostLine = !isSqlite ? `  host: '${opts.host}',` : '';
    const dbLine   = isSqlite ? `  dbName: '${opts.dbName}.sqlite',` : `  dbName: '${opts.dbName}',`;

    const content = [
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
    ].join('\n');

    const outPath = resolve(process.cwd(), opts.out);
    writeFileSafe(outPath, content, 'MikroORM config');

    console.log();
    info(`Install driver:  ${chalk.bold(`npm i ${d.pkg} @mikro-orm/core`)}`);
    info(`Run migrations:  ${chalk.bold('npx mikro-orm migration:up')}`);
    console.log();
  });

// ─── entity ───────────────────────────────────────────────────────────────────

program
  .command('entity <name>')
  .description('Generate entity class with @Entity, @Property, @PrimaryKey decorators')
  .option('-t, --table-name <table>', 'Override table name (default: snake_case of name)', '')
  .option('-s, --soft-delete',        'Add deletedAt soft-delete field', false)
  .option('-o, --out-dir <dir>',      'Output directory', 'src/entities')
  .action((name: string, opts: { tableName: string; softDelete: boolean; outDir: string }) => {
    header('mikro-orm entity');

    if (!/^[A-Z][A-Za-z0-9]+$/.test(name)) {
      err('Entity name must be PascalCase (e.g. UserProfile)');
      process.exit(1);
    }

    const table = opts.tableName || pascalToSnake(name);
    info(`Entity    : ${chalk.cyan(name)}`);
    info(`Table     : ${chalk.cyan(table)}`);
    info(`Soft del  : ${opts.softDelete ? chalk.green('yes') : chalk.gray('no')}`);
    console.log();

    const softField = opts.softDelete
      ? `\n  @Property({ nullable: true })\n  deletedAt?: Date;\n`
      : '';

    const content = [
      `import { Entity, PrimaryKey, Property } from '@mikro-orm/core';`,
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

    const outDir  = resolve(process.cwd(), opts.outDir);
    const outFile = join(outDir, `${name}.entity.ts`);
    ensureDir(outDir);
    writeFileSafe(outFile, content, `${name} entity`);
    console.log();
  });

// ─── migration ────────────────────────────────────────────────────────────────

program
  .command('migration <name>')
  .description('Generate migration template with up/down methods')
  .option('-o, --out-dir <dir>', 'Output directory', 'src/migrations')
  .action((name: string, opts: { outDir: string }) => {
    header('mikro-orm migration');

    const ts        = Date.now();
    const slug      = name.replace(/\s+/g, '_').replace(/[^A-Za-z0-9_]/g, '');
    const className = `Migration${ts}_${slug}`;
    const fileName  = `${className}.ts`;

    info(`Name    : ${chalk.cyan(name)}`);
    info(`Class   : ${chalk.cyan(className)}`);
    console.log();

    const content = [
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

    const outDir  = resolve(process.cwd(), opts.outDir);
    const outFile = join(outDir, fileName);
    ensureDir(outDir);
    writeFileSafe(outFile, content, 'migration file');

    console.log();
    info(`Run migrations:  ${chalk.bold('npx mikro-orm migration:up')}`);
    console.log();
  });

// ─── seeder ───────────────────────────────────────────────────────────────────

program
  .command('seeder <name>')
  .description('Generate database seeder class')
  .option('-o, --out-dir <dir>', 'Output directory', 'src/seeders')
  .action((name: string, opts: { outDir: string }) => {
    header('mikro-orm seeder');

    if (!/^[A-Z][A-Za-z0-9]+$/.test(name)) {
      err('Seeder name must be PascalCase (e.g. UserSeeder)');
      process.exit(1);
    }

    info(`Seeder  : ${chalk.cyan(name)}`);
    console.log();

    const content = [
      `import type { EntityManager } from '@mikro-orm/core';`,
      `import { Seeder } from '@mikro-orm/seeder';`,
      ``,
      `export class ${name} extends Seeder {`,
      ``,
      `  async run(em: EntityManager): Promise<void> {`,
      `    // TODO: seed your database`,
      `    // em.create(User, { name: 'Alice', email: 'alice@example.com' });`,
      `  }`,
      `}`,
      ``,
    ].join('\n');

    const outDir  = resolve(process.cwd(), opts.outDir);
    const outFile = join(outDir, `${name}.ts`);
    ensureDir(outDir);
    writeFileSafe(outFile, content, `${name} seeder`);
    console.log();
  });

// ─── embeddable ───────────────────────────────────────────────────────────────

program
  .command('embeddable <name>')
  .description('Generate @Embeddable class for embedded value objects')
  .option('-o, --out-dir <dir>', 'Output directory', 'src/embeddables')
  .action((name: string, opts: { outDir: string }) => {
    header('mikro-orm embeddable');

    if (!/^[A-Z][A-Za-z0-9]+$/.test(name)) {
      err('Embeddable name must be PascalCase (e.g. Address)');
      process.exit(1);
    }

    info(`Embeddable  : ${chalk.cyan(name)}`);
    console.log();

    const content = [
      `import { Embeddable, Property } from '@mikro-orm/core';`,
      ``,
      `@Embeddable()`,
      `export class ${name} {`,
      ``,
      `  @Property()`,
      `  // TODO: add properties`,
      `  value!: string;`,
      ``,
      `  constructor(value: string) {`,
      `    this.value = value;`,
      `  }`,
      `}`,
      ``,
    ].join('\n');

    const outDir  = resolve(process.cwd(), opts.outDir);
    const outFile = join(outDir, `${name}.embeddable.ts`);
    ensureDir(outDir);
    writeFileSafe(outFile, content, `${name} embeddable`);
    console.log();
  });

// ─── subscriber ───────────────────────────────────────────────────────────────

program
  .command('subscriber <name>')
  .description('Generate event subscriber for entity lifecycle hooks')
  .option('-e, --entity <entity>', 'Entity class name the subscriber targets', '')
  .option('-o, --out-dir <dir>',   'Output directory', 'src/subscribers')
  .action((name: string, opts: { entity: string; outDir: string }) => {
    header('mikro-orm subscriber');

    if (!/^[A-Z][A-Za-z0-9]+$/.test(name)) {
      err('Subscriber name must be PascalCase (e.g. UserSubscriber)');
      process.exit(1);
    }

    const entityName = opts.entity || name.replace(/Subscriber$/, '');
    info(`Subscriber : ${chalk.cyan(name)}`);
    info(`Entity     : ${chalk.cyan(entityName)}`);
    console.log();

    const content = [
      `import type { EventArgs, EventSubscriber } from '@mikro-orm/core';`,
      `import { Subscriber } from '@mikro-orm/core';`,
      `// import { ${entityName} } from '../entities/${entityName}.entity';`,
      ``,
      `@Subscriber()`,
      `export class ${name} implements EventSubscriber {`,
      ``,
      `  async beforeCreate(args: EventArgs<unknown>): Promise<void> {`,
      `    // Called before a new entity is persisted`,
      `  }`,
      ``,
      `  async afterCreate(args: EventArgs<unknown>): Promise<void> {`,
      `    // Called after a new entity is persisted`,
      `  }`,
      ``,
      `  async beforeUpdate(args: EventArgs<unknown>): Promise<void> {`,
      `    // Called before an entity is updated`,
      `  }`,
      ``,
      `  async afterUpdate(args: EventArgs<unknown>): Promise<void> {`,
      `    // Called after an entity is updated`,
      `  }`,
      ``,
      `  async beforeDelete(args: EventArgs<unknown>): Promise<void> {`,
      `    // Called before an entity is deleted`,
      `  }`,
      ``,
      `  async afterDelete(args: EventArgs<unknown>): Promise<void> {`,
      `    // Called after an entity is deleted`,
      `  }`,
      `}`,
      ``,
    ].join('\n');

    const outDir  = resolve(process.cwd(), opts.outDir);
    const outFile = join(outDir, `${name}.ts`);
    ensureDir(outDir);
    writeFileSafe(outFile, content, `${name} subscriber`);
    console.log();
  });

// ─── entrypoint ───────────────────────────────────────────────────────────────

program.parse(process.argv);
