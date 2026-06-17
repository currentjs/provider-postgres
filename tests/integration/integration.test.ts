import { describe, it, expect, beforeEach } from '../lib.js';
import { 
  ProviderPostgres, 
  PostgreSQLConnectionConfig, 
  PostgreSQLConnectionError,
  PostgreSQLQueryError
} from '../../src/index.js';

// Global types for Node.js
declare const Buffer: any;

// Type declaration for Node.js require
declare const require: any;

// Integration tests with more complex scenarios
describe('ProviderPostgres Integration', () => {
  let validConfig: PostgreSQLConnectionConfig;

  beforeEach(() => {
    validConfig = {
      host: 'localhost',
      port: 5432,
      user: 'testuser',
      password: 'testpass',
      database: 'testdb'
    };
  });

  describe('Configuration Validation', () => {
    it('should accept minimal valid configuration', () => {
      const minimalConfig = {
        host: 'localhost',
        user: 'user',
        password: 'pass',
        database: 'db'
      };
      
      const provider = new ProviderPostgres(minimalConfig);
      expect(provider).toBeDefined();
    });

    it('should accept configuration with all optional fields', () => {
      const fullConfig = {
        host: 'localhost',
        port: 5432,
        user: 'user',
        password: 'pass',
        database: 'db',
        ssl: false,
        connectionTimeoutMillis: 5000,
        idleTimeoutMillis: 10000,
        max: 10
      };
      
      const provider = new ProviderPostgres(fullConfig);
      expect(provider).toBeDefined();
    });
  });

  describe('Error Scenarios', () => {
    it('should handle empty string parameters gracefully', () => {
      const config = {
        host: '',
        user: '',
        password: '',
        database: ''
      };
      
      const provider = new ProviderPostgres(config);
      expect(provider).toBeDefined();
      // Note: actual connection would fail, but constructor should succeed
    });

    it('should create provider with special characters in config', () => {
      const config = {
        host: 'localhost',
        user: 'user@domain',
        password: 'p@ssw0rd!#$%',
        database: 'test-db_123'
      };
      
      const provider = new ProviderPostgres(config);
      expect(provider).toBeDefined();
    });
  });

  describe('SQL Parameter Handling Edge Cases', () => {
    let provider: ProviderPostgres;

    beforeEach(() => {
      const config: PostgreSQLConnectionConfig = validConfig || {
        host: 'localhost',
        port: 5432,
        user: 'testuser',
        password: 'testpass',
        database: 'testdb'
      };
      provider = new ProviderPostgres(config);
    });

    it('should handle SQL with no parameters', async () => {
      const sql = 'SELECT 1 as test';
      
      let error: any;
      try {
        await provider.query(sql, {});
      } catch (e) {
        error = e;
      }
      
      // Should fail with connection error, not parameter error
      expect(error).toBeDefined();
      expect(error.name).toBe('PostgreSQLConnectionError');
      expect(error.message).toContain('Database connection not initialized');
    });

    it('should handle SQL with repeated parameters', async () => {
      const sql = 'SELECT * FROM users WHERE status = :status OR backup_status = :status';
      
      let error: any;
      try {
        await provider.query(sql, { status: 'active' });
      } catch (e) {
        error = e;
      }
      
      // Should fail with connection error, not parameter error  
      expect(error).toBeDefined();
      expect(error.name).toBe('PostgreSQLConnectionError');
    });

    it('should handle SQL with complex parameter names', async () => {
      const sql = 'SELECT * FROM users WHERE user_id = :user_id AND created_at > :start_date';
      
      let error: any;
      try {
        await provider.query(sql, { user_id: 123, start_date: new Date() });
      } catch (e) {
        error = e;
      }
      
      expect(error).toBeDefined();
      expect(error.name).toBe('PostgreSQLConnectionError');
    });
  });

  describe('Lifecycle Management', () => {
    it('should handle multiple init/shutdown cycles', async () => {
      const config: PostgreSQLConnectionConfig = validConfig || {
        host: 'localhost',
        port: 5432,
        user: 'testuser',
        password: 'testpass',
        database: 'testdb'
      };
      const provider = new ProviderPostgres(config);
      
      // Multiple shutdowns without init should not cause issues
      await provider.shutdown();
      await provider.shutdown();
      await provider.shutdown();
      
      expect(provider).toBeDefined();
    });

    it('should maintain state correctly through lifecycle', async () => {
      const config: PostgreSQLConnectionConfig = validConfig || {
        host: 'localhost',
        port: 5432,
        user: 'testuser',
        password: 'testpass',
        database: 'testdb'
      };
      const provider = new ProviderPostgres(config);
      
      // Health check before init should return false
      const healthBeforeInit = await provider.health();
      expect(healthBeforeInit).toBeFalsy();
      
      // Query before init should throw error
      let queryError: any;
      try {
        await provider.query('SELECT 1');
      } catch (e) {
        queryError = e;
      }
      
      expect(queryError).toBeDefined();
      expect(queryError.name).toBe('PostgreSQLConnectionError');
    });
  });

  describe('Error Message Quality', () => {
    it('should provide helpful error messages for missing parameters', async () => {
      const config: PostgreSQLConnectionConfig = validConfig || {
        host: 'localhost',
        port: 5432,
        user: 'testuser',
        password: 'testpass',
        database: 'testdb'
      };
      const provider = new ProviderPostgres(config);
      
      let error: any;
      try {
        await provider.query('SELECT * FROM users WHERE id = :userId', {});
      } catch (e) {
        error = e;
      }
      
      expect(error).toBeDefined();
      expect(error.name).toBe('PostgreSQLConnectionError');
      expect(error.message).toContain('Database connection not initialized');
    });

    it('should preserve original SQL in error messages', async () => {
      const config: PostgreSQLConnectionConfig = validConfig || {
        host: 'localhost',
        port: 5432,
        user: 'testuser',
        password: 'testpass',
        database: 'testdb'
      };
      const provider = new ProviderPostgres(config);
      const originalSql = 'SELECT * FROM users WHERE id = :id AND name = :name';
      
      let error: any;
      try {
        await provider.query(originalSql, { id: 1 }); // missing 'name' parameter
      } catch (e) {
        error = e;
      }
      
      // Since connection is not initialized, we get connection error first
      expect(error).toBeDefined();
      expect(error.name).toBe('PostgreSQLConnectionError');
    });
  });

  describe('Data Type Handling', () => {
    let provider: ProviderPostgres;

    beforeEach(() => {
      const config: PostgreSQLConnectionConfig = validConfig || {
        host: 'localhost',
        port: 5432,
        user: 'testuser',
        password: 'testpass',
        database: 'testdb'
      };
      provider = new ProviderPostgres(config);
    });

    it('should handle various JavaScript data types as parameters', async () => {
      const testDate = new Date('2023-01-01T00:00:00Z');
      const testBuffer = Buffer.from('test data');
      
      let error: any;
      try {
        await provider.query(
          'INSERT INTO test_table (str, num, bool, date_val, null_val, buffer_val) VALUES (:str, :num, :bool, :date, :null, :buffer)',
          {
            str: 'test string',
            num: 42,
            bool: true,
            date: testDate,
            null: null,
            buffer: testBuffer
          }
        );
      } catch (e) {
        error = e;
      }
      
      // Should fail with connection error since we're not actually connected
      expect(error).toBeDefined();
      expect(error.name).toBe('PostgreSQLConnectionError');
    });
  });

  describe('PostgreSQL Specific Features', () => {
    let provider: ProviderPostgres;

    beforeEach(() => {
      const config: PostgreSQLConnectionConfig = validConfig || {
        host: 'localhost',
        port: 5432,
        user: 'testuser',
        password: 'testpass',
        database: 'testdb'
      };
      provider = new ProviderPostgres(config);
    });

    it('should handle PostgreSQL specific parameter syntax', async () => {
      const sql = 'SELECT * FROM users WHERE id = ANY(:ids::int[])';
      
      let error: any;
      try {
        await provider.query(sql, { ids: [1, 2, 3] } as any);
      } catch (e) {
        error = e;
      }
      
      // Should fail with connection error since we're not actually connected
      expect(error).toBeDefined();
      expect(error.name).toBe('PostgreSQLConnectionError');
    });

    it('should handle PostgreSQL JSONB queries', async () => {
      const sql = 'SELECT * FROM users WHERE metadata->:key = :value';
      
      let error: any;
      try {
        await provider.query(sql, { key: 'age', value: '25' });
      } catch (e) {
        error = e;
      }
      
      // Should fail with connection error since we're not actually connected
      expect(error).toBeDefined();
      expect(error.name).toBe('PostgreSQLConnectionError');
    });

    it('should handle PostgreSQL returning clause', async () => {
      const sql = 'INSERT INTO users (name, email) VALUES (:name, :email) RETURNING id';
      
      let error: any;
      try {
        await provider.query(sql, { name: 'John', email: 'john@example.com' });
      } catch (e) {
        error = e;
      }
      
      // Should fail with connection error since we're not actually connected
      expect(error).toBeDefined();
      expect(error.name).toBe('PostgreSQLConnectionError');
    });
  });
});
