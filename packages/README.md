# Structure

The structure of the packages is intended to encapsulate specific domains of functionality into composable units that can be used to build your application, pulling in only what is needed to accomplish the task an no more (where possible).

```mermaid
---
title: Package Relationships
---
classDiagram
    class Core{
        concurrency
        events
        lifecycle
        streams
        structures
        time
        type
    }
    class Data{
        lookup
        partitioned
        query
        relational
    }
    class Http{
        content
        hosting
        loadShedding
        routing
    }
    note "All roads lead to core..."
    Core <|-- Http
    Core <|-- Data
    Data <|-- Postgres : implements
    Http <|-- Service : extends
```
