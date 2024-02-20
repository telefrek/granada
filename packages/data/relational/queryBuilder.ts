/**
 * Extensions for creating relational queries
 */

import { QueryBuilderBase } from "../query/builder"

/**
 * Represents a {@link QueryBuilder} that is specifically for relational
 * database queries
 */
export abstract class RelationalQueryBuilder extends QueryBuilderBase {}

// Start with a simple select [columns] from [source] where [clause]
