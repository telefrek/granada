import {
  SQLColumnType,
  SQLColumnTypes,
  type ColumnDefinition,
} from "@telefrek/query/sql/types.js"

/**
 * Helpers for building postgres specific types
 */
export class PostgresColumnTypes {
  static bigserial = (): ColumnDefinition<SQLColumnType.BIGINT> => {
    return SQLColumnTypes.incremental(SQLColumnType.BIGINT, true)
  }
}
