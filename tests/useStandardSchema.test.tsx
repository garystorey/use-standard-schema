import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import React, { act, forwardRef, useImperativeHandle } from "react"
import { describe, expect, it, vi } from "vitest"
import { useStandardSchema } from "../src"
import { defineForm } from "../src/helpers"
import type { ErrorEntry, UseStandardSchemaReturn } from "../src/types"
import { makeForm, makeThrowingForm, renderFormHarness, renderHookHarness } from "./test-utils"
import { delayed, email as emailValidator, string as reqString } from "./test-validation-lib"

describe("useStandardSchema (basic)", () => {
	it("getField surfaces metadata, accessibility ids, and default flags", () => {
		const { ref } = renderHookHarness()

		const nameField = ref.current!.getField("name")
		expect(nameField.name).toBe("name")
		expect(nameField.label).toBe("Name")
		expect(nameField.defaultValue).toBe("Joe")
		expect(nameField.error).toBe("")
		expect(nameField.describedById).toBe("name-description")
		expect(nameField.errorId).toBe("name-error")
		expect(nameField.touched).toBe(false)
		expect(nameField.dirty).toBe(false)

		const emailField = ref.current!.getField("contact.email")
		expect(emailField.name).toBe("contact.email")
		expect(emailField.label).toBe("Email")
		expect(emailField.defaultValue).toBe("")
		expect(emailField.error).toBe("")
		expect(emailField.describedById).toBe("contact.email-description")
		expect(emailField.errorId).toBe("contact.email-error")
		expect(emailField.touched).toBe(false)
		expect(emailField.dirty).toBe(false)
	})

	it("records validation errors and exposes them through getErrors helpers", async () => {
		const { ref } = renderHookHarness()

		// Defaults are valid with no errors reported
		expect(ref.current!.getField("name").error).toBe("")
		expect(ref.current!.getErrors("name")).toHaveLength(0)

		// Now set to empty explicitly (this will run single-field validation)
		await act(async () => {
			await ref.current!.setField("name", "")
		})

		await waitFor(() => {
			const field = ref.current!.getField("name")
			expect(field.defaultValue).toBe("")
			expect(field.error).toBe("Required")

			const errs = ref.current!.getErrors("name")
			expect(errs.length).toBe(1)
			expect(errs[0].error).toBe("Required")

			const aggregate = ref.current!.getErrors()
			expect(aggregate).toEqual([
				{
					name: "name",
					error: "Required",
					label: "Name",
				},
			])
		})

		expect(ref.current!.isDirty("name")).toBe(true)
		expect(ref.current!.isTouched("name")).toBe(true)
	})

	it("setField updates values, manages dirty tracking, and resetForm restores defaults", async () => {
		const { ref } = renderHookHarness()

		// Set a valid name
		await act(async () => {
			await ref.current!.setField("name", "Alice")
		})

		await waitFor(() => {
			const field = ref.current!.getField("name")
			expect(field.defaultValue).toBe("Alice")
			expect(field.error).toBe("")
			expect(ref.current!.isDirty("name")).toBe(true)
			expect(ref.current!.isTouched("name")).toBe(true)
		})

		// Reverting back to the default should clear the dirty flag
		await act(async () => {
			await ref.current!.setField("name", "Joe")
		})

		await waitFor(() => {
			const field = ref.current!.getField("name")
			expect(field.defaultValue).toBe("Joe")
			expect(ref.current!.isDirty("name")).toBe(false)
		})

		// Update again so that resetForm has state to clear
		await act(async () => {
			await ref.current!.setField("name", "Grace")
		})

		await waitFor(() => {
			const field = ref.current!.getField("name")
			expect(field.defaultValue).toBe("Grace")
			expect(ref.current!.isDirty("name")).toBe(true)
		})

		// Reset and ensure defaults come back
		act(() => {
			ref.current!.resetForm()
		})

		await waitFor(() => {
			const field = ref.current!.getField("name")
			expect(field.defaultValue).toBe("Joe")
			expect(ref.current!.isDirty()).toBe(false)
			expect(ref.current!.isTouched()).toBe(false)
		})
	})

	it("surface errors when interacting with unknown fields", async () => {
		const { ref } = renderHookHarness()

		expect(() => ref.current!.getField("missing" as never)).toThrowError('Field "missing" not found')

		await expect(ref.current!.setField("missing" as never, "value")).rejects.toThrowError('Field "missing" not found')

		expect(() => ref.current!.setError("missing" as never, "Boom")).toThrowError('Field "missing" not found')
	})

	it("setError allows manual control over field errors", async () => {
		const { ref } = renderHookHarness()

		act(() => {
			ref.current!.setError("name", "  Custom issue  ")
		})

		await waitFor(() => {
			expect(ref.current!.getField("name").error).toBe("Custom issue")
		})

		act(() => {
			ref.current!.setError("name", { message: "Another problem" })
		})

		await waitFor(() => {
			expect(ref.current!.getField("name").error).toBe("Another problem")
		})

		act(() => {
			ref.current!.setError("name", new Error("Boom"))
		})

		await waitFor(() => {
			expect(ref.current!.getField("name").error).toBe("Boom")
		})

		act(() => {
			ref.current!.setError("name", { message: "   " })
		})

		await waitFor(() => {
			expect(ref.current!.getField("name").error).toBe("")
		})

		act(() => {
			ref.current!.setError("name", null)
		})

		await waitFor(() => {
			expect(ref.current!.getField("name").error).toBe("")
		})
	})

	
	it("dependent field updates with setField/setError keep state and validation in sync", async () => {
		const dependentForm = defineForm({
			primary: { label: "Primary", defaultValue: "", validate: reqString("Primary required") },
			secondary: { label: "Secondary", defaultValue: "", validate: emailValidator("Invalid email") },
		})

		type DependentForm = typeof dependentForm

		const HookHarness = forwardRef<UseStandardSchemaReturn<DependentForm> | null, { formDef: DependentForm }>(
			function HookHarness(props, ref) {
				const api = useStandardSchema(props.formDef)
				useImperativeHandle(ref, () => api, [api])
				return null
			},
		)

		const ref = React.createRef<UseStandardSchemaReturn<DependentForm> | null>()
		render(<HookHarness ref={ref} formDef={dependentForm} />)

		const applyPrimaryDependency = async (nextPrimary: string) => {
			await ref.current!.setField("primary", nextPrimary)
			await ref.current!.setField("secondary", nextPrimary)

			if (!nextPrimary.includes("@")) {
				ref.current!.setError("secondary", "Secondary must stay a valid email")
			} else {
				ref.current!.setError("secondary", null)
			}
		}

		await act(async () => {
			await applyPrimaryDependency("owner@example.com")
		})

		await waitFor(() => {
			expect(ref.current!.getField("primary").defaultValue).toBe("owner@example.com")
			expect(ref.current!.getField("secondary").defaultValue).toBe("owner@example.com")
			expect(ref.current!.getField("secondary").error).toBe("")
			expect(ref.current!.isTouched("primary")).toBe(true)
			expect(ref.current!.isTouched("secondary")).toBe(true)
			expect(ref.current!.isDirty("primary")).toBe(true)
			expect(ref.current!.isDirty("secondary")).toBe(true)
		})

		await act(async () => {
			await applyPrimaryDependency("not-an-email")
		})

		await waitFor(() => {
			expect(ref.current!.getField("primary").defaultValue).toBe("not-an-email")
			expect(ref.current!.getField("secondary").defaultValue).toBe("not-an-email")
			expect(ref.current!.getField("secondary").error).toBe("Secondary must stay a valid email")
			expect(ref.current!.getErrors("secondary")).toEqual([
				{ name: "secondary", error: "Secondary must stay a valid email", label: "Secondary" },
			])
		})

		await act(async () => {
			await applyPrimaryDependency("next@example.com")
		})

		await waitFor(() => {
			expect(ref.current!.getField("primary").defaultValue).toBe("next@example.com")
			expect(ref.current!.getField("secondary").defaultValue).toBe("next@example.com")
			expect(ref.current!.getField("secondary").error).toBe("")
			expect(ref.current!.getErrors("secondary")).toEqual([])
		})
	})
it("validation updates replace manual errors with validator output", async () => {
		const { ref } = renderHookHarness()

		act(() => {
			ref.current!.setError("name", "Manual issue")
		})

		await waitFor(() => {
			expect(ref.current!.getField("name").error).toBe("Manual issue")
		})

		await act(async () => {
			await ref.current!.setField("name", "Alice")
		})

		await waitFor(() => {
			expect(ref.current!.getField("name").error).toBe("")
		})

		await act(async () => {
			await ref.current!.setField("name", "")
		})

		await waitFor(() => {
			expect(ref.current!.getField("name").error).toBe("Required")
		})
	})
	it("resets state when form definition changes", async () => {
		const firstForm = makeForm()
		const { ref, rerenderWith } = renderHookHarness(firstForm)

		await act(async () => {
			await ref.current!.setField("name", "")
		})

		await waitFor(() => {
			const errors = ref.current!.getErrors("name")
			expect(errors).toHaveLength(1)
		})

		const updatedForm = makeForm("Jane")

		rerenderWith(updatedForm)

		await waitFor(() => {
			const field = ref.current!.getField("name")
			expect(field.defaultValue).toBe("Jane")
			expect(ref.current!.getErrors("name")).toHaveLength(0)
			expect(ref.current!.isDirty()).toBe(false)
			expect(ref.current!.isTouched()).toBe(false)
		})
	})

	it("full form validate reports errors for multiple fields", async () => {
		const { ref } = renderHookHarness()

		// Intentionally set email to an invalid value (missing "@") before validating
		await act(async () => {
			await ref.current!.setField("contact.email", "no-at-sign")
		})

		await waitFor(() => {
			const allErrors = ref.current!.getErrors()
			// email should be present in errors
			expect(allErrors.some((e: ErrorEntry) => e.name === "contact.email")).toBe(true)
		})
	})

	it("ignores stale async validation results for the same field", async () => {
		const asyncForm = defineForm({
			name: { label: "Name", defaultValue: "Joe", validate: delayed("Async required", 30) },
		})

		type AsyncForm = typeof asyncForm

		const HookHarness = forwardRef<UseStandardSchemaReturn<AsyncForm> | null, { formDef: AsyncForm }>(
			function HookHarness(props, ref) {
				const api = useStandardSchema(props.formDef)
				useImperativeHandle(ref, () => api, [api])
				return null
			},
		)

		const ref = React.createRef<UseStandardSchemaReturn<AsyncForm> | null>()
		render(<HookHarness ref={ref} formDef={asyncForm} />)

		await act(async () => {
			const slow = ref.current!.setField("name", "")
			const fast = ref.current!.setField("name", "Grace")
			await fast
			await slow
		})

		await waitFor(() => {
			const field = ref.current!.getField("name")
			expect(field.defaultValue).toBe("Grace")
			expect(field.error).toBe("")
		})
	})

	it("resetForm invalidates in-flight validation updates", async () => {
		const asyncForm = defineForm({
			name: { label: "Name", defaultValue: "Joe", validate: delayed("Async required", 30) },
		})

		type AsyncForm = typeof asyncForm

		const HookHarness = forwardRef<UseStandardSchemaReturn<AsyncForm> | null, { formDef: AsyncForm }>(
			function HookHarness(props, ref) {
				const api = useStandardSchema(props.formDef)
				useImperativeHandle(ref, () => api, [api])
				return null
			},
		)

		const ref = React.createRef<UseStandardSchemaReturn<AsyncForm> | null>()
		render(<HookHarness ref={ref} formDef={asyncForm} />)

		await act(async () => {
			const pending = ref.current!.setField("name", "")
			ref.current!.resetForm()
			await pending
		})

		await waitFor(() => {
			const field = ref.current!.getField("name")
			expect(field.defaultValue).toBe("Joe")
			expect(field.error).toBe("")
			expect(ref.current!.isDirty()).toBe(false)
			expect(ref.current!.isTouched()).toBe(false)
		})
	})
	it("form definition changes drop in-flight validations from prior definitions", async () => {
		const firstForm = defineForm({
			name: { label: "Name", defaultValue: "Joe" as string, validate: delayed("Old required", 40) },
		})
		const secondForm = defineForm({
			name: { label: "Name", defaultValue: "Jane" as string, validate: delayed("New required", 0) },
		})

		type AsyncForm = typeof firstForm

		const HookHarness = forwardRef<UseStandardSchemaReturn<AsyncForm> | null, { formDef: AsyncForm }>(
			function HookHarness(props, ref) {
				const api = useStandardSchema(props.formDef)
				useImperativeHandle(ref, () => api, [api])
				return null
			},
		)

		const ref = React.createRef<UseStandardSchemaReturn<AsyncForm> | null>()
		const view = render(<HookHarness ref={ref} formDef={firstForm} />)

		await act(async () => {
			const pending = ref.current!.setField("name", "")
			view.rerender(<HookHarness ref={ref} formDef={secondForm} />)
			await pending
		})

		await waitFor(() => {
			const field = ref.current!.getField("name")
			expect(field.defaultValue).toBe("Jane")
			expect(field.error).toBe("")
			expect(ref.current!.isDirty()).toBe(false)
			expect(ref.current!.isTouched()).toBe(false)
		})
	})
	it("handles validators that throw errors without crashing", async () => {
		const { ref } = renderHookHarness(makeThrowingForm())

		let thrown: unknown
		await act(async () => {
			try {
				await ref.current!.setField("name", "")
			} catch (error) {
				thrown = error
			}
		})

		expect(thrown).toBeUndefined()

		await waitFor(() => {
			const errs = ref.current!.getErrors("name")
			expect(errs).toHaveLength(1)
			expect(errs[0].error).toContain("Boom!")
		})
	})
})

