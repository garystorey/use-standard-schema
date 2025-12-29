# useStandardSchema

*A React hook for managing form state using any Standard Schema-compliant validator.*

[![License](https://img.shields.io/badge/license-MIT-%230172ad)](https://github.com/garystorey/use-standard-schema/blob/master/LICENSE.md)
![NPM Version](https://img.shields.io/npm/v/use-standard-schema)

---

## Table of contents

- [Overview](#overview)
- [Installation](#installation)
- [Usage](#usage)
- [Examples](#examples)
- [API](#api)
- [Feedback & Support](#feedback--support)
- [Changelog](#changelog)
- [License](#license)

---

## Overview

`useStandardSchema` wraps a [Standard Schema](https://standardschema.dev)-compliant form definition (e.g. Zod, Valibot, ArkType, etc.) into a React hook for form handling. It streamlines validation, state, error handling, and submission with type safety via the Standard Schema interface.

### Why useStandardSchema?

- Works with **any validator that implements the Standard Schema spec**
- Provides **consistent form APIs** regardless of validation library
- Built with **TypeScript support**, ensuring type-safe validation and form usage
- Integrates easily into React workflows
- Supports **nested objects** with dot notation (e.g. `"address.street1"`)

### Prerequisites

- React v18+
- TypeScript (optional, but recommended)
- A validator that implements the [Standard Schema v1 interface](https://standardschema.dev/#what-schema-libraries-implement-the-spec)

---

## Installation

```bash
npm install use-standard-schema
# or
yarn add use-standard-schema
# or
pnpm add use-standard-schema
```

---

## Usage

Define your form once with `defineForm`, then consume it inside a component with `useStandardSchema`.

```tsx
import { defineForm, useStandardSchema, type TypeFromDefinition } from "use-standard-schema"
import * as z from "zod"

const subscriptionForm = defineForm({
  email: {
    label: "Email",
    validate: z.email("Enter a valid email address"),
    defaultValue: "",  // optional
    description: "We'll send occasional updates.", // optional
  },
})

function onSubmitHandler (values: TypeFromDefinition<typeof subscriptionForm>) {
    console.log("Submitted:", values)
}

export function SubscriptionPage() {

  const { getForm, getField } = useStandardSchema(subscriptionForm)
  const formHandlers = getForm(onSubmitHandler)
  const email = getField("email")

  return (
    <form {...formHandlers}>
        
      <label htmlFor={email.name}>{email.label}</label>
      <input
        id={email.name}
        name={email.name}
        defaultValue={email.defaultValue}
        // value={defaultValue}
        aria-describedby={email.describedById}
        aria-errormessage={email.errorId}
      />
      <p id={email.describedById}>{email.description}</p>
      <p id={email.errorId} role="alert">{email.error}</p>

      <button type="submit">Subscribe</button>
    </form>
  )
}
```

- **`getForm(onSubmit)`**: Returns event handlers for the `<form>`. `onSubmit` only runs when valid.
- **`getField(name)`**: Returns the given field's metadata.

## Examples

Additional examples are available.

- [CodeSandbox Demo](https://codesandbox.io/p/sandbox/use-standard-schema-vthys3?file=%2Fsrc%2FApp.tsx) - Try the hook in a live React playground.
- [Dependent Fields example](https://github.com/garystorey/use-standard-schema/tree/main/examples/dependent-field-validation.tsx) - An example that keeps two related fields in sync using `setField` and `setError`.
- [Custom Component example](https://github.com/garystorey/use-standard-schema/tree/main/examples/custom-field-component.tsx) - Share reusable inputs via `FieldData`.
- [Valibot example](https://github.com/garystorey/use-standard-schema/tree/main/examples/valibot-login.tsx) - Build a simple login form powered by Valibot validators.
- [Shadcn Field example](https://github.com/garystorey/use-standard-schema/tree/main/examples/shadcn-field.tsx) - Wire `useStandardSchema` metadata into the shadcn/ui `Field` primitives.

### Nested object fields

Nested objects are supported.

```tsx
import { defineForm } from "use-standard-schema"
import * as z from "zod"

const addressForm = defineForm({
  address: {
    street1: { label: "Street", validate: z.string().min(2) },
  },
})

```

### Error handling

`useStandardSchema` returns the `getErrors` method that returns all of the current validations errors. This can be useful for giving all form error messages in one location. **NOTE**: This is in addition to the `getField` method which returns the errors for a given field.

```tsx
import type { ErrorEntry } from "use-standard-schema"

const { getErrors } = useStandardSchema(loginForm)
const errors = getErrors()

{errors.length > 0 && (
  <div role="alert">
    {errors.map(({ name, label, error }: ErrorEntry) => (
      <p key={name}>{label}: {error}</p>
    ))}
  </div>
)}
```

### Touched and dirty helpers

Use the `isTouched` and `isDirty` helper methods to check whether or not the form, or a given field, has been modified or focused by the user.

```tsx
  const { isTouched, isDirty } = useStandardSchema(addressForm)

  const isStreetTouched = isTouched("address.street1")
  const isStreetDirty = isDirty("address.street1")

  const isFormTouched = isTouched()
  const isFormDirty = isDirty()
```

### Valid keys

A `FormDefinition`'s key is an intersection between a valid JSON key and an HTML name attribute.

```ts

const formDefinition = defineForm({
    prefix: z.string(),                // valid
    "first-name": z.string(),          // valid
    "middle_name": z.string(),         // valid
    "last:name": z.string(),           // valid
    "street address": z.string()       // invalid
})

```

## API

`useStandardSchema` returns a helpers for wiring form elements, reading state, and issuing manual updates.

### `useStandardSchema(formDefinition)`

Passing a form definition using `defineForm` and pass the definition to the hook. The return value exposes the rest of the helpers documented below.

```ts
const { getForm, getField, getErrors, setField, setError, resetForm, isTouched, isDirty, watchValues } =
  useStandardSchema(myFormDefinition)
```

### `getForm(onSubmit)`

Returns the event handlers for the `<form>`. It validates all fields and only invokes your handler when everything passes.

```tsx
const form = getForm((values) => console.log(values))

return <form {...form}>...</form>
```

### `getField(name)`

Returns metadata for a specific field for wiring inputs, labels, and helper text.

```tsx
const email = getField("email")

<input
  name={email.name}
  defaultValue={email.defaultValue}
  aria-describedby={email.describedById}
  aria-errormessage={email.errorId}
  aria-invalid={!!email.error}
/>
<span id={email.describedById}>Enter your email address</span>
<span id={email.errorId}>{email.error}</span>
```

### `getErrors(name?)`

Returns structured error data of type `ErrorEntry` for the whole form or for one specific field - perfect for summary banners or toast notifications.

```ts
const allErrors = getErrors()
const emailErrors = getErrors("email")
```

### `resetForm()`

Clears errors, touched/dirty flags, and restores the original defaults. **Note**: The hook calls this automatically after a successful submit.

```html
<button type="reset" onClick={resetForm}>Reset<button>
```

### `isTouched(name?)` and `isDirty(name?)`

Report whether a field - or any field when called without arguments - has been interacted with or changed.

```ts
const hasEditedAnything = isDirty()
const isEmailTouched = isTouched("email")
```

### `watchValues(targets?, callback)`

Subscribe to canonical form values without forcing extra React renders. The callback executes whenever any watched key changes and
receives an object scoped to those fields.

#### Parameters

- `targets` *(optional)*: a single field name or array of field names. Omit to observe every value in the form.
- `callback(values)`: invoked with the latest values for the watched fields.

#### Returns

- `unsubscribe()`: stop listening inside `useEffect` cleanups or teardown handlers.

```tsx
const postToPreview = ({ plan, seats }) => {
    previewChannel.postMessage({ 
        quote: calculateQuote(plan, Number(seats)) 
    })
}

useEffect(() => {

  const unsubscribe = watchValues(["plan", "seats"], postToPreview)
  return unsubscribe

}, [watchValues])
```

### `toFormData(data)`

Helper that converts a values object into a browser `FormData` instance for interoperability with fetch/XHR uploads.

```ts
const formData = toFormData(values)
```

### `setField(name, value)`

Updates a field's value (*for dependent fields, custom widgets, or multi-step wizards*) and re-validates it.
**NOTE**: You do not need to call this manually in most situations. It will occur automatically.

```ts
setField("address.postalCode", nextPostalCode)
```

### `setError(name, error)`

Sets a manual error message for any field  (*for dependent fields, custom widgets, or multi-step wizards*). Pass `null` or `undefined` to clear it. **NOTE**: You do not need to call this manually in most situations. It will occur automatically.

```ts
setError("email", new Error("Email already registered"))
```

## Feedback & Support

If you encounter issues or have feature requests, [open an issue](https://github.com/garystorey/use-standard-schema/issues) on GitHub.

---

## Changelog

- **v0.4.3**
  - Fixed documentation issues.
  - Fixed missing `ErrorEntry` export.
- **v0.4.2**
  - Added `watchValues` for monitoring value changes without rerender.
  - Fixed issue with `ErrorInfo` not being exported.
  - Field updates are safer, validation errors fall back to helpful defaults, and async checks no longer overwrite newer input.
  - Added a shadcn/ui Field example
  - Added additional tests to keep real-world flows covered.
- **v0.4.1** - Minor code fixes and documentation updates
- **v0.4.0** - Improved form state synchronization, renamed the `FieldDefinitionProps` type to `FieldData`, and ensured programmatic updates stay validated while tracking touched/dirty status.
- [View the full changelog](./CHANGELOG.md) for earlier releases.

---

## License

[MIT License](./LICENSE.md)
