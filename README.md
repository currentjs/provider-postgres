# @currentjs/provider-postgres

> *"Because sometimes your data wants ACID compliance, JSON columns, and an existential crisis about whether NULL means 'empty' or 'unknown'."*

A PostgreSQL database provider that speaks fluent TypeScript and makes your generated code feel right at home with the world's most advanced open source database. Part of the `currentjs` framework ecosystem, but perfectly capable of standing on its own.

## What Is This Thing?

This is a database provider that bridges the gap between your TypeScript applications and PostgreSQL. Think of it as a translator who's fluent in both "modern web development" and "I support transactional DDL and you should be grateful."

**Key Philosophy**: Named parameters are better than positional `$1` placeholders, proper error handling beats mysterious crashes, and connection health checks should be a one-liner.

## Installation

**Using `@currentjs/gen` (Code Generator)** - *Recommended*
```bash
# No manual installation needed
# The provider is automatically included when you generate a project with PostgreSQL
currentjs init
# Choose PostgreSQL in app.yaml
```
(for more details see the [documentation](https://github.com/currentjs/gen))

**Manual Installation** - *For standalone use*
```bash
npm install @currentjs/provider-postgres
```

> **Pro Tip**: If you're using the `currentjs` code generator, this provider is automatically configured and ready to go. The generated stores use it seamlessly, so you can focus on your business logic instead of connection strings.

## Quick Start

```typescript
import { ProviderPostgres } from '@currentjs/provider-postgres';

// Configure your connection (probably from environment variables)
const provider = new ProviderPostgres({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'myapp'
});

// Initialize the connection
await provider.init();

// Query with named parameters (no more counting $1, $2, $3...)
const users = await provider.query(
  'SELECT * FROM users WHERE status = :status AND age > :minAge',
  { status: 'active', minAge: 18 }
);

console.log(`Found ${users.data.length} active adult users`);

// Check if everything is still working
const isHealthy = await provider.health();
console.log(isHealthy ? 'Database is healthy' : 'Database needs attention');

// Clean shutdown when you're done
await provider.shutdown();
```

## In Generated Applications (Where It Really Shines)

When you use `@currentjs/gen` to create an application, this provider is automatically wired up in your generated stores:

```typescript
// Generated in src/modules/Blog/infrastructure/stores/PostStore.ts
import { ProviderPostgres } from '@currentjs/provider-postgres';

export class PostStoreImpl implements IPostStore {
  constructor(private provider: ProviderPostgres) {}

  async findById(id: number): Promise<Post | null> {
    const result = await this.provider.query(
      'SELECT * FROM posts WHERE id = :id',
      { id }
    );
    
    return result.data.length > 0 ? this.mapToEntity(result.data[0]) : null;
  }

  async create(post: CreatePostDto): Promise<Post> {
    const result = await this.provider.query(
      'INSERT INTO posts (title, content, author_id) VALUES (:title, :content, :authorId) RETURNING id',
      { 
        title: post.title, 
        content: post.content, 
        authorId: post.authorId 
      }
    );

    return this.findById(result.data[0].id);
  }
}
```

**No configuration needed** - the generated application sets everything up automatically based on your environment variables.

## Query Results (What You Get Back)

The provider returns results in a standardized format that plays nicely with TypeScript:

```typescript
// For SELECT queries
const result = await provider.query('SELECT * FROM users WHERE role = :role', { role: 'admin' });
console.log(result.data);         // Array of user objects
console.log(result.success);      // true if query succeeded
console.log(result.fields);       // Field metadata (name, type, nullable)

// For INSERT/UPDATE/DELETE queries
const updateResult = await provider.query(
  'UPDATE users SET status = :status WHERE id = :id',
  { status: 'active', id: 123 }
);
console.log(updateResult.affectedRows); // How many rows were changed
console.log(updateResult.success);      // true if query succeeded
```

## Named Parameters (Because Life's Too Short for Positional Placeholders)

Say goodbye to this:
```sql
-- Raw pg style (counting parameters is not a hobby)
SELECT * FROM users WHERE status = $1 AND age > $2 AND city = $3
```

And hello to this:
```typescript
// CurrentJS provider style
await provider.query(
  'SELECT * FROM users WHERE status = :status AND age > :minAge AND city = :city',
  { status: 'active', minAge: 25, city: 'San Francisco' }
);
```

**How it works**: The provider automatically converts `:paramName` to `$1`, `$2`, etc. under the hood, maintaining compatibility with the `pg` library while giving you readable queries.

## Error Handling (Because Things Go Wrong)

The provider includes specific error classes so you know exactly what went sideways:

```typescript
import { 
  ProviderPostgres,
  PostgreSQLConnectionError,
  PostgreSQLQueryError,
  PostgreSQLInitializationError
} from '@currentjs/provider-postgres';

try {
  const provider = new ProviderPostgres(config);
  await provider.init();
  
  const result = await provider.query(
    'SELECT * FROM users WHERE email = :email', 
    { email: 'john@example.com' }
  );
  
} catch (error) {
  if (error instanceof PostgreSQLConnectionError) {
    console.error('Connection failed:', error.message);
    // Maybe retry connection or switch to a replica
    
  } else if (error instanceof PostgreSQLQueryError) {
    console.error('Query failed:', error.message);
    console.error('SQL was:', error.sql);
    // Log the problematic query for debugging
    
  } else if (error instanceof PostgreSQLInitializationError) {
    console.error('Configuration problem:', error.message);
    // Check your environment variables
  }
}
```

## Health Monitoring

The built-in health check is perfect for monitoring dashboards and load balancers:

```typescript
// Simple health check
const isHealthy = await provider.health();

// In a monitoring endpoint
app.get('/health', async (req, res) => {
  const dbHealthy = await provider.health();
  
  res.status(dbHealthy ? 200 : 503).json({
    status: dbHealthy ? 'healthy' : 'unhealthy',
    database: dbHealthy ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString()
  });
});
```

## Configuration Options

```typescript
import { ProviderPostgres } from '@currentjs/provider-postgres';

const provider = new ProviderPostgres({
  host: 'localhost',              // Database host
  port: 5432,                     // Port (default: 5432)
  user: 'myuser',                 // Username
  password: 'mypassword',         // Password (keep this secret!)
  database: 'myapp',              // Database name
  
  // Advanced pg ClientConfig options also supported:
  connectionTimeoutMillis: 30000, // Connection timeout
  statement_timeout: 60000,       // Statement timeout
  ssl: true,                      // SSL connection
  // ... any other pg ClientConfig options
});
```

## TypeScript Support (First-Class Citizen)

Full TypeScript support with proper generic types:

```typescript
interface User {
  id: number;
  email: string;
  name: string;
  created_at: Date;
}

// Type-safe query results
const result = await provider.query<User>(
  'SELECT id, email, name, created_at FROM users WHERE id = :id',
  { id: 123 }
);

// result.data is User[] with full type checking
const user = result.data[0]; // TypeScript knows this is User | undefined
if (user) {
  console.log(user.email);   // Type-safe property access
  console.log(user.invalid); // TypeScript error - property doesn't exist
}
```

## Environment Variables

For generated applications, these environment variables are automatically read:

```bash
# Database connection
DB_HOST=localhost
DB_PORT=5432
DB_USER=myuser
DB_PASSWORD=supersecret
DB_NAME=myapp_production

# Optional advanced settings
DB_SSL=true
DB_CONNECTION_TIMEOUT=30000
DB_STATEMENT_TIMEOUT=60000
```

## Part of a Bigger Picture

This provider is designed as the data layer for the `currentjs` code generation framework. But it's also perfectly usable as a standalone PostgreSQL client in any TypeScript application.

## Authorship & Contribution

Vibecoded with `claude-4-sonnet` (mostly) by Konstantin Zavalny.

Any contributions such as bugfixes, improvements, etc are very welcome.

## License

GNU Lesser General Public License (LGPL)

It simply means, that you:
- can create a proprietary application that uses this library without having to open source their entire application code (this is the "lesser" aspect of LGPL compared to GPL).
- can make any modifications, but must distribute those modifications under the LGPL (or a compatible license) and include the original copyright and license notice.
