// Type declaration for Node.js require
declare const require: any;

// Mock pg - define mocks first
interface MockFunction<T = any> {
  calls: any[][];
  results: T[];
  mockReturnValue(value: T): void;
  mockResolvedValue(value: T): void;
  mockRejectedValue(value: any): void;
  mockReset(): void;
  (...args: any[]): T;
}

function createMockFunction<T = any>(): MockFunction<T> {
  const fn = (...args: any[]): T => {
    (fn as any).calls.push(args);
    if ((fn as any).results.length > 0) {
      const result = (fn as any).results.shift();
      if (result && typeof result === 'object' && result._isPromise) {
        if (result._isRejected) {
          return Promise.reject(result._value) as any;
        }
        return Promise.resolve(result._value) as any;
      }
      return result;
    }
    return undefined as any;
  };
  
  (fn as any).calls = [] as any[][];
  (fn as any).results = [] as T[];
  
  (fn as any).mockReturnValue = (value: T) => {
    (fn as any).results.push(value);
  };
  
  (fn as any).mockResolvedValue = (value: T) => {
    (fn as any).results.push({ _isPromise: true, _isRejected: false, _value: value } as any);
  };
  
  (fn as any).mockRejectedValue = (value: any) => {
    (fn as any).results.push({ _isPromise: true, _isRejected: true, _value: value } as any);
  };
  
  (fn as any).mockReset = () => {
    (fn as any).calls = [];
    (fn as any).results = [];
  };
  
  return fn as MockFunction<T>;
}

const mockClient = {
  connect: createMockFunction(),
  query: createMockFunction(),
  end: createMockFunction()
};

const mockPg = {
  Client: function() {
    return mockClient;
  }
};

// Setup mock BEFORE importing the provider to intercept pg require
const Module = require('module');
const originalRequire = Module.prototype.require;

Module.prototype.require = function(id: string) {
  if (id === 'pg') {
    return mockPg;
  }
  return originalRequire.apply(this, arguments);
};

import { describe, it, expect, beforeEach, afterEach } from '../lib.js';
import { 
  ProviderPostgres, 
  PostgreSQLConnectionConfig, 
  PostgreSQLError,
  PostgreSQLConnectionError,
  PostgreSQLQueryError,
  PostgreSQLInitializationError
} from '../../src/index.js';

// Store original console methods to restore later
const originalConsole = {
  log: console.log,
  error: console.error
};

const restoreConsole = () => {
  console.log = originalConsole.log;
  console.error = originalConsole.error;
};

const cleanupPgMock = () => {
  (mockClient.connect as any).mockReset();
  (mockClient.query as any).mockReset();
  (mockClient.end as any).mockReset();
};

// Helper functions for assertions
const expectToHaveBeenCalledWith = (mockFn: MockFunction, ...expectedArgs: any[]) => {
  const calls = (mockFn as any).calls;
  const found = calls.some((call: any[]) => {
    if (call.length !== expectedArgs.length) return false;
    return call.every((arg, index) => {
      const expected = expectedArgs[index];
      if (typeof expected === 'object' && expected !== null) {
        return JSON.stringify(arg) === JSON.stringify(expected);
      }
      return arg === expected;
    });
  });
  
  if (!found) {
    throw new Error(`Expected function to have been called with ${JSON.stringify(expectedArgs)}, but it was called with: ${JSON.stringify(calls)}`);
  }
};

const expectToHaveBeenCalled = (mockFn: MockFunction) => {
  const calls = (mockFn as any).calls;
  if (calls.length === 0) {
    throw new Error('Expected function to have been called, but it was not called');
  }
};

const expectNotToHaveBeenCalled = (mockFn: MockFunction) => {
  const calls = (mockFn as any).calls;
  if (calls.length > 0) {
    throw new Error(`Expected function not to have been called, but it was called ${calls.length} times`);
  }
};

// Mock console calls tracking
let consoleLogCalls: any[][] = [];
let consoleErrorCalls: any[][] = [];

const mockConsole = () => {
  consoleLogCalls = [];
  consoleErrorCalls = [];
  console.log = (...args: any[]) => { consoleLogCalls.push(args); };
  console.error = (...args: any[]) => { consoleErrorCalls.push(args); };
};

