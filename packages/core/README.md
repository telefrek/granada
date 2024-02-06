```
 _____
/  __ \
| /  \/ ___  _ __ ___
| |    / _ \| '__/ _ \
| \__/\ (_) | | |  __/
 \____/\___/|_|  \___|

```

# Core

This package contains many of the simple objects and abstractions provided by the Granada framework that should work in a variety of situations. Several of the main themes are:

## Concurrency

Components in this module are related to controlling concurrent execution. While the event loop can only work on one thread of operation at a time, there are many cases you will find yourself in that deal with concurrent workstreams that may need to coordinate resources.

## Events

Components in this module are related to raising and handling events as well as patterns that take advantage of this paradigm.

## Structures

Components in this module are related to data structures that are provided to help with situations where built in abstractions do not provide enough granularity or are missing entirely.

## Time

Components in this module are related to keeping track of time at a lower level of granularity than milliseconds.
