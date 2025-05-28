# OpenSIPS-JS Testing Framework

A powerful, scenario-based testing framework for the OpenSIPS-JS library that enables end-to-end testing of SIP communication flows, WebRTC operations, and related functionalities.

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Key Concepts](#key-concepts)
- [Setting Up Tests](#setting-up-tests)
- [Defining Test Scenarios](#defining-test-scenarios)
  - [Method-Based Definition](#method-based-definition)
  - [JSON-Based Definition](#json-based-definition)
- [Actions Reference](#actions-reference)
- [Events Reference](#events-reference)
  - [Events and Event Scoping](#events-and-event-scoping)
  - [Custom Shared Events](#custom-shared-events)
- [Context and Data Flow](#context-and-data-flow)
  - [Initial Context](#initial-context)
  - [Environment Variables](#environment-variables)
  - [Nested Environment Variables](#nested-environment-variables)
  - [Dynamic Context Updates](#dynamic-context-updates)
  - [Data Templating](#data-templating)
- [Test Execution Flow](#test-execution-flow)
- [WebRTC Metrics Collection](#webrtc-metrics-collection)
- [Extending the Framework](#extending-the-framework)
- [Examples](#examples)

## Overview

The OpenSIPS-JS testing framework is designed to automate the testing of SIP/WebRTC communications by defining and executing test scenarios that simulate real-world interactions. It provides a structured way to:

- Test SIP registration, call flows, and media operations
- Simulate user interactions with the OpenSIPS-JS library
- Collect and analyze WebRTC performance metrics
- Test various call features such as DTMF, transfers, and hold operations
- Make HTTP requests as part of test scenarios

## Architecture

The framework is built with a modular, event-driven architecture:

- **Test Scenarios**: Define the sequence of events and actions for testing
- **Event Bus**: Central hub for communication between components
- **Actions Executor**: Performs actions like registration, dialing, etc.
- **WebRTC Metrics**: Collects performance data during tests
- **Page Interaction**: Uses Playwright to control browser interactions

## Key Concepts

### Scenarios

A scenario is a collection of event handlers, each specifying what actions to take when certain events occur. Scenarios allow you to script complex interactions between SIP endpoints.

### Events

Events represent significant occurrences during testing such as incoming calls, registration completion, or call termination. Event handlers define how the test should respond to these events.

### Actions

Actions are operations that can be performed during testing such as registering, dialing, answering calls, or playing sounds. Actions can trigger events and affect the state of the test.

### Context

The test context stores state and data that can be shared across scenarios. It's useful for passing information between different parts of the test.

## Setting Up Tests

### Prerequisites

- Node.js (v14+)
- Playwright installed
- A local test server running OpenSIPS-JS demo

### Basic Setup

To use the testing framework, you don't need to create any new files. The framework provides all the necessary infrastructure. You only need to:

1. Define your test scenarios in the `init()` method
2. Optionally override the `getInitialContext()` method to provide test-specific data

```typescript
import TestScenariosBuilder from './services/TestScenariosBuilder'
import type { TestScenarios } from './types/intex'

export default class MyTestScenarios extends TestScenariosBuilder {
    getInitialContext() {
        return {
            // Define your initial context here
            caller: {
                sip_domain: 'example.com',
                username: 'caller',
                password: 'password',
            },
            callee: {
                sip_domain: 'example.com',
                username: 'callee',
                password: 'password'
            }
        }
    }

    init(): TestScenarios {
        return [
            // Your test scenarios will go here
            // Each scenario should have a name and an array of event handlers
            this.createScenario('name', [/* event handlers */])
        ]
    }
}
```

Then, create a simple runner file:

```typescript
import MyTestScenarios from './my-test-definition'

async function runTest() {
    console.log('Starting test execution')
    try {
        const testRunner = new MyTestScenarios()
        await testRunner.run()
        console.log('Test execution completed successfully')
    } catch (error) {
        console.error('Test execution failed:', error)
    }
}

runTest().catch(err => console.error('Unhandled error in test execution:', err))
```

## Defining Test Scenarios

There are two ways to define test scenarios in the framework:

### Method-Based Definition

This approach uses the helper methods provided by `TestScenariosBuilder` to create scenarios with full type safety:

```typescript
// Create a scenario with a name and an array of event handlers
this.createScenario(
    'caller', // Scenario name for better identification and debugging
    [
        this.on('ready', [
            // Actions to perform when the 'ready' event occurs
            this.register({
                payload: {
                    sip_domain: '{{caller.sip_domain}}',
                    username: '{{caller.username}}',
                    password: '{{caller.password}}',
                },
                customSharedEvent: 'caller_registered'
            })
        ]),
        this.on('incoming', [
            // Actions to perform when an incoming call is received
            this.answer({
                customSharedEvent: 'call_answered',
            })
        ]),
        // More event handlers...
    ]
)
```

### JSON-Based Definition

Since all of the helper methods in `TestScenariosBuilder` simply return plain objects, you can define your scenarios directly using JSON objects with the same structure:

```typescript
init(): TestScenarios {
    return [
        // A scenario defined directly as a JSON structure
        {
            name: 'caller', // Required name for the scenario
            actions: [
                {
                    event: 'ready',
                    actions: [
                        {
                            type: 'register',
                            data: {
                                payload: {
                                    sip_domain: '{{caller.sip_domain}}',
                                    username: '{{caller.username}}',
                                    password: '{{caller.password}}',
                                },
                                customSharedEvent: 'caller_registered'
                            }
                        }
                    ]
                },
                {
                    event: 'incoming',
                    actions: [
                        {
                            type: 'answer',
                            data: {
                                customSharedEvent: 'call_answered'
                            }
                        }
                    ]
                }
            ]
        }
    ]
}
```

#### JSON Structure

The structure of a JSON-defined scenario follows this pattern:

```javascript
{
    name: 'scenarioName',  // Required name for the scenario
    actions: [  // Array of event handlers
        {
            event: 'eventName',  // Name of the event to handle
            actions: [  // Array of actions to execute when the event occurs
                {
                    type: 'actionType',  // Type of action (e.g., 'register', 'dial', etc.)
                    data: {  // Action data
                        payload: {  // Action-specific payload
                            // Properties depend on the action type
                        },
                        waitUntil: {  // Optional: Make the action wait for another event
                            event: 'eventName',
                            timeout: 5000  // Optional timeout in ms
                        },
                        customSharedEvent: 'customEventName'  // Optional: Event to trigger after completion
                    }
                }
            ]
        }
    ]
}
```

#### Benefits of JSON-Based Definition

- **Serialization**: JSON scenarios can be stored in files, databases, or transmitted over network
- **Dynamic Generation**: You can generate test scenarios programmatically
- **External Configuration**: Test scenarios can be defined externally without modifying code
- **Tool Integration**: Easier to integrate with visual test builders or other tools

#### Combining Both Approaches

You can mix both approaches, using the method-based approach for type safety during development, and then serializing to JSON for storage or dynamic scenarios:

```typescript
// Define a scenario using methods for type safety
const myScenario = this.createScenario(
    'caller', // Required scenario name
    [
        this.on('ready', [
            this.register({
                payload: {
                    sip_domain: '{{caller.sip_domain}}',
                    username: '{{caller.username}}',
                    password: '{{caller.password}}',
                }
            })
        ])
    ]
);

// The result is a plain object that could be serialized to JSON
const jsonScenario = JSON.stringify(myScenario);

// Later, you could parse and use this JSON scenario
const parsedScenario = JSON.parse(jsonScenario);
```

### Parallel Scenarios

Multiple scenarios can run in parallel, representing different endpoints in a call flow:

```typescript
init(): TestScenarios {
    return [
        // Scenario 1 - Caller
        this.createScenario(
            'caller', // Scenario name
            [
                // Caller event handlers...
            ]
        ),
        
        // Scenario 2 - Callee
        this.createScenario(
            'callee', // Scenario name
            [
                // Callee event handlers...
            ]
        )
    ]
}
```

## Actions Reference

### Registration Actions

#### Register

Registers a SIP user agent with a SIP server.

```typescript
this.register({
    payload: {
        sip_domain: '{{caller.sip_domain}}',
        username: '{{caller.username}}',
        password: '{{caller.password}}',
    },
    customSharedEvent: 'caller_registered' // Optional
})
```

#### Unregister

Unregisters a SIP user agent.

```typescript
this.unregister({
    customSharedEvent: 'caller_unregistered' // Optional
})
```

### Call Actions

#### Dial

Initiates a call to another SIP user.

```typescript
this.dial({
    payload: {
        target: '{{callee.username}}@{{callee.sip_domain}}'
    },
    customSharedEvent: 'call_initiated' // Optional
})
```

#### Answer

Answers an incoming call.

```typescript
this.answer({
    customSharedEvent: 'call_answered' // Optional
})
```

#### Hangup

Terminates an active call.

```typescript
this.hangup({
    customSharedEvent: 'call_ended' // Optional
})
```

#### Hold/Unhold

Places a call on hold or takes it off hold.

```typescript
this.hold({
    customSharedEvent: 'call_on_hold' // Optional
})

this.unhold({
    customSharedEvent: 'call_resumed' // Optional
})
```

#### Transfer

Transfers an active call to another target.

```typescript
this.transfer({
    payload: {
        target: '{{transfer_target}}'
    },
    customSharedEvent: 'call_transferred' // Optional
})
```

#### Send DTMF

Sends DTMF tones during an active call.

```typescript
this.sendDTMF({
    payload: {
        dtmf: '1234'
    },
    customSharedEvent: 'dtmf_sent' // Optional
})
```

### Media Actions

#### Play Sound

Plays a sound file during a call.

```typescript
this.playSound({
    payload: {
        sound: '/path/to/soundfile.wav'
    },
    customSharedEvent: 'sound_played' // Optional
})
```

### Utility Actions

#### Wait

Pauses execution for a specified time.

```typescript
this.wait({
    payload: {
        time: 2000 // milliseconds
    },
    customSharedEvent: 'wait_completed' // Optional
})
```

#### Request

Makes an HTTP request during the test.

```typescript
this.request({
    payload: {
        url: 'https://api.example.com/endpoint',
        options: {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ key: 'value' })
        }
    },
    customSharedEvent: 'request_completed' // Optional
})
```

### Action Properties

All actions can include the following properties:

- **payload**: The data required for the action
- **waitUntil**: Makes the action wait for another event before executing
- **customSharedEvent**: Triggers a custom event after the action completes

Example with waitUntil:

```typescript
this.dial({
    payload: {
        target: '{{callee.username}}@{{callee.sip_domain}}'
    },
    waitUntil: {
        event: 'callee_registered',
        timeout: 5000 // Optional timeout in milliseconds
    },
    customSharedEvent: 'call_initiated'
})
```

## Events Reference

### Events and Event Scoping

The framework has two types of events with different scoping:

1. **Regular Events**: These events are scenario-specific and are only sent to the scenario that triggered them. They include events like 'register', 'dial', 'answer', etc.

2. **Custom Shared Events**: These events are shared between all scenarios and can be used for cross-scenario communication. They are defined using the `customSharedEvent` property in actions.

This distinction is important because it allows you to:
- Keep scenarios isolated by default, preventing unintended interactions
- Selectively share events when coordination between scenarios is needed

Here's how event scoping works:

```typescript
// Scenario 1
this.on('ready', [
    this.register({
        // ...
    })
])

// The 'register' event fired after this action 
// will only be received by Scenario 1
```

### Custom Shared Events

Custom shared events are a powerful feature for coordinating between different scenarios. They allow you to:

- Signal between caller and callee scenarios
- Create dependencies between scenarios (e.g., "wait until caller is registered before proceeding")
- Implement complex call flows involving multiple parties

To create a custom shared event:

```typescript
// In one scenario (e.g., caller)
this.register({
    payload: {
        // ...registration data
    },
    customSharedEvent: 'caller_registered' // Creates a shared event
})

// In another scenario (e.g., callee)
// This event handler will respond to the shared event
this.on('caller_registered', [
    this.dial({
        payload: {
            target: '{{caller.username}}@{{caller.sip_domain}}'
        }
    })
])
```

Custom shared events are particularly useful for:

1. **Synchronization**: Ensuring that one scenario reaches a certain state before another scenario proceeds
2. **Conditional Logic**: Triggering different actions based on events from other scenarios
3. **Cross-Scenario Data Sharing**: Passing data between scenarios (event data is added to the shared context)

### System Events

The framework provides these built-in events:

- **ready**: Fired when the test page is loaded and ready
- **register**: Fired after a successful registration
- **dial**: Fired after initiating a call
- **incoming**: Fired when receiving an incoming call
- **answer**: Fired after answering a call
- **hold**: Fired after putting a call on hold
- **unhold**: Fired after resuming a call from hold
- **hangup**: Fired after hanging up a call
- **playSound**: Fired after a sound playback completes
- **sendDTMF**: Fired after sending DTMF tones
- **transfer**: Fired after transferring a call
- **unregister**: Fired after unregistering

### SIP Protocol Events

These events are triggered by the PageWebSocketWorker when it detects SIP messages:

- **INVITE**: Maps to 'incoming' event
- **ACK**: Maps to 'callConfirmed' event
- **CANCEL**: Maps to 'callCancelled' event
- **BYE**: Maps to 'callEnded' event
- **UPDATE**: Maps to 'callUpdated' event
- **MESSAGE**: Maps to 'messageReceived' event
- **OPTIONS**: Maps to 'optionsReceived' event
- **REFER**: Maps to 'callReferred' event
- **INFO**: Maps to 'infoReceived' event
- **NOTIFY**: Maps to 'notificationReceived' event

## Context and Data Flow

The context is a central concept in the testing framework, providing a way to share data between actions, events, and scenarios.

### Initial Context

The initial context is defined by overriding the `getInitialContext()` method in your test class:

```typescript
getInitialContext() {
    return {
        caller: {
            sip_domain: 'example.com',
            username: 'caller',
            password: 'password',
        },
        callee: {
            sip_domain: 'example.com',
            username: 'callee',
            password: 'password'
        }
    }
}
```

This is the starting point for all data used in your test scenarios.

### Environment Variables

The framework automatically includes all environment variables in the context, making it easy to pass configuration at runtime, especially in containerized environments like Docker.

For example, given these environment variables:

```
CALLER_USERNAME=user123
CALLER_PASSWORD=pass456
SIP_DOMAIN=sip.example.com
```

You can reference them in your tests:

```typescript
this.register({
    payload: {
        sip_domain: '{{SIP_DOMAIN}}',
        username: '{{CALLER_USERNAME}}',
        password: '{{CALLER_PASSWORD}}',
    }
})
```

### Nested Environment Variables

The framework supports "unflatifying" environment variables with dot notation into nested objects. This is particularly useful for complex configurations:

```
# Environment variables
CALLER.USERNAME=user123
CALLER.PASSWORD=pass456
CALLER.SIP_DOMAIN=sip.example.com

CALLEE.USERNAME=user789
CALLEE.PASSWORD=pass012
CALLEE.SIP_DOMAIN=sip.example.com
```

These will be automatically converted into a nested object structure:

```javascript
{
    CALLER: {
        USERNAME: 'user123',
        PASSWORD: 'pass456',
        SIP_DOMAIN: 'sip.example.com'
    },
    CALLEE: {
        USERNAME: 'user789',
        PASSWORD: 'pass012',
        SIP_DOMAIN: 'sip.example.com'
    }
}
```

Which you can reference in your tests:

```typescript
this.register({
    payload: {
        sip_domain: '{{CALLER.SIP_DOMAIN}}',
        username: '{{CALLER.USERNAME}}',
        password: '{{CALLER.PASSWORD}}',
    }
})
```

This feature is particularly useful for Docker deployments or CI/CD pipelines where configuration is passed through environment variables.

### Dynamic Context Updates

The context is updated throughout the test execution:

1. Each action's response is added to the context
2. Custom shared events pass data to all scenarios
3. HTTP request responses are added to the context

This allows you to use results from one action in subsequent actions:

```typescript
// First make an HTTP request
this.request({
    payload: {
        url: 'https://api.example.com/credentials',
        options: { method: 'GET' }
    },
    customSharedEvent: 'api_call_completed'
}),

// Then use the response data in a registration
this.on('api_call_completed', [
    this.register({
        payload: {
            // Use data from the HTTP response
            sip_domain: '{{response.domain}}',
            username: '{{response.username}}',
            password: '{{response.password}}',
        }
    })
])
```

### Data Templating

The framework uses Mustache templating to insert dynamic values into any string value in action payloads.

#### Context Variables

You can reference variables from the test context using the `{{variable}}` syntax:

```typescript
this.register({
    payload: {
        sip_domain: '{{caller.sip_domain}}',
        username: '{{caller.username}}',
        password: '{{caller.password}}',
    }
})
```

#### Action Results

Results from previous actions are automatically added to the context and can be referenced:

```typescript
// After a request action
this.register({
    payload: {
        sip_domain: '{{response.domain}}', // References data from the HTTP response
        username: '{{caller.username}}',
        password: '{{caller.password}}',
    }
})
```

## Test Execution Flow

1. The test starts by creating test executors for each scenario.
2. Each executor opens a browser using Playwright.
3. The page loads and the 'ready' event is triggered.
4. Event handlers respond to events by executing their defined actions.
5. Actions may trigger more events, which trigger more actions.
6. The test concludes when all scenarios complete their execution flow.

### Event-Action Sequence

Tests progress through an event-action chain:

1. Initial event (usually 'ready') → 
2. Action in response to event →
3. Action result triggers another event →
4. Action in response to that event →
...and so on.

## WebRTC Metrics Collection

The framework automatically collects WebRTC metrics during calls using the WebRTCMetricsCollector:

```typescript
// The metrics are collected in the background and can be analyzed at the end of the test
const metrics = await this.page.evaluate(WebRTCMetricsCollector.collectMetrics)

console.log('Call Metrics:', {
    'Setup Time (ms)': metrics.setupTime,
    'Total Duration (ms)': metrics.totalDuration,
    'Connection Successful': metrics.connectionSuccessful,
    'Audio Statistics': metrics.audioMetrics,
})
```

### Collected Metrics

- **Setup Time**: Time taken to establish the WebRTC connection
- **Total Duration**: Total duration of the call
- **Audio Metrics**:
  - Packet statistics (received, sent, lost)
  - Quality metrics (jitter, round-trip time, audio level)
  - Bandwidth usage
  - Codec information
  - Audio processing data

### Metrics Analysis

The WebRTCMetricsAnalyzer can process raw metrics to provide meaningful statistics:

```typescript
const avgMetrics = WebRTCMetricsAnalyzer.calculateAverageMetrics(metrics.allStats)
const qualityStatus = WebRTCMetricsAnalyzer.getQualityStatus(avgMetrics)

console.log(`Call Quality: ${qualityStatus}`)
console.log(`Average Packet Loss: ${avgMetrics.avgPacketLoss.toFixed(2)}%`)
console.log(`Average Jitter: ${avgMetrics.avgJitter.toFixed(2)}ms`)
```

## Extending the Framework

### Adding New Actions

To add a new action:

1. Define the action's type, payload, and response in `types/actions.ts`:

```typescript
interface NewActionPayload {
    // Payload parameters
    param1: string;
    param2: number;
}

interface NewActionResponse {
    // Response data
    success: boolean;
    result: any;
}

export type NewAction = Action<
    'newAction',
    NewActionPayload,
    NewActionResponse
>

export interface ActionsMap {
    // Existing actions...
    newAction: NewAction;
}
```

2. Add the method to `TestScenariosBuilder`:

```typescript
public newAction(data: GetActionData<NewAction>): GetActionDefinition<NewAction> {
    return {
        type: 'newAction',
        data
    }
}
```

3. Implement the action in `ActionsExecutor`:

```typescript
public async newAction(data: GetActionPayload<NewAction>): Promise<GetActionResponse<NewAction>> {
    console.log(`Executing new action with params:`, data);
    
    // Implementation logic
    
    return {
        success: true,
        result: {}
    }
}
```

### Adding New Events

To add a new event:

1. Update the `EventsMap` interface in `types/events.d.ts`:

```typescript
export interface EventsMap {
    // Existing events...
    newEvent: AllowedActions<'action1' | 'action2' | 'action3'>
}
```

2. If the event comes from SIP messages, update the mapping in `PageWebSocketWorker`:

```typescript
this.pageWebSocketWorker = new PageWebSocketWorker(
    this.page,
    {
        // Existing mappings...
        NEW_SIP_METHOD: 'newEvent',
    },
    this.triggerLocalEventListener.bind(this)
)
```

## Examples

### Basic Call Test with API Integration

This example shows how to:
1. Make an API request to get SIP credentials
2. Use those credentials to register
3. Make a call between two scenarios
4. End the call and unregister

```typescript
init(): TestScenarios {
    return [
        // Caller scenario
        this.createScenario(
            'caller', // Scenario name
            [
                this.on('ready', [
                    this.request({
                        payload: {
                            url: 'https://api.example.com/credentials',
                            options: { method: 'GET' }
                        },
                        customSharedEvent: 'caller_credentials_received'
                    })
                ]),
                this.on('caller_credentials_received', [
                    this.register({
                        payload: {
                            sip_domain: '{{response.domain}}',
                            username: '{{response.username}}',
                            password: '{{response.password}}',
                        },
                        customSharedEvent: 'caller_registered'
                    })
                ]),
                this.on('callee_registered', [
                    this.dial({
                        payload: {
                            target: '{{callee.username}}@{{callee.sip_domain}}'
                        },
                        customSharedEvent: 'call_initiated'
                    })
                ]),
                this.on('call_answered', [
                    this.wait({
                        payload: { time: 3000 }
                    }),
                    this.hangup({
                        customSharedEvent: 'call_ended'
                    })
                ]),
                this.on('call_ended', [
                    this.unregister({})
                ])
            ]
        ),
        
        // Callee scenario
        this.createScenario(
            'callee', // Scenario name
            [
                this.on('ready', [
                    this.register({
                        payload: {
                            sip_domain: '{{callee.sip_domain}}',
                            username: '{{callee.username}}',
                            password: '{{callee.password}}',
                        },
                        customSharedEvent: 'callee_registered'
                    })
                ]),
                this.on('incoming', [
                    this.answer({
                        customSharedEvent: 'call_answered'
                    })
                ]),
                this.on('call_ended', [
                    this.unregister({})
                ])
            ]
        )
    ]
}
```

### Using JSON-Based Scenario Definition

```typescript
init(): TestScenarios {
    return [
        // Caller scenario defined using JSON
        {
            name: 'caller', // Required scenario name
            actions: [
                {
                    event: 'ready',
                    actions: [
                        {
                            type: 'register',
                            data: {
                                payload: {
                                    sip_domain: '{{caller.sip_domain}}',
                                    username: '{{caller.username}}',
                                    password: '{{caller.password}}',
                                },
                                customSharedEvent: 'caller_registered'
                            }
                        }
                    ]
                },
                {
                    event: 'callee_registered',
                    actions: [
                        {
                            type: 'dial',
                            data: {
                                payload: {
                                    target: '{{callee.username}}@{{callee.sip_domain}}'
                                },
                                customSharedEvent: 'call_initiated'
                            }
                        }
                    ]
                },
                {
                    event: 'call_answered',
                    actions: [
                        {
                            type: 'wait',
                            data: {
                                payload: { time: 3000 }
                            }
                        },
                        {
                            type: 'hangup',
                            data: {
                                customSharedEvent: 'call_ended'
                            }
                        }
                    ]
                },
                {
                    event: 'call_ended',
                    actions: [
                        {
                            type: 'unregister',
                            data: {}
                        }
                    ]
                }
            ]
        },
        
        // Callee scenario defined using method approach for comparison
        this.createScenario(
            'callee', // Required scenario name
            [
                this.on('ready', [
                    this.register({
                        payload: {
                            sip_domain: '{{callee.sip_domain}}',
                            username: '{{callee.username}}',
                            password: '{{callee.password}}',
                        },
                        customSharedEvent: 'callee_registered'
                    })
                ]),
                this.on('incoming', [
                    this.answer({
                        customSharedEvent: 'call_answered'
                    })
                ]),
                this.on('call_ended', [
                    this.unregister({})
                ])
            ]
        )
    ]
}
```

### Using Environment Variables with Nested Objects

This example demonstrates how to use the nested environment variables feature:

```bash
# Set environment variables
export CALLER.SIP_DOMAIN=sip.example.com
export CALLER.USERNAME=caller123
export CALLER.PASSWORD=securepass

export CALLEE.SIP_DOMAIN=sip.example.com
export CALLEE.USERNAME=callee456
export CALLEE.PASSWORD=anotherpass
```

Then in your test:

```typescript
// No need to define getInitialContext() - environment variables will be used

init(): TestScenarios {
    return [
        // Caller scenario
        this.createScenario(
            'caller', // Required scenario name
            [
                this.on('ready', [
                    this.register({
                        payload: {
                            sip_domain: '{{CALLER.SIP_DOMAIN}}',
                            username: '{{CALLER.USERNAME}}',
                            password: '{{CALLER.PASSWORD}}',
                        },
                        customSharedEvent: 'caller_registered'
                    })
                ])
                // ... rest of the scenario
            ]
        ),
        
        // Callee scenario
        this.createScenario(
            'callee', // Required scenario name
            [
                this.on('ready', [
                    this.register({
                        payload: {
                            sip_domain: '{{CALLEE.SIP_DOMAIN}}',
                            username: '{{CALLEE.USERNAME}}',
                            password: '{{CALLEE.PASSWORD}}',
                        },
                        customSharedEvent: 'callee_registered'
                    })
                ])
                // ... rest of the scenario
            ]
        )
    ]
}
```

### Advanced Call Features Test

```typescript
init(): TestScenarios {
    return [
        // Caller scenario
        this.createScenario(
            'caller', // Required scenario name
            [
                this.on('ready', [
                    this.register({
                        payload: {
                            sip_domain: '{{caller.sip_domain}}',
                            username: '{{caller.username}}',
                            password: '{{caller.password}}',
                        },
                        customSharedEvent: 'caller_registered'
                    })
                ]),
                this.on('callee_registered', [
                    this.dial({
                        payload: {
                            target: '{{callee.username}}@{{callee.sip_domain}}'
                        },
                        customSharedEvent: 'call_initiated'
                    })
                ]),
                this.on('call_answered', [
                    this.wait({
                        payload: { time: 1000 }
                    }),
                    this.hold({
                        customSharedEvent: 'call_held'
                    })
                ]),
                this.on('call_resumed', [
                    this.wait({
                        payload: { time: 1000 }
                    }),
                    this.sendDTMF({
                        payload: {
                            dtmf: '123'
                        },
                        customSharedEvent: 'dtmf_sent'
                    })
                ]),
                this.on('dtmf_sent', [
                    this.wait({
                        payload: { time: 1000 }
                    }),
                    this.hangup({
                        customSharedEvent: 'call_ended'
                    })
                ]),
                this.on('call_ended', [
                    this.unregister({})
                ])
            ]
        ),
        
        // Callee scenario
        this.createScenario(
            'callee', // Required scenario name
            [
                this.on('ready', [
                    this.register({
                        payload: {
                            sip_domain: '{{callee.sip_domain}}',
                            username: '{{callee.username}}',
                            password: '{{callee.password}}',
                        },
                        customSharedEvent: 'callee_registered'
                    })
                ]),
                this.on('incoming', [
                    this.answer({
                        customSharedEvent: 'call_answered'
                    })
                ]),
                this.on('call_held', [
                    this.wait({
                        payload: { time: 2000 }
                    }),
                    this.playSound({
                        payload: {
                            sound: '/path/to/notification.wav'
                        },
                        customSharedEvent: 'notification_played'
                    })
                ]),
                this.on('notification_played', [
                    this.unhold({
                        customSharedEvent: 'call_resumed'
                    })
                ]),
                this.on('call_ended', [
                    this.unregister({})
                ])
            ]
        )
    ]
}
```

## Conclusion

The OpenSIPS-JS testing framework provides a powerful way to automate testing of SIP communications and WebRTC applications. By defining scenarios as sequences of events and actions, you can create comprehensive tests that validate the behavior of your SIP applications across different use cases.

The event-driven architecture makes it easy to create complex, multi-agent test scenarios that simulate real-world communication flows, while the built-in metrics collection helps ensure the quality of WebRTC connections.
