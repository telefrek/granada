# Relational Data

This package is intended to try to represent some general concepts that exist in
most relational styles of queries and underlying providers. It is NOT intended
to be a fully compatible SQL implementation (or other relational variant) but
instead to provide some common functionality and nomenclature that can be parsed
into the corresponding systems.

## AST

This is extensions to the main query AST that are useful for relational systems
including operations for manipulating sources, "joining" between sets of data,
filtering, sorting, grouping and aggregations. It is also intended to track the
type of objects that will eventually be output by the combined set of operations
so we are best leveraging the compile time capabilities as well as the runtime
abstraction being provided.

## Builder

This has the extensions to the main query builder that provide ease of building
relational style queries for various systems. It is responsible for carrying
through the typing information and making manipulation of the underlying AST
easier to implement.

## Memory

Contains some utilities for creating in memory relational data stores that can
be queried. Note this is mostly for mocking and some limited use cases for
vetting features in some data stores that may fully "relational" and need a
reference implementation for how to manipulate objects that have been partially
loaded. In general, this is not intended to be widely used or performant but
has some uses so it is being kept here for now.
