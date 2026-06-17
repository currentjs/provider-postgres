import { Client, ClientConfig, QueryResult as PgQueryResult } from 'pg';
import { IProvider, ISqlProvider, SQLResult, SqlParam } from '@currentjs/provider';

/**
 * PostgreSQL connection configuration
 */
export interface PostgreSQLConnectionConfig extends ClientConfig {
  host: string;
  port?: number;
  user: string;
  password: string;
  database: string;
}

/**
 * Base PostgreSQL error class
 */
export class PostgreSQLError extends Error {
  constructor(message: string, public readonly originalError?: any) {
    super(message);
    this.name = 'PostgreSQLError';
  }
}

/**
 * Error thrown when connection initialization fails
 */
export class PostgreSQLConnectionError extends PostgreSQLError {
  constructor(message: string, originalError?: any) {
    super(message, originalError);
    this.name = 'PostgreSQLConnectionError';
  }
}

/**
 * Error thrown when query execution fails
 */
export class PostgreSQLQueryError extends PostgreSQLError {
  constructor(message: string, public readonly sql?: string, originalError?: any) {
    super(message, originalError);
    this.name = 'PostgreSQLQueryError';
  }
}

/**
 * Error thrown during provider initialization
 */
export class PostgreSQLInitializationError extends PostgreSQLError {
  constructor(message: string, originalError?: any) {
    super(message, originalError);
    this.name = 'PostgreSQLInitializationError';
  }
}

/**
 * PostgreSQL Provider class for database operations
 */
export class ProviderPostgres implements ISqlProvider {
  private client: Client | null = null;
  private connectionConfig: PostgreSQLConnectionConfig;
  private isConnected: boolean = false;

  /**
   * Constructor that takes a connection object
   * @param connectionConfig PostgreSQL connection configuration
   */
  constructor(connectionConfig: PostgreSQLConnectionConfig) {
    if (!connectionConfig) {
      throw new PostgreSQLInitializationError('Connection configuration is required');
    }
    this.connectionConfig = connectionConfig;
  }

  /**
   * Initialize the PostgreSQL connection
   */
  async init(): Promise<void> {
    try {
      this.client = new Client(this.connectionConfig);
      await this.client.connect();
      this.isConnected = true;
      
      console.log('PostgreSQL connection established successfully');
    } catch (error) {
      this.isConnected = false;
      this.client = null;
      throw new PostgreSQLConnectionError(`Failed to initialize PostgreSQL connection: ${error}`, error);
    }
  }

  /**
   * Execute a SQL query with parameters
   * @param sql SQL query string
   * @param params Parameters for the query
   * @returns Promise with query results
   */
  async query<TData = any>(sql: string, params: Record<string, SqlParam> = {}): Promise<SQLResult<TData>> {
    if (!this.client) {
      throw new PostgreSQLConnectionError('Database connection not initialized. Call init() first.');
    }

    try {
      // Convert named parameters to positional parameters
      let processedSql = sql;
      const paramValues: SqlParam[] = [];
      let paramIndex = 1;
      
      // Replace named parameters (:paramName) with positional parameters ($1, $2, etc.)
      processedSql = sql.replace(/:(\w+)/g, (match, paramName) => {
        if (params.hasOwnProperty(paramName)) {
          paramValues.push(params[paramName]);
          return `$${paramIndex++}`;
        }
        throw new PostgreSQLQueryError(`Parameter '${paramName}' not found in params object`, sql);
      });

      const result: PgQueryResult = await this.client.query(processedSql, paramValues);
      
      // Extract field information from result
      const fields = result.fields || [];
      
      // Handle different types of query results
      if (result.rows && result.rows.length > 0) {
        // For SELECT operations with data
        return {
          data: result.rows as TData[],
          success: true,
          fields: fields.map((field: any) => ({
            name: field.name || '',
            type: field.dataTypeID ? this.mapPostgresTypeToString(field.dataTypeID) : 'unknown',
            nullable: true // PostgreSQL doesn't provide this info easily via pg library
          })),
          affectedRows: result.rowCount || undefined
        };
      } else {
        // For INSERT, UPDATE, DELETE operations or SELECT with no results
        return {
          data: [],
          success: true,
          fields: fields.map((field: any) => ({
            name: field.name || '',
            type: field.dataTypeID ? this.mapPostgresTypeToString(field.dataTypeID) : 'unknown',
            nullable: true
          })),
          affectedRows: result.rowCount || undefined
        };
      }
    } catch (error) {
      if (error instanceof PostgreSQLQueryError) {
        throw error;
      }
      throw new PostgreSQLQueryError(`Query execution failed: ${error}`, sql, error);
    }
  }

  /**
   * Map PostgreSQL data type IDs to string representations
   * @param dataTypeID PostgreSQL data type ID
   * @returns String representation of the data type
   */
  private mapPostgresTypeToString(dataTypeID: number): string {
    // Common PostgreSQL data type IDs
    const typeMap: Record<number, string> = {
      16: 'boolean',
      17: 'bytea',
      18: 'char',
      19: 'name',
      20: 'bigint',
      21: 'smallint',
      23: 'integer',
      25: 'text',
      26: 'oid',
      700: 'real',
      701: 'double precision',
      1043: 'varchar',
      1082: 'date',
      1083: 'time',
      1114: 'timestamp',
      1184: 'timestamptz',
      1700: 'numeric'
    };
    
    return typeMap[dataTypeID] || 'unknown';
  }

  /**
   * Check the health of the database connection by executing a simple query
   * @returns true if connection is healthy, false otherwise
   */
  async health(): Promise<boolean> {
    if (!this.isConnected || !this.client) {
      return false;
    }

    try {
      // Execute a simple query to test the connection
      await this.client.query('SELECT 1');
      return true;
    } catch (error) {
      // Connection is not healthy if query fails
      this.isConnected = false;
      return false;
    }
  }

  /**
   * Close the database connection
   */
  async shutdown(): Promise<void> {
    if (this.client) {
      try {
        await this.client.end();
        this.client = null;
        this.isConnected = false;
        console.log('PostgreSQL connection closed successfully');
      } catch (error) {
        console.error('Error closing PostgreSQL connection:', error);
        throw new PostgreSQLConnectionError(`Failed to shutdown PostgreSQL connection: ${error}`, error);
      }
    }
  }
}
