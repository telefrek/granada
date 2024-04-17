# Backpressure

This package contains mechanisms that are designed to help manage backpressure
in a system to prevent catastrophic overloading of resources which can lead to
sustained failure beyond the timeline of the underlying issue.

> Failures should be assumed in every system. They are healthy and a necessary
> part of dealing with increased success in your endeavors.

## Circuit breakers

These nifty little tools help to detect when a system is likely compromised and
prevent sending further requests until the underlying system recovers. The goal
here is to monitor the failure/success of a call (defined by the implementation)
and when a failure threshold is crossed reduce (or completely top) the traffic
flowing downstream until some `probe` calls make it through successfully,
allowing traffic to slowly resume flowing. We intentionally fail calls during
the time when the circuit is `open` instead of sending them and further adding
pressure downstream.

## Limits

Rate limiters are tool designed to help manage the flow of information between
two systems to maximize throughput while maintaining a healthy overall response
rate. Most of these are based off of network congestion algorithms at their
core and have been exposed here as general mechanisms that can be adopted in a
variety of circumstances (connection pool sizes, requests per second, etc.)
