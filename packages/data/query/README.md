# Query Package

The goal of this package is to provide some of the basic building blocks of a
structured query that doesn't worry about the underlying provider or
functionality. It is loosly defined to work with a broad number of providers
but is mainly to keep consistency at the lowest levels of the framework rather
that providing anything terribly useful on it's own (though a bad foundation
leads to things tilting in the future...)

## AST

To allow this to be flexible across a variety of different data providers, we
want to represent everything as an abstract syntax tree (AST) that can be
translated by individual providers into an appropriate query (or flagged as
invalid or the language, syntax, etc.) The core objects and structure for an
AST are defined here

## Builder

I'm a fan of builder patterns and they tend to work exceptionally well for query
composition, so we setup some of the building blocks to make creating a simple
abstract query easier.

## Errors

All query related errors should eventually tie back to one of these error
objects for easy detection in the framework.
