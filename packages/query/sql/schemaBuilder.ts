import type { MatchingProperty } from "@telefrek/core/type/utils.js"
import type {
  ColumnSchema,
  CompositePrimaryKey,
  DatabaseTables,
  ForeignKey,
  PrimaryKey,
  SQLDatabase,
  SQLTableDefinition,
} from "./schema.js"

export type ModifiedTables<
  D extends DatabaseTables,
  N extends string,
  S extends ColumnSchema,
> = {
  [K in keyof D | N]: K extends keyof D ? D[K] : SQLTableDefinition<S>
}

export class SchemaBuilder<
  // eslint-disable-next-line @typescript-eslint/ban-types
  T extends DatabaseTables = {},
  D extends SQLDatabase<T> = SQLDatabase<T>,
> {
  private readonly tables: T
  private readonly relations?: ForeignKey[]

  constructor(tables: T = {} as T, relations?: ForeignKey[]) {
    this.tables = tables
    this.relations = relations
  }

  withTable<Schema extends ColumnSchema, Name extends string>(
    schema: Schema,
    name: Name,
    tableKey: PrimaryKey<Schema> | CompositePrimaryKey<Schema>,
  ): SchemaBuilder<ModifiedTables<T, Name, Schema>> {
    const modified: ModifiedTables<T, Name, Schema> = Object.fromEntries(
      Object.keys(this.tables)
        .map((k) => [k as PropertyKey, this.tables[k]])
        .concat([
          [
            name,
            {
              columns: schema,
              key: tableKey,
            },
          ],
        ]),
    ) as ModifiedTables<T, Name, Schema>

    return new SchemaBuilder<ModifiedTables<T, Name, Schema>>(modified)
  }

  withForeignKey<
    Left extends keyof T,
    Right extends keyof T,
    LeftColumn extends keyof T[Left]["columns"],
    RightColumn extends MatchingProperty<
      T[Left]["columns"],
      T[Right]["columns"],
      LeftColumn
    >,
  >(
    leftTable: Left,
    rightTable: Right,
    leftColumn: LeftColumn,
    rightColumn: RightColumn,
  ): SchemaBuilder<T, D> {
    const key: ForeignKey = {
      left: leftTable as string,
      right: rightTable as string,
      leftColumn: leftColumn as string,
      rightColumn: rightColumn as string,
    }

    if (this.relations) {
      this.relations.push(key)
      return this
    }

    return new SchemaBuilder(this.tables, [key])
  }

  build(): D {
    // Collapsed<D> {
    return {
      tables: this.tables,
      relations: this.relations,
    } as D //as Collapsed<D>
  }
}