describe('ProviderPostgres', () => {
  let validConfig: PostgreSQLConnectionConfig = {
    host: 'localhost',
    port: 5432,
    user: 'testuser',
    password: 'testpass',
    database: 'testdb'
  };
  let provider: ProviderPostgres;

  beforeEach(() => {
    mockConsole();

    // Reset mocks
    (mockClient.connect as any).mockReset();
    (mockClient.query as any).mockReset();
    (mockClient.end as any).mockReset();
  });

  afterEach(() => {
    cleanupPgMock();
    restoreConsole();
  });

  describe('Constructor', () => {
    it('should create provider with valid configuration', () => {
      provider = new ProviderPostgres(validConfig);
      expect(provider).toBeDefined();
    });

    it('should throw PostgreSQLInitializationError with null configuration', () => {
      let error: any;
      try {
        provider = new ProviderPostgres(null as any);
      } catch (e) {
        error = e;
      }
      
      expect(error).toBeDefined();
      expect(error.name).toBe('PostgreSQLInitializationError');
      expect(error.message).toContain('Connection configuration is required');
    });

    it('should throw PostgreSQLInitializationError with undefined configuration', () => {
      let error: any;
      try {
        provider = new ProviderPostgres(undefined as any);
      } catch (e) {
        error = e;
      }
      
      expect(error).toBeDefined();
      expect(error.name).toBe('PostgreSQLInitializationError');
    });
  });

  describe('Error Classes', () => {
    it('should create PostgreSQLError with message and originalError', () => {
      const originalError = new Error('Original error');
      const error = new PostgreSQLError('Test error', originalError);
      
      expect(error.name).toBe('PostgreSQLError');
      expect(error.message).toBe('Test error');
      expect(error.originalError).toBe(originalError);
    });

    it('should create PostgreSQLConnectionError', () => {
      const error = new PostgreSQLConnectionError('Connection failed');
      
      expect(error.name).toBe('PostgreSQLConnectionError');
      expect(error.message).toBe('Connection failed');
      expect(error instanceof PostgreSQLError).toBeTruthy();
    });

    it('should create PostgreSQLQueryError with SQL', () => {
      const sql = 'SELECT * FROM users';
      const error = new PostgreSQLQueryError('Query failed', sql);
      
      expect(error.name).toBe('PostgreSQLQueryError');
      expect(error.message).toBe('Query failed');
      expect(error.sql).toBe(sql);
      expect(error instanceof PostgreSQLError).toBeTruthy();
    });

    it('should create PostgreSQLInitializationError', () => {
      const error = new PostgreSQLInitializationError('Init failed');
      
      expect(error.name).toBe('PostgreSQLInitializationError');
      expect(error.message).toBe('Init failed');
      expect(error instanceof PostgreSQLError).toBeTruthy();
    });
  });

  describe('init()', () => {
    beforeEach(() => {
      provider = new ProviderPostgres(validConfig);
    });

    it('should initialize connection successfully', async () => {
      (mockClient.connect as any).mockResolvedValue(undefined);
      
      await provider.init();
      
      expectToHaveBeenCalled(mockClient.connect);
    });

    it('should throw PostgreSQLConnectionError on connection failure', async () => {
      const connectionError = new Error('Connection refused');
      (mockClient.connect as any).mockRejectedValue(connectionError);
      
      let error: any;
      try {
        await provider.init();
      } catch (e) {
        error = e;
      }
      
      expect(error).toBeDefined();
      expect(error.name).toBe('PostgreSQLConnectionError');
      expect(error.message).toContain('Failed to initialize PostgreSQL connection');
      expect(error.originalError).toBe(connectionError);
    });
  });

  describe('query()', () => {
    beforeEach(async () => {
      provider = new ProviderPostgres(validConfig);
      (mockClient.connect as any).mockResolvedValue(undefined);
      await provider.init();
    });

    it('should throw error when connection not initialized', async () => {
      const uninitializedProvider = new ProviderPostgres(validConfig);
      
      let error: any;
      try {
        await uninitializedProvider.query('SELECT 1');
      } catch (e) {
        error = e;
      }
      
      expect(error).toBeDefined();
      expect(error.name).toBe('PostgreSQLConnectionError');
      expect(error.message).toContain('Database connection not initialized');
    });

    it('should execute SELECT query successfully', async () => {
      const mockRows = [{ id: 1, name: 'test' }];
      const mockFields = [
        { name: 'id', dataTypeID: 23 }, // integer
        { name: 'name', dataTypeID: 25 } // text
      ];
      
      (mockClient.query as any).mockResolvedValue({
        rows: mockRows,
        fields: mockFields,
        rowCount: 1
      });
      
      const result = await provider.query('SELECT * FROM users WHERE id = :id', { id: 1 });
      
      expectToHaveBeenCalledWith(mockClient.query, 'SELECT * FROM users WHERE id = $1', [1]);
      expect(result.success).toBeTruthy();
      expect(result.data).toEqual(mockRows);
      expect(result.fields).toBeDefined();
      expect(result.fields![0].name).toBe('id');
      expect(result.fields![0].type).toBe('integer');
      expect(result.fields![1].type).toBe('text');
    });

    it('should execute INSERT query successfully', async () => {
      (mockClient.query as any).mockResolvedValue({
        rows: [],
        fields: [],
        rowCount: 1
      });
      
      const result = await provider.query(
        'INSERT INTO users (name, email) VALUES (:name, :email)',
        { name: 'John', email: 'john@example.com' }
      );
      
      expectToHaveBeenCalledWith(
        mockClient.query,
        'INSERT INTO users (name, email) VALUES ($1, $2)',
        ['John', 'john@example.com']
      );
      expect(result.success).toBeTruthy();
      expect(result.data).toEqual([]);
      expect(result.affectedRows).toBe(1);
    });

    it('should handle queries without parameters', async () => {
      const mockRows = [{ count: 5 }];
      (mockClient.query as any).mockResolvedValue({
        rows: mockRows,
        fields: [],
        rowCount: 1
      });
      
      const result = await provider.query('SELECT COUNT(*) as count FROM users');
      
      expectToHaveBeenCalledWith(mockClient.query, 'SELECT COUNT(*) as count FROM users', []);
      expect(result.success).toBeTruthy();
      expect(result.data).toEqual(mockRows);
    });

    it('should throw error for missing parameter', async () => {
      let error: any;
      try {
        await provider.query('SELECT * FROM users WHERE id = :id AND name = :name', { id: 1 });
      } catch (e) {
        error = e;
      }
      
      expect(error).toBeDefined();
      expect(error.name).toBe('PostgreSQLQueryError');
      expect(error.message).toContain("Parameter 'name' not found in params object");
      expect(error.sql).toContain('SELECT * FROM users WHERE id = :id AND name = :name');
    });

    it('should handle query execution errors', async () => {
      const sqlError = new Error('Syntax error');
      (mockClient.query as any).mockRejectedValue(sqlError);
      
      let error: any;
      try {
        await provider.query('INVALID SQL', {});
      } catch (e) {
        error = e;
      }
      
      expect(error).toBeDefined();
      expect(error.name).toBe('PostgreSQLQueryError');
      expect(error.message).toContain('Query execution failed');
      expect(error.originalError).toBe(sqlError);
      expect(error.sql).toBe('INVALID SQL');
    });

    it('should re-throw PostgreSQLQueryError without wrapping', async () => {
      const originalError = new PostgreSQLQueryError('Original query error', 'SELECT 1');
      (mockClient.query as any).mockRejectedValue(originalError);
      
      let error: any;
      try {
        await provider.query('SELECT 1');
      } catch (e) {
        error = e;
      }
      
      expect(error).toBe(originalError);
      expect(error.name).toBe('PostgreSQLQueryError');
      expect(error.message).toBe('Original query error');
    });

    it('should handle complex parameter substitution', async () => {
      (mockClient.query as any).mockResolvedValue({
        rows: [],
        fields: [],
        rowCount: 1
      });
      
      await provider.query(
        'UPDATE users SET name = :name, updated_at = :timestamp WHERE id = :id AND status = :status',
        { 
          name: 'John Doe', 
          timestamp: new Date('2023-01-01'), 
          id: 123, 
          status: 'active' 
        }
      );
      
      expectToHaveBeenCalledWith(
        mockClient.query,
        'UPDATE users SET name = $1, updated_at = $2 WHERE id = $3 AND status = $4',
        ['John Doe', new Date('2023-01-01'), 123, 'active']
      );
    });
  });

  describe('health()', () => {
    beforeEach(() => {
      provider = new ProviderPostgres(validConfig);
    });

    it('should return false when connection not initialized', async () => {
      const health = await provider.health();
      expect(health).toBeFalsy();
    });

    it('should return true when connection is healthy', async () => {
      (mockClient.connect as any).mockResolvedValue(undefined);
      (mockClient.query as any).mockResolvedValue({ rows: [], fields: [] });
      
      await provider.init();
      const health = await provider.health();
      
      expect(health).toBeTruthy();
      expectToHaveBeenCalledWith(mockClient.query, 'SELECT 1');
    });

    it('should return false and update connection state when health check fails', async () => {
      (mockClient.connect as any).mockResolvedValue(undefined);
      await provider.init();
      
      // Simulate health check failure
      (mockClient.query as any).mockRejectedValue(new Error('Connection lost'));
      
      const health = await provider.health();
      
      expect(health).toBeFalsy();
      expectToHaveBeenCalledWith(mockClient.query, 'SELECT 1');
    });
  });

  describe('shutdown()', () => {
    beforeEach(() => {
      provider = new ProviderPostgres(validConfig);
    });

    it('should do nothing when connection not established', async () => {
      await provider.shutdown();
      expectNotToHaveBeenCalled(mockClient.end);
    });

    it('should close connection successfully', async () => {
      (mockClient.connect as any).mockResolvedValue(undefined);
      (mockClient.end as any).mockResolvedValue(undefined);
      
      await provider.init();
      await provider.shutdown();
      
      expectToHaveBeenCalled(mockClient.end);
    });

    it('should throw PostgreSQLConnectionError on shutdown failure', async () => {
      (mockClient.connect as any).mockResolvedValue(undefined);
      const shutdownError = new Error('Connection close failed');
      (mockClient.end as any).mockRejectedValue(shutdownError);
      
      await provider.init();
      
      let error: any;
      try {
        await provider.shutdown();
      } catch (e) {
        error = e;
      }
      
      expect(error).toBeDefined();
      expect(error.name).toBe('PostgreSQLConnectionError');
      expect(error.message).toContain('Failed to shutdown PostgreSQL connection');
      expect(error.originalError).toBe(shutdownError);
    });
  });
});