describe("useStandardSchema getForm handlers (inline)", () => {
	it("onSubmit calls handler when form valid", async () => {
		const spy = vi.fn()
		renderFormHarness({ formDef: makeForm(), onSubmitSpy: spy })

		const user = userEvent.setup()
		const email = screen.getByLabelText("Email") as HTMLInputElement
		await user.type(email, "user@example.com")

		const formEl = screen.getByTestId("form") as HTMLFormElement
		fireEvent.submit(formEl)

		await waitFor(() => expect(spy).toHaveBeenCalled())
		const calledWith = spy.mock.calls[0][0]
		expect(calledWith).toHaveProperty("name")
		expect(calledWith).toHaveProperty("contact.email")
		expect(calledWith["contact.email"]).toBe("user@example.com")
	})

	it("successful submit resets form state and clears flags", async () => {
		const spy = vi.fn()
		const { ref } = renderFormHarness({ formDef: makeForm(), onSubmitSpy: spy })

		const user = userEvent.setup()
		const nameInput = screen.getByLabelText("Name") as HTMLInputElement
		const emailInput = screen.getByLabelText("Email") as HTMLInputElement

		await user.clear(nameInput)
		await user.type(nameInput, "Janet")
		fireEvent.blur(nameInput)

		await waitFor(() => {
			const field = ref.current!.getField("name")
			expect(field.defaultValue).toBe("Janet")
			expect(ref.current!.isDirty()).toBe(true)
			expect(ref.current!.isTouched()).toBe(true)
		})

		await user.type(emailInput, "janet@example.com")

		const formEl = screen.getByTestId("form") as HTMLFormElement
		fireEvent.submit(formEl)

		await waitFor(() => {
			expect(spy).toHaveBeenCalled()
			const field = ref.current!.getField("name")
			expect(field.defaultValue).toBe("Joe")
			expect(ref.current!.isDirty()).toBe(false)
			expect(ref.current!.isTouched()).toBe(false)
		})
	})

	it("onSubmit blocks invalid forms and reports validation errors", async () => {
		const spy = vi.fn()
		const invalidDefaultsForm = makeForm("")
		const { ref } = renderFormHarness({ formDef: invalidDefaultsForm, onSubmitSpy: spy })

		const formEl = screen.getByTestId("form") as HTMLFormElement
		fireEvent.submit(formEl)

		await waitFor(() => {
			expect(spy).not.toHaveBeenCalled()
			expect(ref.current!.getErrors()).toEqual([
				{ name: "name", error: "Required", label: "Name" },
				{ name: "contact.email", error: "Invalid email", label: "Email" },
			])
		})
	})

	it("failed submit keeps current values and interaction state", async () => {
		const spy = vi.fn()
		const { ref } = renderFormHarness({ formDef: makeForm(), onSubmitSpy: spy })

		const user = userEvent.setup()
		const nameInput = screen.getByLabelText("Name") as HTMLInputElement
		await user.clear(nameInput)
		await user.type(nameInput, "Janet")
		fireEvent.blur(nameInput)

		await waitFor(() => {
			expect(ref.current!.getField("name").defaultValue).toBe("Janet")
			expect(ref.current!.isDirty("name")).toBe(true)
			expect(ref.current!.isTouched("name")).toBe(true)
		})

		const formEl = screen.getByTestId("form") as HTMLFormElement
		fireEvent.submit(formEl)

		await waitFor(() => {
			expect(spy).not.toHaveBeenCalled()
			expect(ref.current!.getField("name").defaultValue).toBe("Janet")
			expect(ref.current!.isDirty("name")).toBe(true)
			expect(ref.current!.isTouched("name")).toBe(true)
			expect(ref.current!.getErrors("contact.email")).toEqual([
				{ name: "contact.email", error: "Invalid email", label: "Email" },
			])
		})
	})
	it("onSubmit retains programmatic updates when no DOM interaction occurs", async () => {
		const spy = vi.fn()
		const { ref } = renderFormHarness({ formDef: makeForm(), onSubmitSpy: spy })

		await act(async () => {
			await ref.current!.setField("name", "Sally")
			await ref.current!.setField("contact.email", "sally@example.com")
		})

		const formEl = screen.getByTestId("form") as HTMLFormElement
		fireEvent.submit(formEl)

		await waitFor(() => expect(spy).toHaveBeenCalled())
		const calledWith = spy.mock.calls[0][0]
		expect(calledWith["name"]).toBe("Sally")
		expect(calledWith["contact.email"]).toBe("sally@example.com")
	})

	it("onSubmit prefers interacted DOM values even when they match defaults", async () => {
		const spy = vi.fn()
		const { ref } = renderFormHarness({ formDef: makeForm(), onSubmitSpy: spy })

		await act(async () => {
			await ref.current!.setField("name", "Sally")
			await ref.current!.setField("contact.email", "sally@example.com")
		})

		const user = userEvent.setup()
		const nameInput = screen.getByLabelText("Name") as HTMLInputElement

		await user.click(nameInput)
		await user.clear(nameInput)
		await user.type(nameInput, "Joe")

		const formEl = screen.getByTestId("form") as HTMLFormElement
		fireEvent.submit(formEl)

		await waitFor(() => expect(spy).toHaveBeenCalled())
		const calledWith = spy.mock.calls[0][0]
		expect(calledWith["name"]).toBe("Joe")
	})

	it("submit validation ignores stale batch results after newer field validation", async () => {
		const spy = vi.fn()
		const asyncForm = defineForm({
			name: { label: "Name", defaultValue: "Joe", validate: delayed("Async required", 30) },
		})

		type AsyncForm = typeof asyncForm

		const FormHarness = forwardRef<
			UseStandardSchemaReturn<AsyncForm> | null,
			{ formDef: AsyncForm; onSubmitSpy: (data: Record<string, unknown>) => void }
		>(function FormHarness(props, ref) {
			const api = useStandardSchema(props.formDef)
			const handlers = api.getForm((values) => props.onSubmitSpy(values as Record<string, unknown>))

			useImperativeHandle(ref, () => api, [api])

			const nameField = api.getField("name")

			return (
				<form
					data-testid="async-form"
					onSubmit={handlers.onSubmit}
					onFocus={handlers.onFocus}
					onBlur={handlers.onBlur}
					onReset={handlers.onReset}
				>
					<label htmlFor="async-name">{nameField.label}</label>
					<input id="async-name" name="name" defaultValue={nameField.defaultValue} />
					<button type="submit">Submit</button>
				</form>
			)
		})

		const ref = React.createRef<UseStandardSchemaReturn<AsyncForm> | null>()
		render(<FormHarness ref={ref} formDef={asyncForm} onSubmitSpy={spy} />)

		const user = userEvent.setup()
		const nameInput = screen.getByLabelText("Name") as HTMLInputElement
		await user.clear(nameInput)

		const formEl = screen.getByTestId("async-form") as HTMLFormElement
		fireEvent.submit(formEl)

		await act(async () => {
			await ref.current!.setField("name", "Grace")
		})

		await waitFor(() => {
			const field = ref.current!.getField("name")
			expect(field.defaultValue).toBe("Grace")
			expect(field.error).toBe("")
			expect(spy).not.toHaveBeenCalled()
		})
	})
	it("onFocus sets touched and clears error", async () => {
		const spy = vi.fn()
		const { ref } = renderFormHarness({ formDef: makeForm(), onSubmitSpy: spy })

		// create an error by setting invalid value
		await act(async () => {
			await ref.current!.setField("name", "")
		})

		await waitFor(() => {
			const errs = ref.current!.getErrors("name")
			expect(errs.length).toBe(1)
		})

		const name = screen.getByLabelText("Name") as HTMLInputElement
		fireEvent.focus(name)

		await waitFor(() => {
			const errs = ref.current!.getErrors("name")
			expect(errs.length).toBe(0)
			expect(ref.current!.isTouched("name")).toBe(true)
		})
	})

	
	it("onFocus clears existing errors for nested fields inside the form", async () => {
		const spy = vi.fn()
		const { ref } = renderFormHarness({ formDef: makeForm(), onSubmitSpy: spy })

		await act(async () => {
			await ref.current!.setField("contact.email", "invalid")
		})

		await waitFor(() => {
			const errs = ref.current!.getErrors("contact.email")
			expect(errs.length).toBe(1)
			expect(errs[0].error).toBe("Invalid email")
		})

		const emailInput = screen.getByLabelText("Email") as HTMLInputElement
		fireEvent.focus(emailInput)

		await waitFor(() => {
			const errs = ref.current!.getErrors("contact.email")
			expect(errs.length).toBe(0)
			expect(ref.current!.isTouched("contact.email")).toBe(true)
		})
	})
	it("onBlur updates data and sets dirty when changed", async () => {
		const spy = vi.fn()
		const { ref } = renderFormHarness({ formDef: makeForm(), onSubmitSpy: spy })

		const user = userEvent.setup()
		const name = screen.getByLabelText("Name") as HTMLInputElement
		await user.clear(name)
		await user.type(name, "Janet")
		fireEvent.blur(name)

		await waitFor(() => {
			const field = ref.current!.getField("name")
			expect(field.defaultValue).toBe("Janet")
			expect(ref.current!.isDirty("name")).toBe(true)
			expect(ref.current!.isTouched("name")).toBe(true)
		})
	})

	
	it("onBlur validates nested field values from form inputs", async () => {
		const spy = vi.fn()
		const { ref } = renderFormHarness({ formDef: makeForm(), onSubmitSpy: spy })

		const user = userEvent.setup()
		const emailInput = screen.getByLabelText("Email") as HTMLInputElement
		await user.clear(emailInput)
		await user.type(emailInput, "not-an-email")
		fireEvent.blur(emailInput)

		await waitFor(() => {
			const field = ref.current!.getField("contact.email")
			expect(field.defaultValue).toBe("not-an-email")
			expect(field.error).toBe("Invalid email")
			expect(ref.current!.isDirty("contact.email")).toBe(true)
			expect(ref.current!.isTouched("contact.email")).toBe(true)
		})
	})
	it("onBlur clears dirty when value reverts to default", async () => {
		const spy = vi.fn()
		const { ref } = renderFormHarness({ formDef: makeForm(), onSubmitSpy: spy })

		const user = userEvent.setup()
		const name = screen.getByLabelText("Name") as HTMLInputElement

		await user.clear(name)
		await user.type(name, "Janet")
		fireEvent.blur(name)

		await waitFor(() => {
			expect(ref.current!.isDirty("name")).toBe(true)
		})

		await user.click(name)
		await user.clear(name)
		await user.type(name, "Joe")
		fireEvent.blur(name)

		await waitFor(() => {
			const field = ref.current!.getField("name")
			expect(field.defaultValue).toBe("Joe")
			expect(ref.current!.isDirty("name")).toBe(false)
		})
	})

	
	it("onFocus and onBlur ignore non-field elements inside the form", async () => {
		const spy = vi.fn()
		const { ref } = renderFormHarness({ formDef: makeForm(), onSubmitSpy: spy })

		const submitButton = screen.getByRole("button", { name: "Submit" }) as HTMLButtonElement
		fireEvent.focus(submitButton)
		fireEvent.blur(submitButton)

		await waitFor(() => {
			expect(ref.current!.isTouched()).toBe(false)
			expect(ref.current!.isDirty()).toBe(false)
			expect(ref.current!.getErrors()).toEqual([])
		})
	})
	it("watchValues notifies subscribers only when tracked fields change", async () => {
		const { ref } = renderHookHarness()

		const allSpy = vi.fn()
		const emailSpy = vi.fn()

		const unsubscribeAll = ref.current!.watchValues(allSpy)
		const unsubscribeEmail = ref.current!.watchValues("contact.email", emailSpy)

		await act(async () => {
			await ref.current!.setField("name", "Alice")
		})

		await waitFor(() => {
			expect(allSpy).toHaveBeenCalledTimes(1)
			expect(allSpy.mock.calls[0][0]["name"]).toBe("Alice")
		})

		await waitFor(() => {
			expect(emailSpy).toHaveBeenCalledTimes(0)
		})

		await act(async () => {
			await ref.current!.setField("contact.email", "alice@example.com")
		})

		await waitFor(() => {
			expect(allSpy).toHaveBeenCalledTimes(2)
			expect(allSpy.mock.calls[1][0]["contact.email"]).toBe("alice@example.com")
		})

		await waitFor(() => {
			expect(emailSpy).toHaveBeenCalledTimes(1)
			expect(emailSpy.mock.calls[0][0]).toEqual({ "contact.email": "alice@example.com" })
		})

		unsubscribeAll()
		unsubscribeEmail()

		const allCallCount = allSpy.mock.calls.length
		await act(async () => {
			await ref.current!.setField("name", "Bob")
		})

		await waitFor(() => {
			expect(allSpy).toHaveBeenCalledTimes(allCallCount)
			expect(emailSpy).toHaveBeenCalledTimes(1)
		})
	})

	it("watchValues returns subsets keyed by the requested fields", async () => {
		const { ref } = renderHookHarness()

		const subsetSpy = vi.fn()
		ref.current!.watchValues(["name", "contact.email"], subsetSpy)

		await act(async () => {
			await ref.current!.setField("name", "Trudy")
		})

		await waitFor(() => {
			expect(subsetSpy).toHaveBeenCalledTimes(1)
			expect(subsetSpy.mock.calls[0][0]).toEqual({ name: "Trudy", "contact.email": "" })
		})

		const nameSpy = vi.fn()
		ref.current!.watchValues("name", nameSpy)

		await act(async () => {
			await ref.current!.setField("contact.email", "trudy@example.com")
		})

		await waitFor(() => {
			expect(nameSpy).toHaveBeenCalledTimes(0)
		})
	})

	it("watchValues does not notify subscribers for no-op value updates", async () => {
		const { ref } = renderHookHarness()

		const spy = vi.fn()
		ref.current!.watchValues(spy)

		await act(async () => {
			await ref.current!.setField("name", "Joe")
			await ref.current!.setField("name", "Alice")
		})

		await waitFor(() => {
			expect(spy).toHaveBeenCalledTimes(1)
			expect(spy.mock.calls[0][0]["name"]).toBe("Alice")
		})
	})

	it("watchValues is not triggered by setError because values do not change", async () => {
		const { ref } = renderHookHarness()

		const spy = vi.fn()
		ref.current!.watchValues(spy)

		act(() => {
			ref.current!.setError("name", "Manual error")
		})

		await act(async () => {
			await ref.current!.setField("name", "Alice")
		})

		await waitFor(() => {
			expect(spy).toHaveBeenCalledTimes(1)
			expect(spy.mock.calls[0][0]["name"]).toBe("Alice")
		})
	})
	it("onReset restores defaults and clears flags", async () => {
		const spy = vi.fn()
		const { ref } = renderFormHarness({ formDef: makeForm(), onSubmitSpy: spy })

		const user = userEvent.setup()
		const name = screen.getByLabelText("Name") as HTMLInputElement
		await user.clear(name)
		await user.type(name, "X")
		fireEvent.blur(name)

		const formEl = screen.getByTestId("form") as HTMLFormElement
		fireEvent.reset(formEl)

		await waitFor(() => {
			const field = ref.current!.getField("name")
			expect(field.defaultValue).toBe("Joe")
			expect(ref.current!.isDirty()).toBe(false)
			expect(ref.current!.isTouched()).toBe(false)
		})
	})
})











