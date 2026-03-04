import { type FocusEvent, type SubmitEvent, useCallback, useEffect, useMemo, useReducer, useRef } from "react"
import { compileFormModel } from "./form-model"
import { createFormState, formReducer } from "./form-reducer"
import {
	defineForm,
	ensureTouched,
	isFlagSet,
	resolveManualErrorMessage,
	toFormData,
	toInputString,
} from "./helpers"
import type {
	DotPaths,
	ErrorEntry,
	ErrorInfo,
	FieldData,
	FieldDefinition,
	Flags,
	FormDefinition,
	FormSnapshot,
	FormValues,
	FormWatchEntry,
	TypeFromDefinition,
	UseStandardSchemaReturn,
	WatchValuesCallback,
} from "./types"
import { useWatchValueSubscriptions } from "./use-watch-value-subscriptions"
import { createValidationRuntime } from "./validation-runtime"

function useStandardSchema<T extends FormDefinition>(formDefinition: T): UseStandardSchemaReturn<T> {
	type FieldKey = DotPaths<T>

	const model = useMemo(() => compileFormModel(formDefinition), [formDefinition])

	const [state, dispatch] = useReducer(formReducer, model.initialValues as FormValues, createFormState)

	const stateRef = useRef(state)
	const watchEntriesRef = useRef<Set<FormWatchEntry>>(new Set())
	const previousDataRef = useRef<FormValues>(model.initialValues)
	const domInteractedRef = useRef<Flags>({})

	const initialValueStrings = useMemo(() => {
		const entries: FormValues = {}
		for (const [key, value] of Object.entries(model.initialValues)) {
			entries[key] = toInputString(value)
		}
		return entries
	}, [model.initialValues])

	const validationRuntime = useMemo(
		() => createValidationRuntime(model.fieldKeys as string[], model.validators),
		[model.fieldKeys, model.validators],
	)

	useEffect(() => {
		stateRef.current = state
	}, [state])

	const resetState = useCallback(
		(nextValues: FormValues, syncPreviousData = false) => {
			dispatch({ type: "reset", values: nextValues })
			domInteractedRef.current = {}
			validationRuntime.invalidateAll()

			if (syncPreviousData) {
				previousDataRef.current = nextValues
			}
		},
		[validationRuntime],
	)

	useEffect(() => {
		resetState(model.initialValues, true)
	}, [model.initialValues, resetState])

	useWatchValueSubscriptions(state.values, watchEntriesRef, previousDataRef)

	const getFieldDefinition = useCallback(
		(field: string): FieldDefinition => {
			const def = model.fieldDefs[field]
			if (!def) {
				throw new Error(`Field "${field}" not found`)
			}
			return def
		},
		[model.fieldDefs],
	)

	const markDomInteracted = useCallback((field: string) => {
		domInteractedRef.current = ensureTouched(domInteractedRef.current, field)
	}, [])

	const clearDomInteracted = useCallback((field: string) => {
		if (!domInteractedRef.current[field]) return

		const nextInteracted = { ...domInteractedRef.current }
		delete nextInteracted[field]
		domInteractedRef.current = nextInteracted
	}, [])

	const validateField = useCallback(
		async (field: string, value: string) => {
			const result = await validationRuntime.validateField(field, value)
			if (result.stale) {
				return false
			}

			dispatch({ type: "setFieldError", field, message: result.message })
			return result.message === ""
		},
		[validationRuntime],
	)

	const commitFieldValue = useCallback(
		async (field: string, value: string, domInteraction: "mark" | "clear") => {
			const initialValue = initialValueStrings[field] ?? ""

			if (domInteraction === "mark") {
				markDomInteracted(field)
			} else {
				clearDomInteracted(field)
			}

			dispatch({
				type: "commitFieldValue",
				field,
				value,
				initialValue,
				domInteraction,
			})

			await validateField(field, value).catch(console.error)
		},
		[clearDomInteracted, initialValueStrings, markDomInteracted, validateField],
	)

	const validateForm = useCallback(
		async (values?: FormValues) => {
			const sourceValues = values ?? stateRef.current.values
			const result = await validationRuntime.validateForm(sourceValues)
			if (result.stale) {
				return false
			}

			const nextErrors = validationRuntime.buildErrorsFromBatch(
				stateRef.current.errors,
				result.errors,
				result.tokensForRun,
			)
			dispatch({ type: "setAllErrors", errors: nextErrors })

			return result.isValid
		},
		[validationRuntime],
	)

	const resolveSubmissionValues = useCallback(
		(formEl: HTMLFormElement, stateValues: FormValues): FormValues => {
			const submissionEntries = new Map<string, string>()
			for (const [key, rawValue] of new FormData(formEl).entries()) {
				if (Object.hasOwn(model.fieldDefs, key) && !submissionEntries.has(key)) {
					submissionEntries.set(key, typeof rawValue === "string" ? rawValue : String(rawValue))
				}
			}

			const updates: FormValues = {}
			let hasChanges = false

			for (const key of model.fieldKeys) {
				const stateValue = stateValues[key] ?? ""
				const stateString = toInputString(stateValue)
				const initialString = initialValueStrings[key] ?? ""
				const submissionValue = submissionEntries.get(key)
				let resolvedValue = stateValue

				if (submissionValue !== undefined) {
					const shouldPreferState =
						stateString !== initialString &&
						submissionValue === initialString &&
						!domInteractedRef.current[key]

					if (!shouldPreferState) {
						resolvedValue = submissionValue
					}
				}

				if (!Object.is(stateValue, resolvedValue)) {
					updates[key] = resolvedValue
					hasChanges = true
				}
			}

			return hasChanges ? { ...stateValues, ...updates } : stateValues
		},
		[model.fieldDefs, model.fieldKeys, initialValueStrings],
	)

	const resetForm = useCallback(() => {
		resetState(model.initialValues)
	}, [model.initialValues, resetState])

	const getForm = useCallback(
		(onSubmitHandler: (data: TypeFromDefinition<typeof formDefinition>) => void) => {
			const onSubmit = async (e: SubmitEvent<HTMLFormElement>) => {
				const formEl = e.currentTarget as HTMLFormElement
				e.preventDefault()

				const currentValues = stateRef.current.values
				const finalValues = resolveSubmissionValues(formEl, currentValues)
				if (!Object.is(finalValues, currentValues)) {
					dispatch({ type: "mergeResolvedSubmissionValues", values: finalValues })
				}

				const isValid = await validateForm(finalValues)
				if (isValid) {
					onSubmitHandler(finalValues as TypeFromDefinition<typeof formDefinition>)
					resetForm()
					formEl.reset()
				}
			}

			const onFocus = (e: FocusEvent<HTMLFormElement>) => {
				const field = e.target.name
				if (!field || !Object.hasOwn(model.fieldDefs, field)) return

				markDomInteracted(field)
				dispatch({ type: "focusField", field })
			}

			const onBlur = async (e: FocusEvent<HTMLFormElement>) => {
				const field = e.target.name
				if (!field || !Object.hasOwn(model.fieldDefs, field)) return

				await commitFieldValue(field, e.target.value, "mark")
			}

			const onReset = () => resetForm()

			return { onSubmit, onFocus, onBlur, onReset }
		},
		[commitFieldValue, markDomInteracted, model.fieldDefs, resetForm, resolveSubmissionValues, validateForm],
	)

	const getField = useCallback(
		(name: FieldKey): FieldData => {
			const key = name as string
			const def = getFieldDefinition(key)
			const describedById = `${key}-description`
			const errorId = `${key}-error`

			const { validate: _validate, ...fieldDef } = def

			return {
				...fieldDef,
				name: key,
				defaultValue: state.values[key] ?? "",
				error: state.errors[key] ?? "",
				touched: state.touched[key] ?? false,
				dirty: state.dirty[key] ?? false,
				describedById,
				errorId,
			}
		},
		[getFieldDefinition, state.dirty, state.errors, state.touched, state.values],
	)

	const setField = useCallback(
		async (name: FieldKey, value: string) => {
			const field = name as string
			getFieldDefinition(field)
			await commitFieldValue(field, value, "clear")
		},
		[commitFieldValue, getFieldDefinition],
	)

	const setError = useCallback(
		(name: FieldKey, info: ErrorInfo) => {
			const field = name as string
			getFieldDefinition(field)

			const message = resolveManualErrorMessage(info)
			dispatch({ type: "setFieldError", field, message })
		},
		[getFieldDefinition],
	)

	const getErrors = useCallback(
		(name?: FieldKey): ErrorEntry[] => {
			if (name) {
				const key = name as string
				const def = getFieldDefinition(key)
				const error = state.errors[key]
				if (!error) return []
				return [
					{
						name: key,
						error,
						label: def.label,
					},
				]
			}

			const errorEntries: ErrorEntry[] = []
			for (const key of model.fieldKeys) {
				const error = state.errors[key]
				if (error) {
					const def = getFieldDefinition(key)
					errorEntries.push({
						name: key,
						error,
						label: def.label,
					})
				}
			}
			return errorEntries
		},
		[getFieldDefinition, model.fieldKeys, state.errors],
	)

	const isTouched = useCallback((name?: FieldKey) => isFlagSet(state.touched, name as string | undefined), [state.touched])

	const isDirty = useCallback((name?: FieldKey) => isFlagSet(state.dirty, name as string | undefined), [state.dirty])

	const watchValues = useCallback(
		((
			first: FieldKey | readonly FieldKey[] | ((values: FormSnapshot<T>) => void),
			second?: (values: FormSnapshot<T>) => void,
		) => {
			const hasExplicitTargets = typeof first !== "function"
			const targets = hasExplicitTargets ? (Array.isArray(first) ? [...first] : [first]) : undefined
			const callback = hasExplicitTargets ? second : (first as (values: FormSnapshot<T>) => void)

			if (typeof callback !== "function") {
				throw new Error("watchValues requires a callback")
			}

			if (targets) {
				for (const field of targets) {
					getFieldDefinition(field as string)
				}
			}

			const entry: FormWatchEntry<string> = {
				fields: targets?.map((key) => key as string),
				callback: (values) => {
					callback(values as FormSnapshot<T>)
				},
			}

			watchEntriesRef.current.add(entry)
			return () => {
				watchEntriesRef.current.delete(entry)
			}
		}) as WatchValuesCallback<T>,
		[getFieldDefinition],
	)

	return {
		resetForm,
		getForm,
		getField,
		getErrors,
		setField,
		setError,
		isTouched,
		isDirty,
		watchValues,
	}
}

export { useStandardSchema, defineForm, toFormData }
export type {
	ErrorEntry,
	ErrorInfo,
	FieldData,
	FieldDefinition,
	FormDefinition,
	TypeFromDefinition,
	UseStandardSchemaReturn,
	WatchValuesCallback,
} from "./types"
